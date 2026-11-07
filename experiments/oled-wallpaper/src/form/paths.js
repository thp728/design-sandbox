// Curve families the ribbon follows. Each path is resampled evenly by arc length, centred, and
// scaled so its farthest point sits at radius 1.

const TAU = 2 * Math.PI;
const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

// Each family maps t in [0, 1) to a point. Closed families repeat with period 1.
const FAMILIES = {
  knot: (p) => {
    const d = gcd(p['form.knot.p'], p['form.knot.q']);
    const kp = p['form.knot.p'] / d, kq = p['form.knot.q'] / d, depth = p['form.knot.depth'];
    return {
      closed: true,
      at: (t) => {
        const a = TAU * t, r = 1 + depth * Math.cos(kq * a);
        return [r * Math.cos(kp * a), r * Math.sin(kp * a), depth * Math.sin(kq * a)];
      },
    };
  },
  lissajous: (p) => {
    const a0 = p['form.lissajous.a'], b0 = p['form.lissajous.b'], c0 = p['form.lissajous.c'];
    const d = gcd(gcd(a0, b0), c0);
    const a = a0 / d, b = b0 / d, c = c0 / d;
    const pa = TAU * p['form.lissajous.phaseA'], pb = TAU * p['form.lissajous.phaseB'];
    return { closed: true, at: (t) => [Math.sin(a * TAU * t + pa), Math.sin(b * TAU * t), Math.sin(c * TAU * t + pb)] };
  },
  spiral: (p) => {
    const turns = p['form.spiral.turns'], pitch = p['form.spiral.pitch'], flare = p['form.spiral.flare'];
    return {
      closed: false,
      at: (t) => {
        const a = TAU * turns * t, r = 1 - flare + flare * t;
        return [r * Math.cos(a), r * Math.sin(a), pitch * turns * (t - 0.5) * 0.5];
      },
    };
  },
};

const SMOOTH_SIGMA = 0.005; // as a share of the path's length

// Resamples a polyline of m points into n points evenly spaced by arc length. A closed input repeats
// its first point at the end; a closed output does not.
function resample(src, m, n, closed) {
  const cum = new Float64Array(m);
  for (let i = 1; i < m; i++) cum[i] = cum[i - 1] + Math.hypot(src[i * 3] - src[i * 3 - 3], src[i * 3 + 1] - src[i * 3 - 2], src[i * 3 + 2] - src[i * 3 - 1]);
  const total = cum[m - 1], steps = closed ? n : n - 1;
  const out = new Float64Array(n * 3);
  for (let i = 0, j = 0; i < n; i++) {
    const target = (total * i) / steps;
    while (j < m - 2 && cum[j + 1] < target) j++;
    const f = (target - cum[j]) / (cum[j + 1] - cum[j] || 1);
    for (let c = 0; c < 3; c++) out[i * 3 + c] = src[j * 3 + c] + f * (src[j * 3 + 3 + c] - src[j * 3 + c]);
  }
  return out;
}

const appendFirst = (pts, n) => { const out = new Float64Array((n + 1) * 3); out.set(pts); out.set(pts.subarray(0, 3), n * 3); return out; };

// Repeated [1, 2, 1] / 4 passes approximate a Gaussian with variance passes / 2 samples squared.
// Open paths keep their end points.
function smooth(pts, n, closed, passes) {
  const tmp = new Float64Array(pts.length);
  for (let k = 0; k < passes; k++) {
    for (let i = 0; i < n; i++) {
      const a = closed ? (i - 1 + n) % n : Math.max(0, i - 1), b = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
      for (let c = 0; c < 3; c++) tmp[i * 3 + c] = (!closed && (i === 0 || i === n - 1)) ? pts[i * 3 + c] : (pts[a * 3 + c] + 2 * pts[i * 3 + c] + pts[b * 3 + c]) / 4;
    }
    pts.set(tmp);
  }
}

/**
 * @returns {{points: Float64Array, count: number, closed: boolean}} xyz per point. A closed path
 *   does not repeat its first point at the end.
 */
export function buildPath(params, count) {
  const family = FAMILIES[params['form.path']](params);
  const length = params['form.length'];
  const closed = family.closed && length >= 1;
  let t0, t1;
  if (closed) [t0, t1] = [0, 1];
  else if (family.closed) [t0, t1] = [params['form.start'], params['form.start'] + length];
  else { t0 = params['form.start'] * (1 - length); t1 = t0 + length; }

  // Dense samples, even resampling by arc length, then smoothing. Where all three axes slow at once a
  // Lissajous turns back on itself in a hairpin no ribbon can follow; smoothing rounds it into a
  // small loop. Smoothing shifts the spacing, so resample once more.
  const dense = count * 8;
  const raw = new Float64Array((dense + 1) * 3);
  for (let i = 0; i <= dense; i++) raw.set(family.at(t0 + ((t1 - t0) * i) / dense), i * 3);
  const n = closed ? count : count + 1;
  const even = resample(raw, dense + 1, n, closed);
  smooth(even, n, closed, Math.ceil(2 * (count * SMOOTH_SIGMA) ** 2));
  const points = resample(closed ? appendFirst(even, n) : even, closed ? n + 1 : n, n, closed);

  // Centre on the bounding box and scale to radius 1.
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], points[i * 3 + c]); hi[c] = Math.max(hi[c], points[i * 3 + c]); }
  const mid = lo.map((l, c) => (l + hi[c]) / 2);
  let radius = 0;
  for (let i = 0; i < n; i++) radius = Math.max(radius, Math.hypot(points[i * 3] - mid[0], points[i * 3 + 1] - mid[1], points[i * 3 + 2] - mid[2]));
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) points[i * 3 + c] = (points[i * 3 + c] - mid[c]) / radius;
  return { points, count: n, closed };
}
