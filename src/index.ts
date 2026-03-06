#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { ThorVGRenderer } from './renderer.js';
import { detectKittyTerminal, getTerminalInfo } from './terminal.js';
import { rgbaToHalfBlock, downscaleRgba } from './halfblock.js';
import { spawn, execSync, type ChildProcess } from 'child_process';
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
  .option('--audio <file>', 'Audio file to play in sync with the animation')
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

    // Read Lottie JSON to calculate aspect ratio and native frame rate
    let aspectRatio = 1;
    let nativeFps: number | undefined;
    const resolvedPath = path.resolve(file);
    const ext = path.extname(file).toLowerCase();

    if (ext === '.json' && fs.existsSync(resolvedPath)) {
      try {
        const content = fs.readFileSync(resolvedPath, 'utf8');
        const lottieData = JSON.parse(content);
        if (lottieData.w && lottieData.h) {
          aspectRatio = lottieData.h / lottieData.w;
        }
        if (lottieData.fr) {
          nativeFps = lottieData.fr;
        }
      } catch (_) { /* use square fallback */ }
    }

    // When audio is provided, use the Lottie's native FPS to stay in sync
    // (overriding --fps if set, since audio sync requires correct timing)
    const fps = options.audio && nativeFps ? nativeFps : (options.fps || nativeFps || 60);

    const height = Math.round(width * aspectRatio);
    const speed = options.speed || 1.0;

    console.log(chalk.blue('🎬 Lottie Terminal Player'));
    console.log(chalk.gray(`File: ${file} | Mode: ${mode} | Size: ${width}x${height} | Speed: ${speed}x`));
    if (options.audio) {
      console.log(chalk.gray(`Audio: ${options.audio}`));
    }

    const renderer = new ThorVGRenderer({ width, height, fps, speed });
    await renderer.loadAnimation(file);

    const totalFrames = renderer.getTotalFrames();
    const frameRate = renderer.getFrameRate();
    const frameDuration = 1000 / (frameRate * speed);

    // When audio is provided, detect its duration and stretch animation to match
    let effectiveFrameDuration = frameDuration;
    let audioDuration: number | null = null;
    if (options.audio) {
      audioDuration = getAudioDuration(options.audio);
      if (audioDuration) {
        const animDuration = totalFrames / frameRate;
        if (Math.abs(audioDuration - animDuration) > 0.5) {
          // Stretch frame timing so animation duration = audio duration
          effectiveFrameDuration = (audioDuration * 1000) / totalFrames;
          console.log(chalk.yellow(`⚠️  Animation: ${animDuration.toFixed(1)}s, Audio: ${audioDuration.toFixed(1)}s — stretching to match`));
        }
      }
    }

    console.log(chalk.gray(`Frames: ${totalFrames} | FPS: ${frameRate} (native: ${nativeFps ?? 'unknown'}) | Duration: ${(totalFrames * effectiveFrameDuration / 1000).toFixed(1)}s`));
    console.log(chalk.gray(`Frame duration: ${effectiveFrameDuration.toFixed(1)}ms`));
    console.log(chalk.blue('🎨 Pre-rendering...'));

    // Validate audio file if provided
    if (options.audio) {
      const audioPath = path.resolve(options.audio);
      if (!fs.existsSync(audioPath)) {
        console.error(chalk.red(`Audio file not found: ${audioPath}`));
        process.exit(1);
      }
    }

    if (mode === 'kitty') {
      await playKitty(renderer, file, options, width, height, totalFrames, effectiveFrameDuration, speed, fps);
    } else {
      await playHalfBlock(renderer, width, height, totalFrames, effectiveFrameDuration, cols, options.loop, options.audio, speed, fps);
    }

    renderer.destroy();
  });

/**
 * Detect audio file duration in seconds using ffprobe or afinfo
 */
function getAudioDuration(audioFile: string): number | null {
  const audioPath = path.resolve(audioFile);
  
  // Try ffprobe first
  try {
    const output = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}"`,
      { encoding: 'utf8', timeout: 5000 },
    ).trim();
    const dur = parseFloat(output);
    if (!isNaN(dur) && dur > 0) return dur;
  } catch (_) {}

  // Try afinfo (macOS)
  try {
    const output = execSync(
      `afinfo "${audioPath}" 2>/dev/null | grep "estimated duration"`,
      { encoding: 'utf8', timeout: 5000 },
    ).trim();
    const match = output.match(/([\d.]+)\s*sec/);
    if (match) {
      const dur = parseFloat(match[1]!);
      if (!isNaN(dur) && dur > 0) return dur;
    }
  } catch (_) {}

  return null;
}

/**
 * Start audio playback using afplay (macOS) or ffplay (cross-platform fallback)
 */
