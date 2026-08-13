#!/usr/bin/env node
/**
 * Generate marketplace-icon.png and social-preview.png from SVG sources.
 * Uses a minimal PNG encoder (no native deps) for solid branded placeholders
 * when sharp/canvas are unavailable. SVG remains canonical.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'assets');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function pngRGB(width, height, paint) {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y, width, height);
      const i = y * stride + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function brandPaint(x, y, w, h) {
  // Dark forensic field
  const t = y / h;
  const r = 11 + Math.floor(t * 10);
  const g = 15 + Math.floor(t * 12);
  const b = 20 + Math.floor(t * 16);
  // Stylized A / check region
  const cx = w * 0.5;
  const cy = h * 0.55;
  const dx = Math.abs(x - cx) / w;
  const dy = (y - h * 0.18) / h;
  if (dy > 0 && dy < 0.7 && Math.abs(dx - dy * 0.35) < 0.02) return [232, 238, 245];
  if (Math.abs(x - cx) < w * 0.01 && y > h * 0.28 && y < h * 0.72) return [124, 156, 180];
  if ((x - cx) ** 2 + (y - cy) ** 2 < (Math.min(w, h) * 0.02) ** 2) return [168, 197, 162];
  return [r, g, b];
}

writeFileSync(join(assets, 'marketplace-icon.png'), pngRGB(512, 512, brandPaint));
writeFileSync(join(assets, 'social-preview.png'), pngRGB(1280, 640, brandPaint));

const extensionMedia = join(root, 'extension', 'media');
writeFileSync(join(extensionMedia, 'icon.png'), pngRGB(256, 256, brandPaint));

// Ensure SVGs exist
for (const f of ['logo.svg', 'logo-mark.svg', 'logo-dark.svg', 'logo-light.svg', 'banner.svg']) {
  if (!existsSync(join(assets, f))) {
    console.error(`Missing canonical SVG: ${f}`);
    process.exit(1);
  }
}
console.log('Generated marketplace-icon.png, social-preview.png, and extension/media/icon.png');
void readFileSync;
