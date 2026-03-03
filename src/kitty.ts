import sharp from 'sharp';

export interface KittyImageOptions {
  width: number;
  height: number;
  imageId?: number;
  placementId?: number;
  placement?: 'new' | 'replace';
  deleteAfter?: boolean;
}

/**
 * Send image data to Kitty terminal using the graphics protocol
 * Reference: https://sw.kovidgoyal.net/kitty/graphics-protocol/
 */
export class KittyGraphics {
  private imageCounter = 1;
  private placementCounter = 1;
  private uploadedImages = new Set<number>();

  /**
   * Upload image data as PNG to Kitty terminal
   */
  async uploadImageData(imageData: ImageData, options: KittyImageOptions): Promise<number> {
    const { width, height } = options;
    const imageId = options.imageId || this.imageCounter++;
    const placementId = options.placementId || this.placementCounter++;

    // Convert ImageData to PNG buffer
    const rgbaBuffer = Buffer.from(imageData.data);
    const pngBuffer = await sharp(rgbaBuffer, {
      raw: {
        width,
        height,
        channels: 4, // RGBA
      }
    }).png().toBuffer();

    // Encode PNG as base64
    const base64Data = pngBuffer.toString('base64');

    // Build Kitty graphics escape sequence based on placement strategy
    let escapeSequence: string;
    
    if (options.placement === 'replace') {
      // When replacing, we transmit new data and associate it with the same image id and placement id
      // This will replace the existing placement in-place
      const params = [
        'a=T', // action = transmit and display
        'f=100', // format = PNG
        `s=${width}`, // source width
        `v=${height}`, // source height
        `i=${imageId}`, // image id
        `p=${placementId}`, // placement id
        'C=1', // don't move cursor
        'q=2', // quiet — suppress terminal responses
      ];
      
      escapeSequence = `\x1b_G${params.join(',')};${base64Data}\x1b\\`;
    } else {
      // New placement - transmit and display
      const params = [
        'a=T', // action = transmit and display
        'f=100', // format = PNG
        `s=${width}`, // source width
        `v=${height}`, // source height
        `i=${imageId}`, // image id
        `p=${placementId}`, // placement id
        'C=1', // don't move cursor
        'q=2', // quiet — suppress terminal responses
      ];
      
      escapeSequence = `\x1b_G${params.join(',')};${base64Data}\x1b\\`;
    }
    
    // Send to terminal
    process.stdout.write(escapeSequence);
    
    this.uploadedImages.add(imageId);
    return imageId;
  }

  /**
   * Display an already transmitted image at current cursor position
   */
  displayImage(imageId: number, placementId?: number): void {
    const params = [
      'a=p', // action = place/display
      `i=${imageId}`, // image id
      'C=1', // don't move cursor
      'q=2', // quiet — suppress terminal responses
    ];

    if (placementId !== undefined) {
      params.push(`p=${placementId}`);
    }

    const escapeSequence = `\x1b_G${params.join(',')}\x1b\\`;
    process.stdout.write(escapeSequence);
  }

  /**
   * Replace a specific placement with new image data
   * This is the key method for smooth animation - same ids = in-place replacement
   */
  async replaceImageData(imageData: ImageData, imageId: number, placementId: number, width: number, height: number): Promise<void> {
    // Convert ImageData to PNG buffer
    const rgbaBuffer = Buffer.from(imageData.data);
    const pngBuffer = await sharp(rgbaBuffer, {
      raw: {
        width,
        height,
        channels: 4, // RGBA
      }
    }).png().toBuffer();

    // Encode PNG as base64
    const base64Data = pngBuffer.toString('base64');

    // Use transmit and display (a=T) with same image and placement IDs
    // This replaces the existing placement without flicker
    const params = [
      'a=T', // action = transmit and display
      'f=100', // format = PNG
      `s=${width}`, // source width
      `v=${height}`, // source height
      `i=${imageId}`, // same image id
      `p=${placementId}`, // same placement id
      'C=1', // don't move cursor
      'q=2', // quiet — suppress terminal responses
    ];
    
    const escapeSequence = `\x1b_G${params.join(',')};${base64Data}\x1b\\`;
    process.stdout.write(escapeSequence);
  }

  /**
   * Delete specific image by id
   */
  deleteImage(imageId: number): void {
    const escapeSequence = `\x1b_Ga=d,d=i,i=${imageId},q=2\x1b\\`;
    process.stdout.write(escapeSequence);
    this.uploadedImages.delete(imageId);
  }

  /**
   * Delete specific placement
   */
  deletePlacement(imageId: number, placementId: number): void {
    const escapeSequence = `\x1b_Ga=d,d=i,i=${imageId},p=${placementId},q=2\x1b\\`;
    process.stdout.write(escapeSequence);
  }

  /**
   * Clear all uploaded images
   */
  clearAll(): void {
    const escapeSequence = '\x1b_Ga=d,q=2\x1b\\';
    process.stdout.write(escapeSequence);
    this.uploadedImages.clear();
  }

  /**
   * Save cursor position
   */
  saveCursor(): void {
    process.stdout.write('\x1b[s');
  }

  /**
   * Restore cursor position
   */
  restoreCursor(): void {
    process.stdout.write('\x1b[u');
  }

  /**
   * Hide cursor
   */
  hideCursor(): void {
    process.stdout.write('\x1b[?25l');
  }

  /**
   * Show cursor
   */
  showCursor(): void {
    process.stdout.write('\x1b[?25h');
  }

  /**
   * Get next available image ID
   */
  getNextImageId(): number {
    return this.imageCounter++;
  }

  /**
   * Get next available placement ID
   */
  getNextPlacementId(): number {
    return this.placementCounter++;
  }

  /**
   * Cleanup all images uploaded by this instance
   */
  cleanup(): void {
    for (const imageId of this.uploadedImages) {
      this.deleteImage(imageId);
    }
    this.showCursor(); // Ensure cursor is visible
  }
}