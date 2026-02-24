#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { LottieKitty } from './animation.js';
import { detectKittyTerminal } from './terminal.js';

const program = new Command();

program
  .name('lottie-kitty')
  .description('Play Lottie animations in Kitty terminal using ThorVG')
  .version('1.0.0')
  .argument('<file>', 'Lottie animation file (.json or .lottie)')
  .option('--width <px>', 'Output width in pixels (default: auto from terminal)', parseInt)
  .option('--fps <n>', 'Override frame rate', parseInt)
  .option('--loop <n>', 'Loop count (0 = infinite)', (val) => parseInt(val), 0)
  .option('--speed <n>', 'Playback speed multiplier', parseFloat, 1.0)
  .action(async (file: string, options) => {
    console.log(chalk.blue('🎬 Lottie Kitty Player'));
    console.log('');

    // Check if running in Kitty terminal
    if (!detectKittyTerminal()) {
      console.error(chalk.red('❌ Error: Not running in Kitty terminal'));
      console.error(chalk.yellow('This player requires Kitty terminal with graphics protocol support.'));
      console.error(chalk.gray('Install Kitty: https://sw.kovidgoyal.net/kitty/'));
      process.exit(1);
    }

    try {
      const player = new LottieKitty({
        file,
        width: options.width,
        fps: options.fps,
        loop: options.loop,
        speed: options.speed,
      });

      await player.play();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('❌ Error:'), message);
      process.exit(1);
    }
  });

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n🛑 Stopping animation...'));
  // Cleanup will be handled by LottieKitty destructor
  process.exit(0);
});

program.parse();