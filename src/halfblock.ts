/**
 * Half-block character renderer for terminals without graphics protocol support.
 * Uses ▀ (upper half block) with fg/bg colors to display 2 vertical pixels per cell.
 * Works in any terminal with truecolor (24-bit) support.
 */

const UPPER_HALF = '▀';
const RESET = '\x1b[0m';

/**
 * Convert RGBA pixel data to a half-block string for one frame.
 * Each character cell represents 2 vertical pixels:
 *   - foreground color = top pixel
 *   - background color = bottom pixel
 * 
 * @param rgba - Raw RGBA buffer (width * height * 4 bytes)
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param bgR - Terminal background R (default 0 for dark themes)
 * @param bgG - Terminal background G
 * @param bgB - Terminal background B
 */
export function rgbaToHalfBlock(
  rgba: Buffer,
  width: number,
  height: number,
  bgR = 0,
  bgG = 0,
  bgB = 0,
): string {
  const lines: string[] = [];
  
  // Process 2 rows at a time (top pixel = fg, bottom pixel = bg)
  for (let y = 0; y < height; y += 2) {
    let line = '';
    
    for (let x = 0; x < width; x++) {
      // Top pixel
      const topIdx = (y * width + x) * 4;
      const topA = rgba[topIdx + 3] / 255;
      const topR = Math.round(rgba[topIdx] * topA + bgR * (1 - topA));
      const topG = Math.round(rgba[topIdx + 1] * topA + bgG * (1 - topA));
      const topB = Math.round(rgba[topIdx + 2] * topA + bgB * (1 - topA));
      
      // Bottom pixel (might not exist if height is odd)
      let botR = bgR, botG = bgG, botB = bgB;
      if (y + 1 < height) {
        const botIdx = ((y + 1) * width + x) * 4;
        const botA = rgba[botIdx + 3] / 255;
        botR = Math.round(rgba[botIdx] * botA + bgR * (1 - botA));
        botG = Math.round(rgba[botIdx + 1] * botA + bgG * (1 - botA));
        botB = Math.round(rgba[botIdx + 2] * botA + bgB * (1 - botA));
      }
      
      // Set fg (top) and bg (bottom) truecolor, then print ▀
      line += `\x1b[38;2;${topR};${topG};${topB};48;2;${botR};${botG};${botB}m${UPPER_HALF}`;
    }
    
    lines.push(line + RESET);
  }
  
  return lines.join('\n');
}

/**
 * Downscale RGBA buffer to fit terminal columns.
 * Uses simple area averaging for decent quality.
 */
export function downscaleRgba(
  rgba: Buffer,
  srcW: number,
  srcH: number,
  dstW: number,
): { buffer: Buffer; width: number; height: number } {
  const scale = dstW / srcW;
  const dstH = Math.round(srcH * scale);
  const out = Buffer.alloc(dstW * dstH * 4);
  
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      // Map to source coordinates
      const srcX = Math.min(Math.floor(x / scale), srcW - 1);
      const srcY = Math.min(Math.floor(y / scale), srcH - 1);
      const srcIdx = (srcY * srcW + srcX) * 4;
      const dstIdx = (y * dstW + x) * 4;
      
      out[dstIdx] = rgba[srcIdx];
      out[dstIdx + 1] = rgba[srcIdx + 1];
      out[dstIdx + 2] = rgba[srcIdx + 2];
      out[dstIdx + 3] = rgba[srcIdx + 3];
    }
  }
  
  return { buffer: out, width: dstW, height: dstH };
}
