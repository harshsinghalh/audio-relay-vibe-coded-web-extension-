const fs = require('fs');
const path = require('path');

// Ensure icons folder exists
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Generate an SVG for the Audio Relay icon
function generateSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f0f7ff"/>
      <stop offset="50%" stop-color="#e0f2fe"/>
      <stop offset="100%" stop-color="#bae6fd"/>
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="${size * 0.04}" stdDeviation="${size * 0.06}" flood-color="#0284c7" flood-opacity="0.25"/>
    </filter>
  </defs>
  
  <!-- Outer Rounded Squircle -->
  <rect x="${size * 0.05}" y="${size * 0.05}" width="${size * 0.9}" height="${size * 0.9}" rx="${size * 0.24}" fill="url(#bgGrad)" stroke="#ffffff" stroke-width="${Math.max(1, size * 0.03)}" filter="url(#shadow)"/>
  
  <!-- Phone Frame Outline -->
  <rect x="${size * 0.28}" y="${size * 0.18}" width="${size * 0.44}" height="${size * 0.64}" rx="${size * 0.09}" fill="#ffffff" stroke="url(#accentGrad)" stroke-width="${Math.max(1.5, size * 0.05)}"/>
  
  <!-- Top Speaker Notch -->
  <line x1="${size * 0.44}" y1="${size * 0.24}" x2="${size * 0.56}" y2="${size * 0.24}" stroke="#94a3b8" stroke-width="${Math.max(1, size * 0.03)}" stroke-linecap="round"/>
  
  <!-- Audio Waveform Bars in Center of Screen -->
  <line x1="${size * 0.38}" y1="${size * 0.52}" x2="${size * 0.38}" y2="${size * 0.60}" stroke="#0284c7" stroke-width="${Math.max(1.2, size * 0.04)}" stroke-linecap="round"/>
  <line x1="${size * 0.45}" y1="${size * 0.42}" x2="${size * 0.45}" y2="${size * 0.68}" stroke="#0284c7" stroke-width="${Math.max(1.5, size * 0.045)}" stroke-linecap="round"/>
  <line x1="${size * 0.52}" y1="${size * 0.36}" x2="${size * 0.52}" y2="${size * 0.74}" stroke="#0284c7" stroke-width="${Math.max(1.8, size * 0.05)}" stroke-linecap="round"/>
  <line x1="${size * 0.59}" y1="${size * 0.45}" x2="${size * 0.59}" y2="${size * 0.65}" stroke="#0284c7" stroke-width="${Math.max(1.5, size * 0.045)}" stroke-linecap="round"/>
</svg>`;
}

// Generate standard uncompressed PNG file using pure JS (zlib)
const zlib = require('zlib');

function createPng(width, height, r, g, b, a) {
  // Minimal PNG generator for fallback if no canvas
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8 bit depth
  ihdr.writeUInt8(6, 9); // RGBA color type
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace
  
  const ihdrChunk = createChunk('IHDR', ihdr);
  
  // Raw image data with filter byte 0 for each scanline
  const rowSize = width * 4 + 1;
  const rawData = Buffer.alloc(rowSize * height);
  
  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.44;
  
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter: None
    
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist <= radius) {
        // Shaded icon circle with phone / audio wave colors
        const t = (x + y) / (width + height);
        rawData[pxOffset] = Math.round(56 + t * 40);     // R
        rawData[pxOffset + 1] = Math.round(189 - t * 30); // G
        rawData[pxOffset + 2] = Math.round(248 - t * 20); // B
        rawData[pxOffset + 3] = 255;                      // A
      } else {
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
      }
    }
  }
  
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(len + 12);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4);
  data.copy(buf, 8);
  
  // Calculate CRC32
  const crc = crc32(Buffer.concat([Buffer.from(type), data]));
  buf.writeUInt32BE(crc, len + 8);
  return buf;
}

// CRC32 implementation
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xff];
  }
  return (c ^ 0xffffffff) >>> 0;
}

const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  table[i] = c;
}

const sizes = [16, 32, 48, 128];
sizes.forEach(size => {
  const svgContent = generateSvg(size);
  fs.writeFileSync(path.join(iconsDir, `icon-${size}.svg`), svgContent);
  
  const pngBuf = createPng(size, size, 56, 189, 248, 255);
  fs.writeFileSync(path.join(iconsDir, `icon-${size}.png`), pngBuf);
  console.log(`Generated icon-${size}.png and icon-${size}.svg`);
});
