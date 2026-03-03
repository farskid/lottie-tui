# 🎬 Lottie Kitty

Play Lottie animations directly in your Kitty terminal using ThorVG for high-performance rendering.

## ✨ Features

- **High-Performance Rendering**: Uses ThorVG via `@lottiefiles/dotlottie-web` for native-speed animation rendering
- **Kitty Graphics Protocol**: Leverages Kitty's built-in graphics support for smooth animation playback
- **Aspect Ratio Aware**: Automatically preserves original animation proportions
- **Terminal Integration**: Detects terminal size and capabilities automatically

## 🚀 Installation

```bash
# Install dependencies
npm install

# Build
npm run build

# Run
node dist/index.js animation.json
```

## 📋 Requirements

- **Kitty Terminal**: This player only works in Kitty terminal with graphics protocol support
- **Node.js**: Version 18.0.0 or higher

## 🎮 Usage

```bash
# Basic usage
node dist/index.js animation.json

# With options
node dist/index.js animation.json --width 400 --fps 30 --loop 5 --speed 1.5
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--width <px>` | Output width in pixels | Auto (50% of terminal width, max 400px) |
| `--fps <n>` | Override animation frame rate | Use animation's native FPS |
| `--loop <n>` | Loop count (0 = infinite) | 0 (infinite) |
| `--speed <n>` | Playback speed multiplier | 1.0 |

## 🔧 Development

```bash
# Install dependencies
npm install

# Build TypeScript
npx tsc

# Test with an animation
node dist/index.js path/to/animation.json
```

## 🐛 Troubleshooting

**"Not running in Kitty terminal"**
- Make sure you're using Kitty terminal: https://sw.kovidgoyal.net/kitty/
- Check that `TERM_PROGRAM=kitty` or `TERM=xterm-kitty`

**Animation not rendering**
- Verify the Lottie file is valid JSON
- Try with a simpler animation first
- Check terminal size is adequate for the animation

**Performance issues**
- Use `--width` to reduce output size
- Reduce `--fps` for less CPU usage
- Try different `--speed` values

## 📝 License

MIT