import fs from 'fs';
import zlib from 'zlib';

function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    table[i] = c;
  }
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  return (crc ^ (-1)) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'binary');
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createPng(size, isMaskable) {
  const width = size;
  const height = size;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Background #20231f (32, 35, 31)
  // Accent #d6f26a (214, 242, 106)
  const raw = Buffer.alloc((width * 4 + 1) * height);
  const strokeW = Math.max(3, Math.round(size * 0.08));
  const pad = isMaskable ? Math.round(size * 0.28) : Math.round(size * 0.20);
  const x0 = pad, x1 = size - pad;
  const y0 = pad, y1 = size - pad;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (width * 4 + 1);
    raw[rowOffset] = 0; // filter None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      // Default bg: #20231f
      let r = 32, g = 35, b = 31, a = 255;

      // Draw 'N' symbol
      const isLeftCol = (x >= x0 - strokeW / 2 && x <= x0 + strokeW / 2 && y >= y0 && y <= y1);
      const isRightCol = (x >= x1 - strokeW / 2 && x <= x1 + strokeW / 2 && y >= y0 && y <= y1);
      const diagDist = Math.abs((y - y0) * (x1 - x0) - (x - x0) * (y1 - y0)) / Math.hypot(x1 - x0, y1 - y0);
      const isDiag = (diagDist <= strokeW / 2 && x >= x0 && x <= x1 && y >= y0 && y <= y1);

      if (isLeftCol || isRightCol || isDiag) {
        r = 214; g = 242; b = 106;
      }

      raw[pxOffset] = r;
      raw[pxOffset + 1] = g;
      raw[pxOffset + 2] = b;
      raw[pxOffset + 3] = a;
    }
  }

  const idatChunk = makeChunk('IDAT', zlib.deflateSync(raw));
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

fs.mkdirSync('public/icons', { recursive: true });
fs.writeFileSync('public/icons/icon-192.png', createPng(192, false));
fs.writeFileSync('public/icons/icon-192-maskable.png', createPng(192, true));
fs.writeFileSync('public/icons/icon-512.png', createPng(512, false));
fs.writeFileSync('public/icons/icon-512-maskable.png', createPng(512, true));
console.log('Successfully generated PWA icons: icon-192.png, icon-192-maskable.png, icon-512.png, icon-512-maskable.png');
