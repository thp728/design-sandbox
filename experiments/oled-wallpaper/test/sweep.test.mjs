import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildForm } from '../src/form/index.js';
import { buildPath } from '../src/form/paths.js';
import { frames, twistProfile, widthProfile } from '../src/form/sweep.js';
import { resolve } from '../src/resolve.js';

const Q = { along: 900, around: 24 }; // the draft's density along the path
const params = (o = {}) => resolve({ overrides: o }).params;
const cases = [
  { 'form.path': 'knot' },
  { 'form.path': 'knot', 'form.length': 0.6, 'form.section': 'tube' },
  { 'form.path': 'lissajous', 'form.section': 'tube', 'form.twist.turns': -1.5 },
  { 'form.path': 'spiral', 'form.width.profile': 'taper', 'form.width.amount': 1 },
  { 'form.path': 'spiral', 'form.width.profile': 'swell', 'form.section': 'tube', 'form.section.squareness': 1 },
];

test('meshes have no NaN and every index is in range', () => {
  for (const c of cases) {
    const m = buildForm(params(c), Q);
    assert.ok(m.position.every(Number.isFinite), JSON.stringify(c));
    assert.ok(m.normal.every(Number.isFinite), JSON.stringify(c));
    const n = m.position.length / 3;
    assert.ok(m.index.every((i) => i < n), JSON.stringify(c));
  }
});

test('paths are normalised to radius 1', () => {
  for (const path of ['knot', 'lissajous', 'spiral']) {
    const { points, count } = buildPath(params({ 'form.path': path }), 200);
    let r = 0;
    for (let i = 0; i < count; i++) r = Math.max(r, Math.hypot(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]));
    assert.ok(Math.abs(r - 1) < 1e-9, `${path} radius ${r}`);
  }
});

test('frames stay orthonormal', () => {
  const { points, count, closed } = buildPath(params({ 'form.path': 'lissajous' }), 400);
  const { T, N } = frames(points, count, closed);
  for (let i = 0; i < T.length; i++) {
    const t = T[i], n = N[i];
    assert.ok(Math.abs(Math.hypot(...t) - 1) < 1e-9 && Math.abs(Math.hypot(...n) - 1) < 1e-9, `unit at ${i}`);
    assert.ok(Math.abs(t[0] * n[0] + t[1] * n[1] + t[2] * n[2]) < 1e-6, `perpendicular at ${i}`);
  }
});

test('triangles wind outward, for the fixed cases and 60 random seeds', () => {
  const all = [...cases.map((c) => params(c)), ...Array.from({ length: 60 }, (_, i) => resolve({ seed: 1000 + i }).params)];
  for (const p of all) {
    const c = Object.fromEntries(Object.entries(p).filter(([k]) => k.startsWith('form.')));
    const m = buildForm(p, Q);
    assert.ok(m.position.every(Number.isFinite), JSON.stringify(c));
    let outward = 0, total = 0;
    for (let k = 0; k < m.index.length; k += 3) {
      const [a, b, d] = [m.index[k], m.index[k + 1], m.index[k + 2]].map((i) => [m.position[i * 3], m.position[i * 3 + 1], m.position[i * 3 + 2]]);
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (Math.hypot(...fn) < 1e-12) continue;
      const vn = [0, 1, 2].map((c2) => m.normal[m.index[k] * 3 + c2] + m.normal[m.index[k + 1] * 3 + c2] + m.normal[m.index[k + 2] * 3 + c2]);
      total++;
      if (fn[0] * vn[0] + fn[1] * vn[1] + fn[2] * vn[2] > 0) outward++;
    }
    assert.ok(outward / total > 0.999, `${JSON.stringify(c)}: ${outward}/${total} faces agree with their normals`);
  }
});

test('closed loops meet at the seam', () => {
  for (const turns of [0, 0.5, 1, -1.5, 1.3]) {
    const p = params({ 'form.path': 'knot', 'form.twist.turns': turns, 'form.section': 'tube' });
    const m = buildForm(p, Q);
    assert.equal(m.twistTurns, Math.round(turns * 2) / 2);
    // the first and last rings hold the same set of points
    const ring = Q.around, first = [], last = [];
    for (let k = 0; k < ring; k++) {
      first.push([0, 1, 2].map((c) => m.position[k * 3 + c]));
      last.push([0, 1, 2].map((c) => m.position[(Q.along * ring + k) * 3 + c]));
    }
    for (const q of last) {
      const d = Math.min(...first.map((f) => Math.hypot(f[0] - q[0], f[1] - q[1], f[2] - q[2])));
      assert.ok(d < 1e-4, `turns ${turns}: seam gap ${d}`);
    }
  }
});

test('profiles hit their end values', () => {
  for (const k of ['even', 'middle', 'ends']) {
    const g = twistProfile(k);
    assert.ok(Math.abs(g(0)) < 1e-12 && Math.abs(g(1) - 1) < 1e-12, k);
  }
  assert.equal(widthProfile('constant', 0.5, false)(0.3), 1);
  assert.ok(Math.abs(widthProfile('taper', 0.6, false)(1) - 0.4) < 1e-12);
  assert.ok(Math.abs(widthProfile('swell', 0.6, false)(0.5) - 1) < 1e-12);
  assert.ok(widthProfile('taper', 1, false)(1) > 0, 'a full taper keeps a minimum width');
  const closedTaper = widthProfile('taper', 0.5, true);
  assert.ok(Math.abs(closedTaper(0) - closedTaper(1)) < 1e-12, 'closed profiles match at the seam');
});
