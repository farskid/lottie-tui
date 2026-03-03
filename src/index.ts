#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { ThorVGRenderer } from './renderer.js';
import { detectKittyTerminal, getTerminalInfo } from './terminal.js';
import { rgbaToHalfBlock, downscaleRgba } from './halfblock.js';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const program = new Command();

program
  .name('lottie-kitty')
  .description('Play Lottie animations in the terminal using ThorVG')
  .version('1.0.0')
  .argument('<file>', 'Lottie animation file (.json or .lottie)')
  .option('--width <px>', 'Output width in pixels (default: auto from terminal)', parseInt)
  .option('--cols <n>', 'Output width in terminal columns (for half-block mode)', parseInt)
  .option('--fps <n>', 'Override frame rate', parseInt)
  .option('--loop <n>', 'Loop count (0 = infinite)', (val) => parseInt(val), 0)
  .option('--speed <n>', 'Playback speed multiplier', parseFloat, 1.0)
  .option('--mode <mode>', 'Render mode: auto, kitty, halfblock', 'auto')
  .action(async (file: string, options) => {
    const isKitty = detectKittyTerminal();
    const mode: 'kitty' | 'halfblock' =
      options.mode === 'kitty' ? 'kitty' :
      options.mode === 'halfblock' ? 'halfblock' :
      isKitty ? 'kitty' : 'halfblock';

    const termInfo = getTerminalInfo();
    const termCols = process.stdout.columns || 80;

    // For half-block: width = cols (each col = 1 pixel wide)
    // For kitty: width = pixel width
    const cols = options.cols || Math.min(termCols - 2, 80);
    // For half-block: render at 4x the col count for supersampling, then downscale
    const width = options.width || (mode === 'kitty'
      ? Math.min(Math.round(termInfo.width * 0.5), 400)
      : cols * 4);

    // Read Lottie JSON to calculate aspect ratio
    let aspectRatio = 1;
    const resolvedPath = path.resolve(file);
    const ext = path.extname(file).toLowerCase();

    if (ext === '.json' && fs.existsSync(resolvedPath)) {
      try {
        const content = fs.readFileSync(resolvedPath, 'utf8');
        const lottieData = JSON.parse(content);
        if (lottieData.w && lottieData.h) {
          aspectRatio = lottieData.h / lottieData.w;
        }
      } catch (_) { /* use square fallback */ }
    }

    const height = Math.round(width * aspectRatio);
    const speed = options.speed || 1.0;

    console.log(chalk.blue('🎬 Lottie Terminal Player'));
    console.log(chalk.gray(`File: ${file} | Mode: ${mode} | Size: ${width}x${height} | Speed: ${speed}x`));

    const renderer = new ThorVGRenderer({ width, height, fps: options.fps || 60, speed });
    await renderer.loadAnimation(file);

    const totalFrames = renderer.getTotalFrames();
    const frameRate = renderer.getFrameRate();
    const frameDuration = 1000 / (frameRate * speed);

    console.log(chalk.gray(`Frames: ${totalFrames} | FPS: ${frameRate} | Duration: ${renderer.getDuration().toFixed(1)}s`));
    console.log(chalk.blue('🎨 Pre-rendering...'));

    if (mode === 'kitty') {
      await playKitty(renderer, file, options, width, height, totalFrames, frameDuration, speed);
    } else {
      await playHalfBlock(renderer, width, height, totalFrames, frameDuration, cols, options.loop);
    }

    renderer.destroy();
  });

/**
 * Kitty graphics protocol playback (with auto-padding)
 */
async function playKitty(
  renderer: ThorVGRenderer,
  file: string,
  options: any,
  width: number,
  height: number,
  totalFrames: number,
  frameDuration: number,
  speed: number,
) {
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

    for (let i = 0; i < currentRenderer.getTotalFrames(); i++) {
      const img = currentRenderer.renderFrame(i);
      const buf = Buffer.from(img.data);
      rawFrames.push(buf);

      for (let y = 0; y < renderH; y++) {
        for (let x = 0; x < renderW; x++) {
          if (buf[(y * renderW + x) * 4 + 3] > 10) {
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
      renderW = Math.round(renderW * 1.4);
      renderH = Math.round(renderH * 1.4);
      console.log(chalk.yellow(`⚠️  Content clipped — re-rendering at ${renderW}x${renderH}`));
      continue;
    }

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

  const cellHeight = 14;
  const imageRows = Math.ceil(renderH / cellHeight);
  process.stdout.write('\n'.repeat(imageRows));
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

  process.stdout.write(`\x1b_Ga=d,d=i,i=99,q=2\x1b\\\x1b[?25h\n`);
}

/**
 * Half-block character playback (works in any truecolor terminal)
 */
async function playHalfBlock(
  renderer: ThorVGRenderer,
  renderW: number,
  renderH: number,
  totalFrames: number,
  frameDuration: number,
  cols: number,
  loop: number,
) {
  // Pre-render all frames as half-block strings
  // Render at high res internally, then use sharp's Lanczos3 to downscale
  const frameStrings: string[] = [];
  let displayRows = 0;
  const { default: sharpLib } = await import('sharp');

  for (let i = 0; i < totalFrames; i++) {
    const img = renderer.renderFrame(i);
    const buf = Buffer.from(img.data);

    // Downscale to terminal columns using sharp (Lanczos3 — much smoother)
    const targetW = cols;
    // Half-block: each cell = 2 vertical pixels, so target height in pixels = displayRows * 2
    const targetH = Math.round(renderH * (targetW / renderW));
    // Make height even for clean half-block pairing
    const evenH = targetH % 2 === 0 ? targetH : targetH + 1;

    const downscaled = await sharpLib(buf, {
      raw: { width: renderW, height: renderH, channels: 4 },
    })
      .resize(targetW, evenH, { kernel: 'lanczos3' })
      .raw()
      .toBuffer();

    const str = rgbaToHalfBlock(downscaled as Buffer<ArrayBuffer>, targetW, evenH);
    frameStrings.push(str);

    if (i === 0) {
      displayRows = Math.ceil(evenH / 2);
    }
  }

  console.log(chalk.green(`✅ ${totalFrames} frames ready. Playing... (Ctrl+C to stop)`));

  // Reserve space
  process.stdout.write('\n'.repeat(displayRows));
  process.stdout.write(`\x1b[${displayRows}A`);
  process.stdout.write('\x1b[?25l\x1b[s');

  let interrupted = false;
  process.on('SIGINT', () => { interrupted = true; });

  const maxLoops = loop || Infinity;
  let loopCount = 0;

  while (loopCount < maxLoops && !interrupted) {
    for (const frame of frameStrings) {
      if (interrupted) break;
      // Restore cursor and overwrite
      process.stdout.write('\x1b[u');
      process.stdout.write(frame);
      await new Promise(r => setTimeout(r, frameDuration));
    }
    loopCount++;
  }

  process.stdout.write('\x1b[?25h\n');
}

program.parse();