function startAudio(audioFile: string, speed: number): ChildProcess | null {
  const audioPath = path.resolve(audioFile);

  // Try afplay (macOS built-in)
  try {
    const args = [audioPath];
    if (speed !== 1.0) {
      args.push('-r', speed.toString());
    }
    const proc = spawn('afplay', args, {
      stdio: ['ignore', 'ignore', 'ignore'],
      detached: false,
    });
    proc.on('error', () => {
      // afplay not available, try ffplay
    });
    return proc;
  } catch (_) {
    // Fall through to ffplay
  }

  // Try ffplay (cross-platform)
  try {
    const args = ['-nodisp', '-autoexit', '-loglevel', 'quiet'];
    if (speed !== 1.0) {
      args.push('-af', `atempo=${speed}`);
    }
    args.push(audioPath);
    const proc = spawn('ffplay', args, {
      stdio: ['ignore', 'ignore', 'ignore'],
      detached: false,
    });
    return proc;
  } catch (_) {
    console.warn(chalk.yellow('⚠️  No audio player found (tried afplay, ffplay). Playing without audio.'));
    return null;
  }
}

/**
 * Stop audio playback
 */
function stopAudio(proc: ChildProcess | null): void {
  if (proc && !proc.killed) {
    proc.kill('SIGTERM');
  }
}

/**
 * Clock-synced playback loop — uses wall clock as master to stay in sync with audio.
 * Instead of sleeping frameDuration per frame, it calculates which frame should
 * be displayed based on elapsed time, skipping frames if rendering is slow.
 */
async function clockSyncedLoop(
  frames: string[] | null,
  base64Frames: string[] | null,
  renderW: number,
  renderH: number,
  totalFrames: number,
  frameDuration: number,
  maxLoops: number,
  audioFile: string | undefined,
  speed: number,
  isKitty: boolean,
  onInterrupt: () => void,
): Promise<void> {
  let interrupted = false;
  let audioProc: ChildProcess | null = null;

  const cleanup = () => {
    interrupted = true;
    stopAudio(audioProc);
    onInterrupt();
  };
  process.on('SIGINT', cleanup);

  let loopCount = 0;

  while (loopCount < maxLoops && !interrupted) {
    // Start audio at the beginning of each loop
    if (audioFile) {
      stopAudio(audioProc);
      audioProc = startAudio(audioFile, speed);
    }

    const loopStart = Date.now();
    const loopDuration = totalFrames * frameDuration;
    let lastFrame = -1;

    while (!interrupted) {
      const elapsed = Date.now() - loopStart;
      if (elapsed >= loopDuration) break;

      const currentFrame = Math.min(
        Math.floor(elapsed / frameDuration),
        totalFrames - 1,
      );

      // Only render if we're on a new frame
      if (currentFrame !== lastFrame) {
        if (isKitty && base64Frames) {
          const b = base64Frames[currentFrame]!;
          process.stdout.write(`\x1b[u\x1b_Ga=T,f=100,s=${renderW},v=${renderH},i=99,p=1,C=1,q=2;${b}\x1b\\`);
        } else if (frames) {
          process.stdout.write('\x1b[u');
          process.stdout.write(frames[currentFrame]!);
        }
        lastFrame = currentFrame;
      }

      // Sleep a short interval then check clock again
      // Use 2ms for tight sync without burning CPU
      await new Promise(r => setTimeout(r, 2));
    }

    loopCount++;
  }

  stopAudio(audioProc);
}

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
  fps: number,
) {
  let renderW = width;
  let renderH = height;
  let base64Frames: string[] = [];

  for (let attempt = 0; attempt < 3; attempt++) {
    const currentRenderer = attempt === 0 ? renderer : new ThorVGRenderer({
      width: renderW, height: renderH, fps, speed,
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

  await clockSyncedLoop(
    null,
    base64Frames,
    renderW,
    renderH,
    totalFrames,
    frameDuration,
    options.loop || Infinity,
    options.audio,
    speed,
    true,
    () => {},
  );

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
  audioFile: string | undefined,
  speed: number,
  fps: number,
) {
  const frameStrings: string[] = [];
  let displayRows = 0;
  const { default: sharpLib } = await import('sharp');

  for (let i = 0; i < totalFrames; i++) {
    const img = renderer.renderFrame(i);
    const buf = Buffer.from(img.data);

    const targetW = cols;
    const targetH = Math.round(renderH * (targetW / renderW));
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

  process.stdout.write('\n'.repeat(displayRows));
  process.stdout.write(`\x1b[${displayRows}A`);
  process.stdout.write('\x1b[?25l\x1b[s');

  await clockSyncedLoop(
    frameStrings,
    null,
    0,
    0,
    totalFrames,
    frameDuration,
    loop || Infinity,
    audioFile,
    speed,
    false,
    () => {},
  );

  process.stdout.write('\x1b[?25h\n');
}

program.parse();
