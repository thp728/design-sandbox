// Linear path-traced light to 8-bit sRGB, in a fixed order that keeps black exactly black:
//   1. mask pixels that are exactly 0 (rays that missed everything)
//   2. exposure (auto, then the manual offset), then the tone map (three.js ACES filmic or AgX,
//      ported so preview and export agree)
//   3. black point: pixels whose luminance would encode below it join the mask
//   4. sRGB encode
//   5. grain, then dither, on unmasked pixels only, clamped to at least level 1
//   6. quantise
// An output pixel is 0,0,0 exactly when it is masked.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const srgbEncode = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

const rrtOdt = (x) => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.432951) + 0.238081);

export function aces(r, g, b, exposure, out) {
  r *= exposure / 0.6; g *= exposure / 0.6; b *= exposure / 0.6;
  const ir = 0.59719 * r + 0.35458 * g + 0.04823 * b;
  const ig = 0.076 * r + 0.90834 * g + 0.01566 * b;
  const ib = 0.0284 * r + 0.13383 * g + 0.83777 * b;
  const fr = rrtOdt(ir), fg = rrtOdt(ig), fb = rrtOdt(ib);
  out[0] = clamp01(1.60475 * fr - 0.53108 * fg - 0.07367 * fb);
  out[1] = clamp01(-0.10208 * fr + 1.10813 * fg - 0.00605 * fb);
  out[2] = clamp01(-0.00327 * fr - 0.07276 * fg + 1.07602 * fb);
  return out;
}

const AGX_MIN_EV = -12.47393, AGX_MAX_EV = 4.026069;
const agxContrast = (x) => {
  const x2 = x * x, x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
};
const agxLog = (x) => clamp01((Math.log2(Math.max(x, 1e-10)) - AGX_MIN_EV) / (AGX_MAX_EV - AGX_MIN_EV));

export function agx(r, g, b, exposure, out) {
  r *= exposure; g *= exposure; b *= exposure;
  // linear sRGB to linear Rec.2020
  const r2 = 0.6274 * r + 0.3293 * g + 0.0433 * b;
  const g2 = 0.0691 * r + 0.9195 * g + 0.0113 * b;
  const b2 = 0.0164 * r + 0.088 * g + 0.8956 * b;
  // inset
  const ri = 0.856627153315983 * r2 + 0.0951212405381588 * g2 + 0.0482516061458583 * b2;
  const gi = 0.137318972929847 * r2 + 0.761241990602591 * g2 + 0.101439036467562 * b2;
  const bi = 0.11189821299995 * r2 + 0.0767994186031903 * g2 + 0.811302368396859 * b2;
  const cr = agxContrast(agxLog(ri)), cg = agxContrast(agxLog(gi)), cb = agxContrast(agxLog(bi));
  // outset
  let ro = 1.1271005818144368 * cr - 0.11060664309660323 * cg - 0.016493938717834573 * cb;
  let go = -0.1413297634984383 * cr + 1.157823702216272 * cg - 0.016493938717834257 * cb;
  let bo = -0.14132976349843826 * cr - 0.11060664309660294 * cg + 1.2519364065950405 * cb;
  ro = Math.pow(Math.max(0, ro), 2.2); go = Math.pow(Math.max(0, go), 2.2); bo = Math.pow(Math.max(0, bo), 2.2);
  // linear Rec.2020 to linear sRGB
  out[0] = clamp01(1.6605 * ro - 0.5876 * go - 0.0728 * bo);
  out[1] = clamp01(-0.1246 * ro + 1.1329 * go - 0.0083 * bo);
  out[2] = clamp01(-0.0182 * ro - 0.1006 * go + 1.1187 * bo);
  return out;
}

export const TONE_MAPS = { aces, agx };

// Deterministic per-pixel noise in [0, 1) from integer coordinates and a seed (PCG hash).
function noise(x, y, k, seed) {
  let v = (Math.imul(x, 1973) + Math.imul(y, 9277) + Math.imul(k, 26699) + Math.imul(seed | 0, 104729)) >>> 0;
  v = (Math.imul(v, 747796405) + 2891336453) >>> 0;
  const w = Math.imul((v >>> ((v >>> 28) + 4)) ^ v, 277803737) >>> 0;
  return ((w >>> 22) ^ w) / 4294967296;
}

// Linear luminance the auto exposure maps the 99.5th percentile of lit pixels to. ACES filmic puts
// it at about 0.93, just under white.
export const AUTO_TARGET = 1.6;
const AUTO_RANGE = [1 / 32, 32];

// The scale that brings the 99.5th percentile of lit pixels to AUTO_TARGET, or 1 for an empty frame.
export function autoExposure(linear) {
  const n = linear.length / 4, stride = Math.max(1, Math.floor(n / 200_000));
  const lum = [];
  for (let p = 0; p < n; p += stride) {
    const i = p * 4, y = 0.2126 * linear[i] + 0.7152 * linear[i + 1] + 0.0722 * linear[i + 2];
    if (y > 0) lum.push(y);
  }
  if (lum.length === 0) return 1;
  lum.sort((a, b) => a - b);
  const p995 = lum[Math.min(lum.length - 1, Math.floor(lum.length * 0.995))];
  return Math.min(AUTO_RANGE[1], Math.max(AUTO_RANGE[0], AUTO_TARGET / p995));
}

/**
 * @param {Float32Array} linear RGBA, rows top to bottom
 * @returns {{data: Uint8ClampedArray, masked: number, exposure: number}} RGBA 8-bit
 */
export function processOutput(linear, width, height, params, { seed = 0 } = {}) {
  const tone = TONE_MAPS[params['output.toneMap']];
  const exposure = Math.pow(2, params['output.exposure']) * (params['output.autoExposure'] ? autoExposure(linear) : 1);
  const blackPoint = params['output.blackPoint'] / 255;
  const grain = params['output.grain'];
  const dither = params['output.dither'];
  const data = new Uint8ClampedArray(width * height * 4);
  const t = [0, 0, 0];
  let masked = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i + 3] = 255;
      const r = linear[i], g = linear[i + 1], b = linear[i + 2];
      if (!(r > 0 || g > 0 || b > 0)) { masked++; continue; }
      tone(r, g, b, exposure, t);
      const lum = 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2];
      if (srgbEncode(lum) < blackPoint) { masked++; continue; }
      const gn = grain > 0 ? 1 + grain * (noise(x, y, 3, seed) + noise(x, y, 4, seed) - 1) : 1;
      let top = 0;
      for (let c = 0; c < 3; c++) {
        const e = srgbEncode(t[c]) * gn * 255;
        const d = dither ? noise(x, y, c, seed) + noise(x, y, c + 5, seed) - 1 : 0;
        data[i + c] = Math.min(255, Math.max(0, Math.floor(e + d + 0.5)));
        if (t[c] > t[top]) top = c;
      }
      // a lit pixel never quantises to black: lift its brightest channel instead of all three
      if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) data[i + top] = 1;
    }
  }
  return { data, masked, exposure };
}
