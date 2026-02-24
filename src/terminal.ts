import process from 'process';

export interface TerminalInfo {
  width: number;
  height: number;
  isKitty: boolean;
  supportsGraphics: boolean;
}

/**
 * Detect if we're running in Kitty terminal
 */
export function detectKittyTerminal(): boolean {
  const term = process.env.TERM;
  const termProgram = process.env.TERM_PROGRAM;
  
  return (
    termProgram === 'kitty' || 
    term === 'xterm-kitty' ||
    process.env.KITTY_WINDOW_ID !== undefined
  );
}

/**
 * Get terminal information
 */
export function getTerminalInfo(): TerminalInfo {
  const isKitty = detectKittyTerminal();
  
  // Get terminal size in character cells
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  
  // Estimate pixel size (typical terminal cell is ~7x14 pixels)
  // For Kitty, we can get more precise measurements if needed
  const charWidth = 7;
  const charHeight = 14;
  
  const width = cols * charWidth;
  const height = rows * charHeight;
  
  return {
    width,
    height,
    isKitty,
    supportsGraphics: isKitty,
  };
}

/**
 * Clear any Kitty graphics
 */
export function clearKittyGraphics(): void {
  if (detectKittyTerminal()) {
    // Clear all images
    process.stdout.write('\x1b_Ga=d\x1b\\');
  }
}

/**
 * Setup cleanup handlers for graceful exit
 */
export function setupCleanupHandlers(): void {
  const cleanup = () => {
    clearKittyGraphics();
  };

  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('uncaughtException', cleanup);
}