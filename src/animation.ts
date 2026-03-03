import { ThorVGRenderer } from './renderer.js';
import { KittyGraphics } from './kitty.js';
import { getTerminalInfo, detectKittyTerminal, setupCleanupHandlers } from './terminal.js';
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
  private isKitty: boolean;

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
    this.isKitty = detectKittyTerminal();

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
      if (!this.isKitty) {
        await this.playFallbackMode(totalFrames, duration, frameRate);
      } else if (this.shouldPreRenderAnimation(totalFrames)) {
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
   * Fallback mode: render frames and print summary info (no Kitty graphics)
   */
  private async playFallbackMode(totalFrames: number, duration: number, frameRate: number): Promise<void> {
    console.log(chalk.blue('📊 Fallback mode — rendering frames to validate animation'));
    console.log();

    // Render a sample of frames to verify the pipeline works
    const sampleCount = Math.min(totalFrames, 10);
    const step = Math.max(1, Math.floor(totalFrames / sampleCount));
    const { width, height } = this.renderer.getDimensions();

    for (let i = 0; i < totalFrames && i / step < sampleCount; i += step) {
      const imageData = this.renderer.renderFrame(i);
      // Compute a simple non-transparent pixel ratio as a sanity check
      let nonEmpty = 0;
      for (let p = 3; p < imageData.data.length; p += 4) {
        if (imageData.data[p] > 0) nonEmpty++;
      }
      const coverage = ((nonEmpty / (width * height)) * 100).toFixed(1);
      console.log(chalk.gray(`  Frame ${String(i).padStart(4)} / ${totalFrames}  — ${coverage}% coverage`));
    }

    console.log();
    console.log(chalk.green('✅ Animation is valid and renderable'));
    console.log(chalk.gray(`   ${totalFrames} frames, ${duration.toFixed(1)}s, ${frameRate} fps, ${width}×${height}px`));
    console.log(chalk.yellow('   Run in Kitty terminal for full graphical playback.'));
  }

  /**
   * Decide whether to pre-render all frames or pump frame by frame
   */
  private shouldPreRenderAnimation(totalFrames: number): boolean {
    // Pre-render for short animations (< 200 frames) or when looping
    return totalFrames < 200 || this.options.loop !== 1;
  }

  /**
   * Play animation by pre-rendering all frames, then cycling through them
   */
  private async playWithPreRendering(): Promise<void> {
    console.log(chalk.blue('🎨 Pre-rendering frames...'));
    
    const frames = this.renderer.renderAllFrames();
    
    console.log(chalk.green(`✅ Pre-rendered ${frames.length} frames`));
    console.log(chalk.blue('▶️  Playing...'));
    console.log(chalk.gray('Press Ctrl+C to stop'));

    const { width, height } = this.renderer.getDimensions();
    const frameRate = this.renderer.getFrameRate();
    const frameDuration = 1000 / (frameRate * this.options.speed);

    console.log(chalk.green('✅ Ready'));
    console.log();

    // Prepare for animation display
    this.kittyGraphics.hideCursor();
    this.kittyGraphics.saveCursor(); // Save current cursor position

    let interrupted = false;
    const handler = () => { interrupted = true; };
    process.on('SIGINT', handler);

    const imageId = this.kittyGraphics.getNextImageId();
    const placementId = this.kittyGraphics.getNextPlacementId();
    let loopCount = 0;
    const maxLoops = this.options.loop || Infinity;
    let isFirstFrame = true;

    try {
      while (loopCount < maxLoops && !interrupted) {
        for (let i = 0; i < frames.length && !interrupted; i++) {
          const start = Date.now();

          if (isFirstFrame) {
            // First frame: create initial placement
            await this.kittyGraphics.uploadImageData(frames[i].imageData, {
              width,
              height,
              imageId,
              placementId,
              placement: 'new',
            });
            isFirstFrame = false;
          } else {
            // Subsequent frames: replace in-place
            // Restore cursor position to ensure consistent placement
            this.kittyGraphics.restoreCursor();
            await this.kittyGraphics.replaceImageData(
              frames[i].imageData, 
              imageId, 
              placementId, 
              width, 
              height
            );
          }

          const elapsed = Date.now() - start;
          const remaining = frameDuration - elapsed;
          if (remaining > 0) {
            await this.sleep(remaining);
          }
        }
        loopCount++;
      }
    } finally {
      // Cleanup
      this.kittyGraphics.deletePlacement(imageId, placementId);
      process.off('SIGINT', handler);
      this.kittyGraphics.restoreCursor();
      this.kittyGraphics.showCursor();
    }
  }

  /**
   * Get current cursor row
   */
  private getCurrentRow(): Promise<number> {
    // Default to a reasonable position if we can't query
    return Promise.resolve(6); // after the log lines
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
    
    // Prepare for animation display
    this.kittyGraphics.hideCursor();
    this.kittyGraphics.saveCursor(); // Save current cursor position

    let interrupted = false;
    const handler = () => { interrupted = true; };
    process.on('SIGINT', handler);

    const imageId = this.kittyGraphics.getNextImageId();
    const placementId = this.kittyGraphics.getNextPlacementId();
    let loopCount = 0;
    const maxLoops = this.options.loop || Infinity;

    try {
      while (loopCount < maxLoops && !interrupted) {
        for (let frame = 0; frame < totalFrames && !interrupted; frame++) {
          const start = Date.now();
          const imageData = this.renderer.renderFrame(frame);
          
          if (frame === 0 && loopCount === 0) {
            // First frame - create new placement
            await this.kittyGraphics.uploadImageData(imageData, {
              width,
              height,
              imageId,
              placementId,
              placement: 'new',
            });
          } else {
            // Subsequent frames - replace in-place
            this.kittyGraphics.restoreCursor(); // Ensure consistent position
            await this.kittyGraphics.replaceImageData(
              imageData, 
              imageId, 
              placementId, 
              width, 
              height
            );
          }

          // Wait for next frame
          const elapsed = Date.now() - start;
          const remaining = frameDuration - elapsed;
          if (remaining > 0) {
            await this.sleep(remaining);
          }
        }

        loopCount++;
        
        if (loopCount < maxLoops && !interrupted) {
          console.log(chalk.gray(`Loop ${loopCount} completed`));
        }
      }
    } finally {
      // Cleanup
      this.kittyGraphics.deletePlacement(imageId, placementId);
      process.off('SIGINT', handler);
      this.kittyGraphics.restoreCursor();
      this.kittyGraphics.showCursor();
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