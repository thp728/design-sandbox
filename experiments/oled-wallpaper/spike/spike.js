// Spike: can headless Chrome path-trace on this Mac's GPU, how fast, and does black stay black?
// Throwaway. The real renderer lives in src/ once the spike has answered.
import * as THREE from 'three/webgpu';

const canvas = document.getElementById('c');

// A ribbon swept along a closed curve with parallel-transport frames, a rectangular section and twist.
function ribbon(curve, { width, thickness, twist, segments = 600 }) {
  const pts = curve.getSpacedPoints(segments);
  const tangents = pts.map((_, i) => pts[(i + 1) % segments].clone().sub(pts[(i - 1 + segments) % segments]).normalize());
  let normal = new THREE.Vector3(0, 0, 1).cross(tangents[0]).normalize();
  const frames = [];
  for (let i = 0; i <= segments; i++) {
    const t = tangents[i % segments];
    if (i > 0) {
      const prev = tangents[(i - 1) % segments];
      const axis = prev.clone().cross(t);
      if (axis.lengthSq() > 1e-12) normal.applyAxisAngle(axis.normalize(), Math.acos(THREE.MathUtils.clamp(prev.dot(t), -1, 1)));
    }
    const angle = twist * 2 * Math.PI * (i / segments);
    const n = normal.clone().applyAxisAngle(t, angle);
    const b = t.clone().cross(n).normalize();
    frames.push({ p: pts[i % segments], n, b });
  }
  const hw = width / 2, ht = thickness / 2;
  const corners = [[-hw, -ht], [hw, -ht], [hw, ht], [-hw, ht]];
  // Each side gets its own two vertices per ring, so smoothing runs along the ribbon but never round a corner.
  const pos = [], idx = [];
  for (const { p, n, b } of frames) for (let c = 0; c < 4; c++) for (const k of [c, (c + 1) % 4]) {
    const [u, v] = corners[k];
    pos.push(...p.clone().addScaledVector(n, u).addScaledVector(b, v).toArray());
  }
  for (let i = 0; i < segments; i++) for (let c = 0; c < 4; c++) {
    const a = i * 8 + c * 2, bb = a + 1, cc = a + 8, d = a + 9;
    idx.push(a, bb, cc, bb, d, cc);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

class Knot extends THREE.Curve {
  constructor(p, q, r) { super(); this.p = p; this.q = q; this.r = r; }
  getPoint(t, out = new THREE.Vector3()) {
    const a = t * 2 * Math.PI, { p, q, r } = this;
    const rr = r * (2 + Math.cos(q * a));
    return out.set(rr * Math.cos(p * a), rr * Math.sin(p * a), -r * Math.sin(q * a));
  }
}

function buildScene(width, height) {
  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);
  camera.position.set(0.6, -0.4, 9);
  camera.lookAt(0.6, -0.4, 0);

  const metal = new THREE.MeshPhysicalMaterial({ color: 0x2f5bff, metalness: 1, roughness: 0.22 });
  const gloss = new THREE.MeshPhysicalMaterial({ color: 0x0b1a4a, metalness: 0, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03 });
  const a = new THREE.Mesh(ribbon(new Knot(2, 3, 0.9), { width: 0.55, thickness: 0.05, twist: 2 }), metal);
  const b = new THREE.Mesh(ribbon(new Knot(3, 2, 0.6), { width: 0.3, thickness: 0.04, twist: 1 }), gloss);
  a.position.set(1.2, -0.8, 0);
  b.position.set(-1.6, 0.6, -1);
  scene.add(a, b);

  // Softbox overhead and a rim strip behind, the product-shot setup. Metal only shows what it reflects,
  // so the lights must be large.
  const key = new THREE.RectAreaLight(0xffffff, 40, 14, 5);
  key.position.set(-3, 7, 5);
  key.lookAt(0, 0, 0);
  const rim = new THREE.RectAreaLight(0xdfe8ff, 80, 12, 1);
  rim.position.set(3, -2, -6);
  rim.lookAt(0, 0, 0);
  // Sits inside the camera's view, facing the ribbons, to see whether the tracer draws the light itself.
  const inView = new THREE.RectAreaLight(0xbcd2ff, 30, 1.2, 1.2);
  inView.position.set(2.2, 1.4, 2);
  inView.lookAt(1.2, -0.8, 0);
  scene.add(key, rim, inView);
  return { scene, camera };
}

const tick = () => new Promise((r) => requestAnimationFrame(r));

async function traceWebGPU({ width, height, samples, firstSampleTimeoutMs }) {
  const { WebGPUPathTracer } = await import('three-gpu-pathtracer/src/webgpu/index.js');
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: false });
  await renderer.init();
  if (!renderer.backend.isWebGPUBackend) throw new Error('WebGPURenderer fell back to WebGL, no WebGPU adapter');
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.NoToneMapping;
  const adapterInfo = (await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }))?.info ?? {};

  const { scene, camera } = buildScene(width, height);
  const rt = new THREE.RenderTarget(width, height, { type: THREE.FloatType, depthBuffer: false });
  const tracer = new WebGPUPathTracer(renderer);
  Object.assign(tracer, { dynamicLowRes: false, renderDelay: 0, fadeDuration: 0, minSamples: 1, maxSamples: samples, synchronizeRenderSize: false, stableNoise: true, adaptiveFrameBudget: false, frameBudget: Number(new URLSearchParams(location.search).get('budget') ?? 250000) });
  tracer.setSize(width, height);

  const run = async () => {
    const t0 = performance.now();
    tracer.setScene(scene, camera);
    const tBuilt = performance.now();
    let tFirst = null, last = 0, done = false;
    tracer.addEventListener('complete', () => { done = true; });
    tracer.addEventListener('progress', (e) => { if (e.samples) last = e.samples; });
    while (!done) {
      renderer.setRenderTarget(rt);
      tracer.renderSample();
      renderer.setRenderTarget(null);
      await tick();
      if (tFirst === null && tracer.compiling === false && last) tFirst = performance.now();
      if (tFirst === null && performance.now() - t0 > firstSampleTimeoutMs) throw new Error(`no sample within ${firstSampleTimeoutMs} ms`);
    }
    const tEnd = performance.now();
    const counts = await tracer.getSampleCountsAsync();
    const pixels = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, width, height);
    return { pixels, counts, buildMs: tBuilt - t0, firstSampleMs: (tFirst ?? tEnd) - t0, totalMs: tEnd - t0, samplesPerSec: counts.avg / ((tEnd - (tFirst ?? t0)) / 1000) };
  };

  const first = await run();
  tracer.reset();
  const second = await run();
  return { backend: 'webgpu', adapter: `${adapterInfo.vendor ?? ''} ${adapterInfo.architecture ?? ''} ${adapterInfo.description ?? ''}`.trim(), first, second };
}

