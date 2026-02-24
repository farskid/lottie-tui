#!/usr/bin/env node

// Verify the lottie-kitty build works correctly
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('🔍 Verifying lottie-kitty build...\n');

// Check if dist directory exists
const distPath = join(__dirname, 'dist');
if (!existsSync(distPath)) {
  console.error('❌ dist/ directory not found. Run: bun run build');
  process.exit(1);
}

// Check if main binary exists
const mainBinary = join(distPath, 'index.js');
if (!existsSync(mainBinary)) {
  console.error('❌ dist/index.js not found. Build may have failed.');
  process.exit(1);
}

console.log('✅ dist/index.js exists');

// Check if examples exist
const spinnerExample = join(__dirname, 'examples', 'spinner.json');
if (!existsSync(spinnerExample)) {
  console.error('❌ examples/spinner.json not found');
  process.exit(1);
}

console.log('✅ examples/spinner.json exists');

// Test the CLI without terminal detection (should fail gracefully)
console.log('\n🧪 Testing CLI (should detect non-Kitty terminal)...');

const child = spawn('node', [mainBinary, 'examples/spinner.json', '--width', '100'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';
let errorOutput = '';

child.stdout.on('data', (data) => {
  output += data.toString();
});

child.stderr.on('data', (data) => {
  errorOutput += data.toString();
});

child.on('close', (code) => {
  console.log('\n📋 CLI Output:');
  if (output) console.log('STDOUT:', output);
  if (errorOutput) console.log('STDERR:', errorOutput);
  
  // We expect exit code 1 because we're not in Kitty terminal
  if (code === 1 && errorOutput.includes('Not running in Kitty terminal')) {
    console.log('\n✅ CLI correctly detected non-Kitty environment');
    console.log('✅ Error handling working properly');
    console.log('\n🎉 Build verification successful!');
    console.log('\n📦 Ready for:');
    console.log('   - npm publish (after setting up npm registry)');
    console.log('   - npx lottie-kitty <file.json> (in Kitty terminal)');
    console.log('   - Distribution as hackathon demo');
    console.log('\n🔗 Repository: https://github.com/farskid/lottie-kitty');
  } else {
    console.log('\n❌ Unexpected behavior');
    console.log(`Exit code: ${code}`);
    process.exit(1);
  }
});

child.on('error', (err) => {
  console.error('❌ Failed to run CLI:', err.message);
  process.exit(1);
});