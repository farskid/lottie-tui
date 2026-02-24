import { DotLottie } from '@lottiefiles/dotlottie-web';
import { createCanvas } from 'canvas';
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
    this.canvas = createCanvas(this.config.width, this.config.height);
    this.ctx = this.canvas.getContext('2d');
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
    this.player = new DotLottie({
      canvas: this.canvas,
      autoplay: false,
      loop: false,
      useFrameInterpolation: true,
    });

    // Apply custom FPS if specified
    if (this.config.fps) {
      // Note: This might need adjustment based on actual DotLottie API
      this.player.setRenderConfig({
        ...this.player.renderConfig,
        devicePixelRatio: 1,
      });
    }

    // Apply speed
    if (this.config.speed && this.config.speed !== 1.0) {
      this.player.setSpeed(this.config.speed);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Animation loading timed out'));
      }, 10000);

      this.player!.addEventListener('ready', () => {
        clearTimeout(timeout);
        console.log(`✅ Animation loaded: ${this.getTotalFrames()} frames, ${this.getDuration().toFixed(1)}s`);
        resolve();
      });

      this.player!.addEventListener('loadError', (event) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to load animation: ${String(event)}`));
      });

      // Load the animation
      if (Buffer.isBuffer(animationData)) {
        throw new Error('.lottie files not yet supported, use .json files');
      } else {
        // Store animation metadata for fallback frame counting
        if (animationData && typeof animationData === 'object') {
          this.animationMeta = {
            ip: animationData.ip,
            op: animationData.op,
            fr: animationData.fr,
          };
        }
        // JSON data
        this.player!.load({ data: animationData });
      }
    });
  }

  /**
   * Render a specific frame
   */
  renderFrame(frameNumber: number): ImageData {
    if (!this.player) {
      throw new Error('No animation loaded');
    }

    // Clear canvas with transparent background
    this.ctx.clearRect(0, 0, this.config.width, this.config.height);

    // Set frame
    this.player.setFrame(frameNumber);

    // Force a draw - try public methods first
    // Note: _draw is private, so we'll rely on setFrame to trigger rendering
    // The canvas should be updated automatically when setFrame is called

    // Extract image data
    return this.ctx.getImageData(0, 0, this.config.width, this.config.height);
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