async function traceWebGL({ width, height, samples, firstSampleTimeoutMs }) {
  const { WebGLPathTracer } = await import('three-gpu-pathtracer/src/core/WebGLPathTracer.js');
  const { WebGLRenderer } = await import('three');
  const gl = new WebGLRenderer({ canvas, antialias: false });
  gl.setPixelRatio(1);
  gl.setSize(width, height, false);
  const ctx = gl.getContext();
  const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
  const adapter = dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER);

  const { scene, camera } = buildScene(width, height);
  const tracer = new WebGLPathTracer(gl);
  Object.assign(tracer, { dynamicLowRes: false, renderDelay: 0, fadeDuration: 0, minSamples: 0, rasterizeScene: false, synchronizeRenderSize: true, stableNoise: true });
  tracer.tiles.set(1, 1);

  const run = async () => {
    const t0 = performance.now();
    tracer.setScene(scene, camera);
    const tBuilt = performance.now();
    let tFirst = null;
    while (tracer.samples < samples) {
      tracer.renderSample();
      await tick();
      if (tFirst === null && tracer.samples >= 1) tFirst = performance.now();
      if (tFirst === null && performance.now() - t0 > firstSampleTimeoutMs) throw new Error(`no sample within ${firstSampleTimeoutMs} ms`);
    }
    const tEnd = performance.now();
    const target = tracer.target;
    const isHalf = target.texture.type === THREE.HalfFloatType;
    const buf = isHalf ? new Uint16Array(width * height * 4) : new Float32Array(width * height * 4);
    gl.readRenderTargetPixels(target, 0, 0, width, height, buf);
    const pixels = isHalf ? Float32Array.from(buf, THREE.DataUtils.fromHalfFloat) : buf;
    return { pixels, counts: { avg: tracer.samples, min: tracer.samples }, buildMs: tBuilt - t0, firstSampleMs: tFirst - t0, totalMs: tEnd - t0, samplesPerSec: tracer.samples / ((tEnd - tFirst) / 1000), flipped: true };
  };

  const first = await run();
  tracer.reset();
  const second = await run();
  return { backend: 'webgl', adapter, first, second };
}

// Narkowicz ACES fit: maps 0 to 0, so missed rays stay black.
const aces = (x) => (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
const srgb = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

async function toPng(pixels, width, height, flipped) {
  const out = new Uint8ClampedArray(width * height * 4);
  let zeroFloat = 0, zeroOut = 0, low = 0, darkest = 255, max = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const src = ((flipped ? height - 1 - y : y) * width + x) * 4, dst = (y * width + x) * 4;
    const r = pixels[src], g = pixels[src + 1], b = pixels[src + 2];
    if (r === 0 && g === 0 && b === 0) zeroFloat++;
    max = Math.max(max, r, g, b);
    for (let c = 0; c < 3; c++) out[dst + c] = Math.round(255 * srgb(Math.min(1, Math.max(0, aces(pixels[src + c])))));
    out[dst + 3] = 255;
    const m = Math.max(out[dst], out[dst + 1], out[dst + 2]);
    if (m === 0) zeroOut++;
    else { darkest = Math.min(darkest, m); if (m <= 3) low++; }
  }
  const c2 = new OffscreenCanvas(width, height);
  c2.getContext('2d').putImageData(new ImageData(out, width, height), 0, 0);
  const blob = await c2.convertToBlob({ type: 'image/png' });
  const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
  const n = width * height;
  return { png: b64, stats: { zeroFloatPct: (100 * zeroFloat) / n, zeroOutPct: (100 * zeroOut) / n, lowPct: (100 * low) / n, darkest, maxLinear: max } };
}

function diff(a, b) {
  let maxAbs = 0, differing = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > 0) differing++; if (d > maxAbs) maxAbs = d; }
  return { identical: differing === 0, maxAbs, differingPct: (100 * differing) / a.length };
}

window.spike = async (opts) => {
  const { width, height, backend } = opts;
  const r = backend === 'webgl' ? await traceWebGL(opts) : await traceWebGPU(opts);
  if (r.first.pixels.length !== width * height * 4) throw new Error(`readback length ${r.first.pixels.length}, expected ${width * height * 4}`);
  const { png, stats } = await toPng(r.first.pixels, width, height, r.first.flipped);
  const strip = ({ pixels, ...rest }) => rest;
  return { backend: r.backend, adapter: r.adapter, first: strip(r.first), second: strip(r.second), repeat: diff(r.first.pixels, r.second.pixels), stats, png };
};
window.spikeReady = true;
