import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_TARGET, TONE_MAPS, autoExposure, processOutput } from '../src/output.js';
import { resolve } from '../src/resolve.js';

const params = (o = {}) => resolve({ overrides: o }).params;

test('each tone map sends 0 to 0', () => {
  for (const [name, f] of Object.entries(TONE_MAPS)) {
    const out = f(0, 0, 0, 1, [9, 9, 9]);
    assert.ok(out.every((v) => v < 1e-3), `${name}: ${out}`);
  }
});

test('tone maps rise with input', () => {
  for (const [name, f] of Object.entries(TONE_MAPS)) {
    let prev = -1;
    for (const x of [0.001, 0.01, 0.1, 1, 10]) {
      const y = f(x, x, x, 1, [0, 0, 0])[1];
      assert.ok(y > prev, `${name} at ${x}`);
      prev = y;
    }
  }
});

// A ramp from 0 to bright, plus exact-zero pixels.
function ramp(width, height) {
  const px = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, v = y === 0 ? 0 : (x / width) ** 4 * 2;
    px[i] = v * 0.2; px[i + 1] = v * 0.4; px[i + 2] = v; px[i + 3] = 1;
  }
  return px;
}

test('masked pixels are exactly black and lit pixels never are, across tone maps, grain and dither', () => {
  const w = 256, h = 8, lin = ramp(w, h);
  for (const toneMap of ['aces', 'agx']) for (const grain of [0, 0.05]) for (const dither of [true, false]) {
    const p = params({ 'output.toneMap': toneMap, 'output.grain': grain, 'output.dither': dither });
    const { data, masked } = processOutput(lin, w, h, p, { seed: 3 });
    let zeros = 0;
    for (let i = 0; i < w * h; i++) {
      const isZero = data[i * 4] === 0 && data[i * 4 + 1] === 0 && data[i * 4 + 2] === 0;
      if (isZero) zeros++;
      if (lin[i * 4] === 0 && lin[i * 4 + 1] === 0 && lin[i * 4 + 2] === 0) assert.ok(isZero, `${toneMap} grain ${grain} dither ${dither}: input 0 at ${i} came out lit`);
    }
    assert.equal(zeros, masked, `${toneMap} grain ${grain} dither ${dither}`);
  }
});

test('the black point removes the levels just above black', () => {
  const w = 512, h = 2, lin = ramp(w, h);
  const { data } = processOutput(lin, w, h, params({ 'output.blackPoint': 2.5, 'output.dither': false }));
  let darkest = 256;
  for (let i = 0; i < w * h; i++) {
    const m = Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    if (m > 0) darkest = Math.min(darkest, m);
  }
  assert.ok(darkest >= 2, `darkest lit level ${darkest}`);
});

test('auto exposure brings the 99.5th percentile of lit pixels to the target and ignores black', () => {
  const n = 10_000, lin = new Float32Array(n * 4 * 2); // half the frame black
  for (let p = 0; p < n; p++) lin.fill(p / n, p * 4, p * 4 + 3);
  const scale = autoExposure(lin);
  assert.ok(Math.abs(scale * 0.995 - AUTO_TARGET) < 0.01, `scale ${scale}`);
  assert.equal(autoExposure(new Float32Array(64)), 1, 'an empty frame is left alone');
});

test('the same seed gives the same bytes', () => {
  const w = 64, h = 16, lin = ramp(w, h), p = params({ 'output.grain': 0.03 });
  assert.deepEqual(processOutput(lin, w, h, p, { seed: 1 }).data, processOutput(lin, w, h, p, { seed: 1 }).data);
});
