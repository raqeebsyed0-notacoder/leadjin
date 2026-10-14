/**
 * LEADJIN Icon Generator
 * Run: node scripts/generate-icons.mjs
 * Generates icon-192.png and icon-512.png in public/ from icon.svg
 * Requires: npm install --save-dev sharp (one-time)
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(__dirname, '../public/icon.svg');

async function generate() {
  try {
    const sharp = (await import('sharp')).default;
    const svg = readFileSync(svgPath);

    for (const size of [192, 512]) {
      const out = resolve(__dirname, `../public/icon-${size}.png`);
      await sharp(svg).resize(size, size).png().toFile(out);
      console.log(`Generated icon-${size}.png`);
    }
    console.log('Icons generated successfully.');
  } catch (e) {
    console.error('sharp not installed. Run: npm install --save-dev sharp');
    console.error('Then run: node scripts/generate-icons.mjs');
    process.exit(1);
  }
}

generate();
