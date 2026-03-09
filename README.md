# lottie-tui 🎬

Play [Lottie](https://lottiefiles.com) animations in your terminal.

Uses [ThorVG](https://github.com/nicbarker/thorvg) (via `@lottiefiles/dotlottie-web`) for rendering — same engine as the native players.

## How it works

- **Kitty terminal** → Kitty graphics protocol (full pixel quality)
- **Everything else** → Half-block characters with truecolor (▀▄) — works in Warp, iTerm2, WezTerm, Hyper, and any terminal with 24-bit color support

Auto-detects your terminal and picks the best renderer.

## Install

```bash
npm install
npm run build
```

## Usage

```bash
# Basic — auto-detects terminal capabilities
lottie-tui animation.json

# Set width (Kitty mode, in pixels)
lottie-tui --width 300 animation.json

# Set width (half-block mode, in terminal columns)
lottie-tui --cols 60 animation.json

# Force a specific render mode
lottie-tui --mode halfblock animation.json
lottie-tui --mode kitty animation.json

# Control playback
lottie-tui --fps 30 --speed 2 --loop 3 animation.json
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--width <px>` | Output width in pixels (Kitty mode) | auto |
| `--cols <n>` | Output width in columns (half-block mode) | 80 |
| `--fps <n>` | Override frame rate | from file |
| `--loop <n>` | Loop count (0 = infinite) | 0 |
| `--speed <n>` | Playback speed multiplier | 1.0 |
| `--mode <m>` | Render mode: `auto`, `kitty`, `halfblock` | auto |

## Supported formats

- `.json` — Lottie JSON
- `.lottie` — dotLottie (compressed, multi-animation)

## Requirements

- Node.js 18+
- For best quality: [Kitty terminal](https://sw.kovidgoyal.net/kitty/)
- For half-block mode: any terminal with truecolor support

## License

MIT
