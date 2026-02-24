import { ThorVGRenderer } from './renderer.js';
import { KittyGraphics } from './kitty.js';
import { getTerminalInfo, setupCleanupHandlers } from './terminal.js';
import chalk from 'chalk';

export interface LottieKittyOptions {
  file: string;
  width?: number;
  fps?: number;
  loop?: number;
  speed?: number;
}

/**
 * Main Lottie Kitty animation player
 */
export class LottieKitty {
  private renderer: ThorVGRenderer;
  private kittyGraphics: KittyGraphics;
  private options: Required<LottieKittyOptions>;
  private animationId?: number;

  constructor(options: LottieKittyOptions) {
    const termInfo = getTerminalInfo();
    
    // Set default options
    this.options = {
      file: options.file,
      width: options.width || Math.min(termInfo.width * 0.8, 800), // 80% of terminal width, max 800px
      fps: options.fps || 60,
      loop: options.loop ?? 0, // Default to infinite loops
      speed: options.speed || 1.0,
    };

    // Calculate height maintaining aspect ratio (assume square by default)
    const height = this.options.width;

    this.renderer = new ThorVGRenderer({
      width: this.options.width,
      height,
      fps: this.options.fps,
      speed: this.options.speed,
    });

    this.kittyGraphics = new KittyGraphics();

    // Setup cleanup
    setupCleanupHandlers();
  }

  /**
   * Play the animation
   */
  async play(): Promise<void> {
    console.log(chalk.blue('📂 Loading animation...'));
    console.log(chalk.gray(`File: ${this.options.file}`));
    console.log(chalk.gray(`Size: ${this.options.width}x${this.options.width}px`));
    console.log(chalk.gray(`Speed: ${this.options.speed}x`));

    try {
      // Load animation
      await this.renderer.loadAnimation(this.options.file);
      
      const totalFrames = this.renderer.getTotalFrames();
      const duration = this.renderer.getDuration();
      const frameRate = this.renderer.getFrameRate();

      if (totalFrames === 0) {
        throw new Error('Animation has no frames or failed to load properly');
      }

      console.log(chalk.green('🎬 Animation loaded successfully!'));
      console.log(chalk.gray(`Frames: ${totalFrames}, Duration: ${duration.toFixed(1)}s, FPS: ${frameRate}`));
      console.log();

      // Choose rendering strategy
      if (this.shouldPreRenderAnimation(totalFrames)) {
        await this.playWithPreRendering();
      } else {
        await this.playWithFramePumping();
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('❌ Failed to play animation:'), message);
      throw error;
    } finally {
      this.cleanup();
    }
  }

  /**
   * Decide whether to pre-render all frames or pump frame by frame
   */
  private shouldPreRenderAnimation(totalFrames: number): boolean {
    // Pre-render for short animations (< 200 frames) or when looping
    return totalFrames < 200 || this.options.loop !== 1;
  }

  /**
   * Play animation by pre-rendering all frames (efficient for loops)
   */
  private async playWithPreRendering(): Promise<void> {
    console.log(chalk.blue('🎨 Pre-rendering frames...'));
    
    const frames = this.renderer.renderAllFrames();
    const imageDataArray = frames.map(f => f.imageData);
    
    console.log(chalk.green(`✅ Pre-rendered ${frames.length} frames`));
    
    // Upload as animation to Kitty
    console.log(chalk.blue('📤 Uploading animation to terminal...'));
    const { width, height } = this.renderer.getDimensions();
    
    this.animationId = await this.kittyGraphics.uploadAnimation(imageDataArray, {
      width,
      height,
    });

    console.log(chalk.green('✅ Animation uploaded'));
    console.log(chalk.blue('▶️  Playing...'));
    console.log(chalk.gray('Press Ctrl+C to stop'));
    console.log();

    // Play the animation
    this.kittyGraphics.playAnimation(this.animationId, this.options.loop);

    // Wait for animation completion if not infinite loop
    if (this.options.loop > 0) {
      const duration = this.renderer.getDuration() * this.options.loop / this.options.speed;
      await this.sleep(duration * 1000);
    } else {
      // Infinite loop - wait for Ctrl+C
      await this.waitForInterrupt();
    }
  }

  /**
   * Play animation by rendering frame-by-frame (for large animations)
   */
  private async playWithFramePumping(): Promise<void> {
    console.log(chalk.blue('🎬 Playing with real-time rendering...'));
    console.log(chalk.gray('Press Ctrl+C to stop'));
    console.log();

    const totalFrames = this.renderer.getTotalFrames();
    const frameRate = this.renderer.getFrameRate();
    const frameDuration = 1000 / (frameRate * this.options.speed); // ms per frame

    const { width, height } = this.renderer.getDimensions();
    let imageId: number | undefined;

    let loopCount = 0;
    const maxLoops = this.options.loop || Infinity;

    while (loopCount < maxLoops) {
      for (let frame = 0; frame < totalFrames; frame++) {
        const imageData = this.renderer.renderFrame(frame);
        
        if (imageId === undefined) {
          // First frame - create new image
          imageId = await this.kittyGraphics.uploadImageData(imageData, {
            width,
            height,
            placement: 'new',
          });
        } else {
          // Subsequent frames - replace existing image
          await this.kittyGraphics.uploadImageData(imageData, {
            width,
            height,
            imageId,
            placement: 'replace',
          });
        }

        // Wait for next frame
        if (frame < totalFrames - 1) {
          await this.sleep(frameDuration);
        }
      }

      loopCount++;
      
      if (loopCount < maxLoops) {
        console.log(chalk.gray(`Loop ${loopCount} completed`));
      }
    }

    console.log(chalk.green('🎉 Animation completed'));
  }

  /**
   * Wait for user interrupt (Ctrl+C)
   */
  private async waitForInterrupt(): Promise<void> {
    return new Promise((resolve) => {
      const handler = () => {
        process.off('SIGINT', handler);
        resolve();
      };
      process.on('SIGINT', handler);
    });
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    console.log(chalk.yellow('🧹 Cleaning up...'));
    
    this.kittyGraphics.cleanup();
    this.renderer.destroy();
    
    console.log(chalk.green('✅ Cleanup completed'));
  }
}