// Sweeps a cross-section along a path into an indexed triangle mesh.
//
// Frames are rotation-minimising (Wang et al. 2008, double reflection), so the ribbon only turns
// where the twist says. On a closed path the leftover frame rotation at the seam is spread along
// the length, and the twist rounds to half turns, so the last ring lands on the first.
// Triangles wind outward: the path tracer culls faces wound inward.

const TAU = 2 * Math.PI;
const MIN_WIDTH = 0.03;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
// Rotate v about unit axis k by angle a (Rodrigues).
const rotate = (v, k, a) => {
  const c = Math.cos(a), s = Math.sin(a), kv = cross(k, v), d = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * d, v[1] * c + kv[1] * s + k[1] * d, v[2] * c + kv[2] * s + k[2] * d];
};

export function widthProfile(kind, amount, closed) {
  const a = amount;
  const f = {
    constant: () => 1,
    taper: closed ? (s) => 1 - a * (0.5 + 0.5 * Math.cos(TAU * s)) : (s) => 1 - a * s,
    swell: closed ? (s) => 1 - a + a * (0.5 - 0.5 * Math.cos(2 * TAU * s)) : (s) => 1 - a + a * Math.sin(Math.PI * s),
  }[kind];
  return (s) => Math.max(MIN_WIDTH, f(s));
}

// g(0) = 0 and g(1) = 1 for every profile, so the total twist is the same; only where it gathers moves.
export function twistProfile(kind) {
  return {
    even: (s) => s,
    middle: (s) => s - Math.sin(TAU * s) / TAU,
    ends: (s) => s + (0.9 * Math.sin(TAU * s)) / TAU,
  }[kind];
}

export function frames(points, count, closed) {
  const P = (i) => [points[i * 3], points[i * 3 + 1], points[i * 3 + 2]];
  const rings = closed ? count + 1 : count;
  const at = (i) => P(closed ? i % count : i);
  const T = [];
  for (let i = 0; i < rings; i++) {
    const prev = closed ? at(i - 1 + count) : at(Math.max(0, i - 1));
    const next = closed ? at(i + 1) : at(Math.min(count - 1, i + 1));
    T.push(norm(sub(next, prev)));
  }
  // first normal: perpendicular to the tangent, built from the axis it leans on least
  const t0 = T[0];
  const axis = Math.abs(t0[0]) < 0.6 ? [1, 0, 0] : Math.abs(t0[1]) < 0.6 ? [0, 1, 0] : [0, 0, 1];
  const N = [norm(cross(cross(t0, axis), t0))];
  for (let i = 0; i < rings - 1; i++) {
    const v1 = sub(at(i + 1), at(i)), c1 = dot(v1, v1) || 1e-12;
    const rL = sub(N[i], scale(v1, (2 / c1) * dot(v1, N[i])));
    const tL = sub(T[i], scale(v1, (2 / c1) * dot(v1, T[i])));
    const v2 = sub(T[i + 1], tL), c2 = dot(v2, v2);
    N.push(norm(c2 < 1e-14 ? rL : sub(rL, scale(v2, (2 / c2) * dot(v2, rL)))));
  }
  let holonomy = 0;
  if (closed) {
    const last = N[rings - 1];
    holonomy = Math.atan2(dot(cross(last, N[0]), T[0]), dot(last, N[0]));
  }
  return { T, N, rings, holonomy };
}

