import sharp from 'sharp';

export interface KittyImageOptions {
  width: number;
  height: number;
  imageId?: number;
  placement?: 'new' | 'replace';
  deleteAfter?: boolean;
}

/**
 * Send image data to Kitty terminal using the graphics protocol
 * Reference: https://sw.kovidgoyal.net/kitty/graphics-protocol/
 */
export class KittyGraphics {
  private imageCounter = 1;
  private uploadedImages = new Set<number>();

  /**
   * Upload image data as PNG to Kitty terminal
   */
  async uploadImageData(imageData: ImageData, options: KittyImageOptions): Promise<number> {
    const { width, height } = options;
    const imageId = options.imageId || this.imageCounter++;

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

    // Build Kitty graphics escape sequence
    // Format: \x1b_G<options>;<base64data>\x1b\
    const params = [
      'a=T', // action = transmit and display
      'f=100', // format = PNG
      `s=${width}`, // source width
      `v=${height}`, // source height
      `i=${imageId}`, // image id
      'q=2', // quiet — suppress terminal responses
    ];

    if (options.placement === 'replace') {
      params.push('a=p'); // action = place (replace existing)
    }

    const escapeSequence = `\x1b_G${params.join(',')};${base64Data}\x1b\\`;
    
    // Send to terminal
    process.stdout.write(escapeSequence);
    
    this.uploadedImages.add(imageId);
    return imageId;
  }

  /**
   * Upload all frames as an animation
   * More efficient for looping animations
   */
  async uploadAnimation(frames: ImageData[], options: Omit<KittyImageOptions, 'imageId'>): Promise<number> {
    const animationId = this.imageCounter++;
    const { width, height } = options;

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const rgbaBuffer = Buffer.from(frame.data);
      const pngBuffer = await sharp(rgbaBuffer, {
        raw: {
          width,
          height,
          channels: 4,
        }
      }).png().toBuffer();

      const base64Data = pngBuffer.toString('base64');

      // First frame creates the animation, subsequent frames add to it
      const isFirstFrame = i === 0;
      const params = [
        isFirstFrame ? 'a=T' : 'a=f', // transmit or add frame
        'f=100', // PNG format
        `s=${width}`,
        `v=${height}`,
        `i=${animationId}`,
        'q=2', // quiet — suppress terminal responses
      ];

      if (!isFirstFrame) {
        params.push(`z=${i}`); // frame index
      }

      const escapeSequence = `\x1b_G${params.join(',')};${base64Data}\x1b\\`;
      process.stdout.write(escapeSequence);
    }

    this.uploadedImages.add(animationId);
    return animationId;
  }

  /**
   * Play uploaded animation
   */
  playAnimation(imageId: number, loops = 0): void {
    // Place animation with loop control
    const params = [
      'a=p', // place
      `i=${imageId}`, // image id
      'q=2', // quiet — suppress terminal responses
    ];

    if (loops > 0) {
      params.push(`L=${loops}`); // loop count
    }

    const escapeSequence = `\x1b_G${params.join(',')}\x1b\\`;
    process.stdout.write(escapeSequence);
  }

  /**
   * Delete specific image
   */
  deleteImage(imageId: number): void {
    const escapeSequence = `\x1b_Ga=d,i=${imageId},q=2\x1b\\`;
    process.stdout.write(escapeSequence);
    this.uploadedImages.delete(imageId);
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
   * Cleanup all images uploaded by this instance
   */
  cleanup(): void {
    for (const imageId of this.uploadedImages) {
      this.deleteImage(imageId);
    }
  }
}