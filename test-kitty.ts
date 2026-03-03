#!/usr/bin/env node

/**
 * Standalone test for Kitty graphics protocol
 * Creates a red square, displays it, then replaces with a blue square
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Simple PNG creation function
async function createSimplePNG(width: number, height: number, color: [number, number, number, number]): Promise<Buffer> {
  // This is a minimal PNG generator - in real code we'd use a library like sharp or pngjs
  // For this test, we'll create raw RGBA data and use a simple approach
  
  const sharp = (await import('sharp')).default;
  const [r, g, b, a] = color;
  
  // Create RGBA buffer
  const pixelCount = width * height;
  const buffer = Buffer.alloc(pixelCount * 4);
  
  for (let i = 0; i < pixelCount; i++) {
    buffer[i * 4] = r;     // Red
    buffer[i * 4 + 1] = g; // Green
    buffer[i * 4 + 2] = b; // Blue
    buffer[i * 4 + 3] = a; // Alpha
  }
  
  return await sharp(buffer, {
    raw: {
      width,
      height,
      channels: 4
    }
  }).png().toBuffer();
}

async function testKittyProtocol(): Promise<void> {
  console.log('🧪 Testing Kitty Graphics Protocol...');
  
  // Check if we're in a Kitty terminal
  if (process.env.TERM !== 'xterm-kitty') {
    console.log('⚠️  Warning: Not running in Kitty terminal (TERM != xterm-kitty)');
    console.log('   This test will only work properly in Kitty terminal');
  }
  
  const width = 100;
  const height = 100;
  const imageId = 12345;
  const placementId = 1;
  
  try {
    // Create red and blue PNG squares
    console.log('📷 Creating test images...');
    const redPng = await createSimplePNG(width, height, [255, 0, 0, 255]); // Red
    const bluePng = await createSimplePNG(width, height, [0, 0, 255, 255]); // Blue
    
    console.log(`✅ Created ${width}x${height} red and blue squares`);
    console.log();
    console.log('🎬 Starting animation test...');
    
    // Hide cursor and save position
    process.stdout.write('\x1b[?25l'); // Hide cursor
    process.stdout.write('\x1b[s');    // Save cursor position
    
    // Display red square
    console.log('🟥 Displaying red square...');
    const redBase64 = redPng.toString('base64');
    const redEscape = `\x1b_Ga=T,f=100,s=${width},v=${height},i=${imageId},p=${placementId},C=1,q=2;${redBase64}\x1b\\`;
    process.stdout.write(redEscape);
    
    // Wait 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Replace with blue square at same position
    console.log('🟦 Replacing with blue square...');
    process.stdout.write('\x1b[u');    // Restore cursor position
    
    const blueBase64 = bluePng.toString('base64');
    const blueEscape = `\x1b_Ga=T,f=100,s=${width},v=${height},i=${imageId},p=${placementId},C=1,q=2;${blueBase64}\x1b\\`;
    process.stdout.write(blueEscape);
    
    // Wait 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Cleanup
    console.log('🧹 Cleaning up...');
    const deleteEscape = `\x1b_Ga=d,d=i,i=${imageId},q=2\x1b\\`;
    process.stdout.write(deleteEscape);
    
    // Restore cursor
    process.stdout.write('\x1b[?25h'); // Show cursor
    
    console.log();
    console.log('✅ Test completed successfully!');
    console.log('   If you saw a red square replaced by a blue square at the same position,');
    console.log('   then the Kitty graphics protocol is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testKittyProtocol().catch(console.error);
}