// Where the path bends tighter than the section reaches towards the bend's centre, the inner edge
// would fold through itself and the tracer would cull the inverted faces. Shrink the section there
// instead, eased along the length so the pinch reads as a tightening, not a kink.
const FOLD_MARGIN = 0.8;
function pinchTightBends(rings, closed) {
  const m = rings.length;
  const at = (i) => rings[closed ? (i + m - 1) % (m - 1) : Math.min(m - 1, Math.max(0, i))];
  const factor = new Float64Array(m).fill(1);
  for (let i = 0; i < m; i++) {
    const a = at(i - 1), c = at(i + 1);
    const ds = Math.hypot(...sub(c.p, a.p)) || 1e-12;
    const k = scale(sub(c.t, a.t), 1 / ds); // curvature vector, length 1 / radius
    const curvature = Math.hypot(...k);
    if (curvature < 1e-9) continue;
    const kh = scale(k, 1 / curvature), f = rings[i];
    const reach = (f.w / 2) * Math.abs(dot(f.n, kh)) + (f.h / 2) * Math.abs(dot(f.b, kh));
    const limit = FOLD_MARGIN / curvature;
    if (reach > limit) factor[i] = limit / reach;
  }
  // Spread each pinch: running minimum, then a box blur, over a window of about 2% of the length.
  // Every value in the blur window is a minimum over a window that contains i, so the result never
  // exceeds the factor ring i needs.
  const win = Math.max(2, Math.round(m * 0.02));
  const idx = (i) => (closed ? (i + 2 * (m - 1)) % (m - 1) : Math.min(m - 1, Math.max(0, i)));
  const minned = factor.map((_, i) => { let v = 1; for (let d = -win; d <= win; d++) v = Math.min(v, factor[idx(i + d)]); return v; });
  for (let i = 0; i < m; i++) {
    let sum = 0;
    for (let d = -win; d <= win; d++) sum += minned[idx(i + d)];
    const f = sum / (2 * win + 1);
    rings[i].w *= f;
    rings[i].h *= f;
  }
}

/**
 * @param {{points: Float64Array, count: number, closed: boolean}} path
 * @param {{strips: Array, cap: number[][]}} section
 * @param {{width: number, thickness: number, widthAt: (s) => number, twistTurns: number, twistAt: (s) => number}} shape
 * @returns {{position: Float32Array, normal: Float32Array, index: Uint32Array, closed: boolean, twistTurns: number}}
 */
export function sweep(path, section, shape) {
  const { count, closed } = path;
  const { T, N, rings, holonomy } = frames(path.points, count, closed);
  const twistTurns = closed ? Math.round(shape.twistTurns * 2) / 2 : shape.twistTurns;
  const point = (i) => { const j = closed ? i % count : i; return [path.points[j * 3], path.points[j * 3 + 1], path.points[j * 3 + 2]]; };

  const pos = [], nrm = [], idx = [];
  const ringFrame = (i) => {
    const s = i / (rings - 1);
    const angle = (closed ? holonomy * s : 0) + TAU * twistTurns * shape.twistAt(s);
    const n = rotate(N[i], T[i], angle);
    const b = cross(T[i], n);
    return { p: point(i), n, b, t: T[i], w: shape.width * shape.widthAt(s), h: shape.thickness };
  };
  const ringsData = Array.from({ length: rings }, (_, i) => ringFrame(i));
  pinchTightBends(ringsData, closed);
  const place = ({ p, n, b, w, h }, [u, v]) => [p[0] + n[0] * u * w + b[0] * v * h, p[1] + n[1] * u * w + b[1] * v * h, p[2] + n[2] * u * w + b[2] * v * h];

  for (const strip of section.strips) {
    const m = strip.points.length;
    const base = pos.length / 3;
    for (const f of ringsData) {
      for (let k = 0; k < m; k++) {
        pos.push(...place(f, strip.points[k]));
        const [nu, nv] = strip.normals[k];
        nrm.push(...norm([f.n[0] * nu / f.w + f.b[0] * nv / f.h, f.n[1] * nu / f.w + f.b[1] * nv / f.h, f.n[2] * nu / f.w + f.b[2] * nv / f.h]));
      }
    }
    const edges = strip.closed ? m : m - 1;
    for (let i = 0; i < rings - 1; i++) {
      for (let k = 0; k < edges; k++) {
        const a = base + i * m + k, b = base + i * m + ((k + 1) % m), c = a + m, d = b + m;
        idx.push(a, b, c, b, d, c);
      }
    }
  }

  if (!closed) {
    for (const [f, dir] of [[ringsData[0], -1], [ringsData[rings - 1], 1]]) {
      const base = pos.length / 3;
      const cn = scale(f.t, dir);
      pos.push(...f.p); nrm.push(...cn);
      for (const uv of section.cap) { pos.push(...place(f, uv)); nrm.push(...cn); }
      const m = section.cap.length;
      for (let k = 0; k < m; k++) {
        const a = base + 1 + k, b = base + 1 + ((k + 1) % m);
        if (dir > 0) idx.push(base, a, b);
        else idx.push(base, b, a);
      }
    }
  }

  return { position: new Float32Array(pos), normal: new Float32Array(nrm), index: new Uint32Array(idx), closed, twistTurns };
}
