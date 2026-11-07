import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/analyze.js';
import { decodePng, encodePng } from '../src/png.js';

const blank = (width, height) => ({ width, height, data: new Uint8Array(width * height * 4).map((_, i) => (i % 4 === 3 ? 255 : 0)) });
const fill = (img, x0, y0, w, h, v) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const i = (y * img.width + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; }
  return img;
};

test('a black frame with a big lit form in the middle passes', () => {
  const img = fill(blank(400, 300), 100, 120, 200, 150, 200);
  const r = analyze(img);
  assert.deepEqual(r.failures, []);
  assert.equal(r.blackPct, 75);
  assert.equal(r.darkest, 200);
});

test('the checker catches a lit top band, a lone speck and a haze, one line each', () => {
  const img = blank(864, 559);
  fill(img, 700, 5, 40, 10, 220); // in the top band, right of the notch
  fill(img, 300, 400, 2, 2, 255); // a 2 x 2 speck
  fill(img, 0, 200, 864, 60, 2); // haze at level 2, about 10% of the frame
  const r = analyze(img);
  assert.equal(r.failures.length, 3, r.failures.join('\n'));
  assert.match(r.failures.join('\n'), /top band/);
  assert.match(r.failures.join('\n'), /specks: 1 /);
  assert.match(r.failures.join('\n'), /haze/);
});

test('light below the band but inside the notch area fails as notch', () => {
  const img = fill(blank(1000, 1000), 480, 80, 40, 20, 150); // rows 80 to 99: below 6%, above 12%
  assert.match(analyze(img).failures.join('\n'), /notch/);
});

test('single-pixel fireflies are not specks', () => {
  const img = fill(blank(864, 559), 300, 300, 1, 1, 255);
  assert.equal(analyze(img).specks, 0);
});

test('PNG round-trips', () => {
  const img = fill(blank(37, 11), 3, 2, 10, 5, 128);
  img.data[5] = 77;
  const back = decodePng(encodePng(img));
  assert.equal(back.width, 37);
  assert.deepEqual(Array.from(back.data), Array.from(img.data));
});
