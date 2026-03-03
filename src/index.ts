#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { ThorVGRenderer } from './renderer.js';
import { detectKittyTerminal, getTerminalInfo } from './terminal.js';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

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
    const isKitty = detectKittyTerminal();
    if (!isKitty) {
      console.error(chalk.yellow('⚠️  Not running in Kitty terminal. Kitty is required for graphics.'));
      process.exit(1);
    }

    const termInfo = getTerminalInfo();
    const width = options.width || Math.min(Math.round(termInfo.width * 0.5), 400);

    // Read Lottie JSON to calculate aspect ratio
    let height = width; // fallback to square
    const resolvedPath = path.resolve(file);
    const ext = path.extname(file).toLowerCase();
    
    if (ext === '.json' && fs.existsSync(resolvedPath)) {
      try {
        const content = fs.readFileSync(resolvedPath, 'utf8');
        const lottieData = JSON.parse(content);
        if (lottieData.w && lottieData.h) {
          const aspectRatio = lottieData.h / lottieData.w;
          height = Math.round(width * aspectRatio);
        }
      } catch (err) {
        console.log(chalk.yellow('⚠️  Could not read aspect ratio from Lottie file, using square'));
      }
    }

    const speed = options.speed || 1.0;

    console.log(chalk.blue('🎬 Lottie Kitty Player'));
    console.log(chalk.gray(`File: ${file} | Size: ${width}x${height} | Speed: ${speed}x`));

    const renderer = new ThorVGRenderer({ width, height, fps: options.fps || 60, speed });
    await renderer.loadAnimation(file);

    const totalFrames = renderer.getTotalFrames();
    const frameRate = renderer.getFrameRate();
    const frameDuration = 1000 / (frameRate * speed);

    console.log(chalk.gray(`Frames: ${totalFrames} | FPS: ${frameRate} | Duration: ${renderer.getDuration().toFixed(1)}s`));
    console.log(chalk.blue('🎨 Pre-rendering...'));

    // Pre-render and encode all frames
    const base64Frames: string[] = [];
    for (let i = 0; i < totalFrames; i++) {
      const img = renderer.renderFrame(i);
      const png = await sharp(Buffer.from(img.data), {
        raw: { width, height, channels: 4 },
      }).png({ compressionLevel: 1 }).toBuffer();
      base64Frames.push(png.toString('base64'));
    }

    console.log(chalk.green(`✅ ${totalFrames} frames ready. Playing... (Ctrl+C to stop)`));

    // Play — same pattern as working test-play.ts
    process.stdout.write('\x1b[?25l\x1b[s');

    let interrupted = false;
    process.on('SIGINT', () => { interrupted = true; });

    const maxLoops = options.loop || Infinity;
    let loopCount = 0;

    while (loopCount < maxLoops && !interrupted) {
      for (const b of base64Frames) {
        if (interrupted) break;
        process.stdout.write(`\x1b[u\x1b_Ga=T,f=100,s=${width},v=${height},i=99,p=1,C=1,q=2;${b}\x1b\\`);
        await new Promise(r => setTimeout(r, frameDuration));
      }
      loopCount++;
    }

    // Cleanup
    process.stdout.write(`\x1b_Ga=d,d=i,i=99,q=2\x1b\\\x1b[?25h\n`);
    renderer.destroy();
  });

program.parse();
