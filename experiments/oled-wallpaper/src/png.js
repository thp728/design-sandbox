// Minimal 8-bit PNG codec for Node: RGB and RGBA, non-interlaced. Enough to read what the browser
// writes and to build synthetic test images.
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** @param {{width: number, height: number, data: Uint8Array}} img RGBA, 4 bytes per pixel */
export function encodePng({ width, height, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** @returns {{width: number, height: number, data: Uint8Array}} RGBA */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let off = 8, width, height, depth, type, interlace;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), t = buf.toString('ascii', off + 4, off + 8), d = buf.subarray(off + 8, off + 8 + len);
    if (t === 'IHDR') ({ width, height, depth, type, interlace } = { width: d.readUInt32BE(0), height: d.readUInt32BE(4), depth: d[8], type: d[9], interlace: d[12] });
    else if (t === 'IDAT') idat.push(d);
    else if (t === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || (type !== 2 && type !== 6) || interlace !== 0) throw new Error(`unsupported PNG: depth ${depth}, colour type ${type}, interlace ${interlace}`);
  const bpp = type === 6 ? 4 : 3, stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const cur = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[dst + x - bpp] : 0, b = y > 0 ? cur[dst - stride + x] : 0, c = x >= bpp && y > 0 ? cur[dst - stride + x - bpp] : 0;
      const v = raw[src + x];
      cur[dst + x] = (f === 0 ? v : f === 1 ? v + a : f === 2 ? v + b : f === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c)) & 0xff;
    }
  }
  if (bpp === 4) return { width, height, data: cur };
  const data = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < cur.length; i += 3, j += 4) { data[j] = cur[i]; data[j + 1] = cur[i + 1]; data[j + 2] = cur[i + 2]; data[j + 3] = 255; }
  return { width, height, data };
}
