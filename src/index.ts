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

    // Render with auto-padding: render once, check bounds, re-render larger if clipped
    let renderW = width;
    let renderH = height;
    let base64Frames: string[] = [];

    for (let attempt = 0; attempt < 3; attempt++) {
      const currentRenderer = attempt === 0 ? renderer : new ThorVGRenderer({
        width: renderW, height: renderH, fps: options.fps || 60, speed,
      });
      if (attempt > 0) await currentRenderer.loadAnimation(file);

      const rawFrames: Buffer[] = [];
      let minX = renderW, minY = renderH, maxX = 0, maxY = 0;
      const frames = currentRenderer.getTotalFrames();

      for (let i = 0; i < frames; i++) {
        const img = currentRenderer.renderFrame(i);
        const buf = Buffer.from(img.data);
        rawFrames.push(buf);

        for (let y = 0; y < renderH; y++) {
          for (let x = 0; x < renderW; x++) {
            const alpha = buf[(y * renderW + x) * 4 + 3];
            if (alpha > 10) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
      }

      if (attempt > 0) currentRenderer.destroy();

      const margin = 4;
      const touchesEdge = maxX > 0 && (minX <= margin || minY <= margin || maxX >= renderW - margin || maxY >= renderH - margin);

      if (touchesEdge && attempt < 2) {
        // Scale up by 1.4x and re-render
        const scale = 1.4;
        renderW = Math.round(renderW * scale);
        renderH = Math.round(renderH * scale);
        console.log(chalk.yellow(`⚠️  Content clipped at edges — re-rendering at ${renderW}x${renderH}`));
        continue;
      }

      if (maxX > 0) {
        const contentW = maxX - minX + 1;
        const contentH = maxY - minY + 1;
        console.log(chalk.gray(`Content bounds: ${contentW}x${contentH} within ${renderW}x${renderH} canvas`));
      }

      // Encode frames
      base64Frames = [];
      for (const buf of rawFrames) {
        const png = await sharp(buf, {
          raw: { width: renderW, height: renderH, channels: 4 },
        }).png({ compressionLevel: 1 }).toBuffer();
        base64Frames.push(png.toString('base64'));
      }
      break;
    }

    console.log(chalk.green(`✅ ${totalFrames} frames ready. Playing... (Ctrl+C to stop)`));

    // Reserve vertical space for the image so it doesn't get clipped
    // Image height in rows ≈ pixelHeight / cellPixelHeight (typically ~14px per cell)
    const cellHeight = 14;
    const imageRows = Math.ceil(renderH / cellHeight);
    // Print blank lines to scroll the terminal and make room
    process.stdout.write('\n'.repeat(imageRows));
    // Move cursor back up to where the image should start
    process.stdout.write(`\x1b[${imageRows}A`);

    process.stdout.write('\x1b[?25l\x1b[s');

    let interrupted = false;
    process.on('SIGINT', () => { interrupted = true; });

    const maxLoops = options.loop || Infinity;
    let loopCount = 0;

    while (loopCount < maxLoops && !interrupted) {
      for (const b of base64Frames) {
        if (interrupted) break;
        process.stdout.write(`\x1b[u\x1b_Ga=T,f=100,s=${renderW},v=${renderH},i=99,p=1,C=1,q=2;${b}\x1b\\`);
        await new Promise(r => setTimeout(r, frameDuration));
      }
      loopCount++;
    }

    // Cleanup
    process.stdout.write(`\x1b_Ga=d,d=i,i=99,q=2\x1b\\\x1b[?25h\n`);
    renderer.destroy();
  });

program.parse();
