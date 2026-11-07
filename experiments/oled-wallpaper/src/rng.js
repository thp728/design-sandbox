// Seeded random streams. Each parameter draws from its own stream, keyed by the seed and the
// parameter id, so adding a parameter never changes what the others draw.

// cyrb53: a fast 53-bit string hash with good avalanche.
export function hash(str, salt = 0) {
  let h1 = 0xdeadbeef ^ salt, h2 = 0x41c6ce57 ^ salt;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// sfc32, seeded from the hash of "<seed>:<id>". Returns floats in [0, 1).
export function stream(seed, id) {
  const h = hash(`${seed}:${id}`);
  let a = h >>> 0, b = Math.floor(h / 4294967296) >>> 0, c = hash(id, seed >>> 0) >>> 0, d = 1;
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  return next;
}
