# 🎬 Lottie Kitty

Play Lottie animations directly in your Kitty terminal using ThorVG for high-performance rendering.

## ✨ Features

- **High-Performance Rendering**: Uses ThorVG via `@lottiefiles/dotlottie-web` for native-speed animation rendering
- **Kitty Graphics Protocol**: Leverages Kitty's built-in graphics support for smooth animation playback
- **Smart Optimization**: Automatically chooses between pre-rendering (for loops/short animations) and real-time rendering (for large animations)
- **Terminal Integration**: Detects terminal size and capabilities automatically
- **Graceful Cleanup**: Properly cleans up graphics resources on exit

## 🚀 Installation

```bash
# Install globally
npm install -g lottie-kitty

# Or use with npx
npx lottie-kitty animation.json
```

## 📋 Requirements

- **Kitty Terminal**: This player only works in Kitty terminal with graphics protocol support
- **Node.js**: Version 18.0.0 or higher
- **Bun** (optional): For faster execution

## 🎮 Usage

```bash
# Basic usage
lottie-kitty animation.json

# With options
lottie-kitty animation.json --width 400 --fps 30 --loop 5 --speed 1.5

# From .lottie file
lottie-kitty animation.lottie --loop 0
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--width <px>` | Output width in pixels | Auto (80% of terminal width, max 800px) |
| `--fps <n>` | Override animation frame rate | Use animation's native FPS |
| `--loop <n>` | Loop count (0 = infinite) | 0 (infinite) |
| `--speed <n>` | Playback speed multiplier | 1.0 |

## 🏗️ Architecture

The optimal pipeline for rendering Lottie animations in Kitty terminal:

1. **ThorVG WASM** renders Lottie JSON frame-by-frame to RGBA pixel buffers
2. **Sharp** encodes frames as PNG for efficient compression
3. **Kitty Graphics Protocol** sends frames to terminal via escape sequences

### Rendering Strategies

**Pre-rendering Mode** (for short animations or loops):
- Renders all frames upfront
- Uploads as Kitty animation object
- Offloads timing to terminal's GPU renderer
- More efficient for repeated playback

**Real-time Mode** (for large animations):
- Renders frames on-demand
- Lower memory usage
- Better for single playback of large files

## 📦 Project Structure

```
lottie-kitty/
├── src/
│   ├── index.ts          # CLI entry point
│   ├── renderer.ts       # ThorVG WASM frame rendering
│   ├── kitty.ts          # Kitty graphics protocol implementation
│   ├── animation.ts      # Animation loop / frame scheduling
│   └── terminal.ts       # Terminal detection, size, cleanup
├── examples/
│   └── sample.json       # Sample Lottie animation
├── package.json
├── tsconfig.json
└── README.md
```

## 🔧 Development

```bash
# Clone and install dependencies
git clone <repo-url>
cd lottie-kitty
bun install  # or npm install

# Build
bun run build

# Test with sample animation
./dist/index.js examples/spinner.json
```

## 📚 Technical Details

### ThorVG Integration

We use `@lottiefiles/dotlottie-web` which internally uses ThorVG for rendering:

- **Fast**: Native C++ performance via WebAssembly
- **Accurate**: High-fidelity Lottie rendering
- **Buffer Access**: Can extract RGBA pixel data from rendered frames
- **Node.js Compatible**: Works with Node.js Canvas API

### Kitty Graphics Protocol

Implementation follows the official [Kitty Graphics Protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/) specification:

- **Format**: PNG-encoded frames sent as base64 data
- **Animation Support**: Uses native Kitty animation objects for efficient looping
- **Cleanup**: Properly deletes uploaded images on exit

## 🎨 Sample Animations

The project includes sample animations for testing:

- `examples/spinner.json` - A simple rotating circle (120 frames)
- Create your own or download from [LottieFiles](https://lottiefiles.com/)

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

## 🤝 Contributing

Contributions welcome! This is a hackathon project with room for improvements:

- Better error handling and validation
- Support for more Lottie features
- Performance optimizations
- Additional terminal support

## 📝 License

MIT

## 🙏 Acknowledgments

- **ThorVG**: High-performance vector graphics library
- **LottieFiles**: For the excellent dotlottie-web package
- **Kitty Terminal**: For graphics protocol support
- **Lottie**: For the animation format specification