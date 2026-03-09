import { DotLottie, type RenderSurface } from '@lottiefiles/dotlottie-web';
import fs from 'fs';
import path from 'path';

export interface RendererConfig {
  width: number;
  height: number;
  fps?: number;
  speed?: number;
}

export interface AnimationFrame {
  frameNumber: number;
  imageData: ImageData;
}

/**
 * ThorVG-based Lottie renderer using @lottiefiles/dotlottie-web
 */
export class ThorVGRenderer {
  private player: DotLottie | null = null;
  private canvas: any; // Node.js Canvas
  private ctx: any; // Canvas 2D Context
  private config: RendererConfig;
  private animationMeta: { ip?: number; op?: number; fr?: number } = {};

  constructor(config: RendererConfig) {
    this.config = config;
    this.setupCanvas();
  }

  private setupCanvas(): void {
    // Use a lightweight RenderSurface instead of node-canvas.
    // DotLottie renders into its internal WASM buffer; we read pixels
    // via player.buffer rather than canvas.getContext('2d').getImageData().
    this.canvas = {
      width: this.config.width,
      height: this.config.height,
    } as RenderSurface;
    this.ctx = null; // Not needed — we read from player.buffer
  }

  /**
   * Load Lottie animation from file
   */
  async loadAnimation(filePath: string): Promise<void> {
    const resolvedPath = path.resolve(filePath);
    
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Animation file not found: ${resolvedPath}`);
    }

    const ext = path.extname(filePath).toLowerCase();
    
    let animationData: any;
    
    if (ext === '.json') {
      // Load Lottie JSON
      const content = fs.readFileSync(resolvedPath, 'utf8');
      animationData = JSON.parse(content);
    } else if (ext === '.lottie') {
      // Load .lottie file (DotLottie format)
      const buffer = fs.readFileSync(resolvedPath);
      // DotLottie can load from buffer
      animationData = buffer;
    } else {
      throw new Error(`Unsupported file format: ${ext}. Use .json or .lottie files.`);
    }

    return this.loadAnimationData(animationData);
  }

  /**
   * Load animation from data
   */
  async loadAnimationData(animationData: any): Promise<void> {
    const isDotLottie = Buffer.isBuffer(animationData);

    // Store animation metadata for fallback frame counting (JSON only)
    if (!isDotLottie && animationData && typeof animationData === 'object') {
      this.animationMeta = {
        ip: animationData.ip,
        op: animationData.op,
        fr: animationData.fr,
      };
    }

    // Pass data in the constructor so it loads after WASM initializes.
    // Calling player.load() separately races with async WASM init.
    const opts: Record<string, any> = {
      canvas: this.canvas,
      autoplay: false,
      loop: false,
      useFrameInterpolation: true,
      renderConfig: {
        devicePixelRatio: 1,
      },
      speed: this.config.speed || 1.0,
    };

    if (isDotLottie) {
      // DotLottie expects an ArrayBuffer for .lottie files
      opts.data = (animationData as Buffer).buffer;
    } else {
      opts.data = animationData;
    }

    this.player = new DotLottie(opts);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Animation loading timed out'));
      }, 10000);

      this.player!.addEventListener('load', () => {
        clearTimeout(timeout);
        console.log(`✅ Animation loaded: ${this.getTotalFrames()} frames, ${this.getDuration().toFixed(1)}s`);
        resolve();
      });

      this.player!.addEventListener('loadError', (event) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to load animation: ${String(event)}`));
      });
    });
  }

  /**
   * Render a specific frame
   */
  renderFrame(frameNumber: number): ImageData {
    if (!this.player) {
      throw new Error('No animation loaded');
    }

    // Set frame — this renders into the internal WASM buffer
    this.player.setFrame(frameNumber);

    // Read pixels from the WASM buffer
    const buf = this.player.buffer;
    if (!buf || buf.length === 0) {
      throw new Error(`DotLottie buffer is empty for frame ${frameNumber}`);
    }

    // Create ImageData from the raw RGBA pixel buffer
    const { width, height } = this.config;
    const clamped = new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.byteLength);
    // Create ImageData-compatible object without node-canvas dependency
    return {
      data: clamped,
      width,
      height,
      colorSpace: 'srgb'
    } as ImageData;
  }

  /**
   * Render all frames
   */
  renderAllFrames(): AnimationFrame[] {
    if (!this.player) {
      throw new Error('No animation loaded');
    }

    const totalFrames = this.getTotalFrames();
    const frames: AnimationFrame[] = [];

    for (let i = 0; i < totalFrames; i++) {
      const imageData = this.renderFrame(i);
      frames.push({
        frameNumber: i,
        imageData,
      });
    }

    return frames;
  }

  /**
   * Get total frame count
   */
  getTotalFrames(): number {
    if (!this.player) return 0;
    
    const totalFrames = this.player.totalFrames;
    if (totalFrames > 0) {
      return totalFrames;
    }

    // Fallback: use raw animation metadata (ip/op)
    if (this.animationMeta.op != null && this.animationMeta.ip != null) {
      return Math.round(this.animationMeta.op - this.animationMeta.ip);
    }

    // Last resort: calculate from duration and FPS
    const duration = this.player.duration;
    const fps = this.config.fps || 60;
    return Math.ceil(duration * fps);
  }

  /**
   * Get animation duration in seconds
   */
  getDuration(): number {
    const d = this.player?.duration || 0;
    if (d > 0) return d;
    // Fallback from metadata
    const frames = this.getTotalFrames();
    const fps = this.animationMeta.fr || this.config.fps || 60;
    return frames / fps;
  }

  /**
   * Get native frame rate
   */
  getFrameRate(): number {
    // Try to extract from animation data or use config
    return this.config.fps || this.animationMeta.fr || 60;
  }

  /**
   * Get animation dimensions
   */
  getDimensions(): { width: number; height: number } {
    return {
      width: this.config.width,
      height: this.config.height,
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.player) {
      this.player.destroy();
      this.player = null;
    }
  }
}