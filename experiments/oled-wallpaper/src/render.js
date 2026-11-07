// Browser only. Path-traces resolved parameters with three-gpu-pathtracer's WebGPU tracer and returns
// 8-bit RGBA through the output pipeline. One renderer and tracer live for the page's lifetime.
import { FloatType, NoToneMapping, RenderTarget, WebGPURenderer } from 'three/webgpu';
import { WebGPUPathTracer } from 'three-gpu-pathtracer/webgpu';
import { buildScene } from './scene.js';
import { processOutput } from './output.js';

// Path steps per frame. The default of 250k leaves the GPU idle; above these it stops gaining.
const FRAME_BUDGET = { draft: 8_000_000, final: 16_000_000 };

let session = null;

async function getSession() {
  if (session) return session;
  if (!navigator.gpu) throw Object.assign(new Error('this browser has no WebGPU (navigator.gpu is missing)'), { code: 4 });
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw Object.assign(new Error('no WebGPU adapter: the GPU is unavailable to this browser'), { code: 4 });
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const renderer = new WebGPURenderer({ canvas, antialias: false });
  await renderer.init();
  if (!renderer.backend.isWebGPUBackend) throw Object.assign(new Error('three.js fell back to WebGL: no WebGPU device'), { code: 4 });
  renderer.toneMapping = NoToneMapping;
  const tracer = new WebGPUPathTracer(renderer);
  // clampIndirect 3 (default 10) removes most fireflies from light bounced between ribbon faces for
  // a small bias; the glossy filter is left at its default because raising it flattens the falloff.
  Object.assign(tracer, { dynamicLowRes: false, renderDelay: 0, fadeDuration: 0, minSamples: 1, synchronizeRenderSize: false, stableNoise: true, adaptiveFrameBudget: false, clampIndirect: 3 });
  const info = adapter.info ?? {};
  session = { renderer, tracer, target: null, previous: null, adapter: [info.vendor, info.architecture].filter(Boolean).join(' ') };
  return session;
}

const tick = () => new Promise((r) => requestAnimationFrame(r));

// WebGPU pads readback rows to 256 bytes; drop the padding when the width needs it.
function unpad(pixels, width, height) {
  if (pixels.length === width * height * 4) return pixels;
  const row = pixels.length / height;
  const out = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) out.set(pixels.subarray(y * row, y * row + width * 4), y * width * 4);
  return out;
}

function dispose(scene) {
  scene?.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
}

/**
 * @param {object} params resolved parameters
 * @param {{width: number, height: number, samples: number, tier: 'draft'|'final', seed?: number,
 *   onProgress?: (samples: number) => void, firstSampleTimeoutMs?: number, signal?: AbortSignal}} opts
 * @returns {Promise<{rgba: Uint8ClampedArray, width: number, height: number, stats: object}>}
 */
export async function render(params, { width, height, samples, tier = 'draft', seed = 0, onProgress, firstSampleTimeoutMs = 60_000, signal } = {}) {
  const s = await getSession();
  const { renderer, tracer } = s;
  const t0 = performance.now();
  const { scene, camera, framing, triangles } = buildScene(params, { width, height, tier });

  if (!s.target || s.target.width !== width || s.target.height !== height) {
    s.target?.dispose();
    s.target = new RenderTarget(width, height, { type: FloatType, depthBuffer: false });
  }
  tracer.frameBudget = FRAME_BUDGET[tier] ?? FRAME_BUDGET.draft;
  tracer.maxSamples = samples;
  tracer.setSize(width, height);
  tracer.setScene(scene, camera);
  dispose(s.previous);
  s.previous = scene;

  let done = false, last = 0, tFirst = null;
  const onComplete = () => { done = true; };
  const onProgressEvent = (e) => { if (e.samples) { last = e.samples.avg ?? e.samples; onProgress?.(last); } };
  tracer.addEventListener('complete', onComplete);
  tracer.addEventListener('progress', onProgressEvent);
  try {
    while (!done) {
      if (signal?.aborted) throw Object.assign(new Error('render cancelled'), { name: 'AbortError' });
      renderer.setRenderTarget(s.target);
      tracer.renderSample();
      renderer.setRenderTarget(null);
      await tick();
      if (tFirst === null && last > 0) tFirst = performance.now();
      if (tFirst === null && performance.now() - t0 > firstSampleTimeoutMs) {
        throw Object.assign(new Error(`no sample completed within ${firstSampleTimeoutMs / 1000} s: the GPU may be stalled or unavailable`), { code: 4 });
      }
    }
  } finally {
    tracer.removeEventListener('complete', onComplete);
    tracer.removeEventListener('progress', onProgressEvent);
  }
  const tTraced = performance.now();
  const counts = await tracer.getSampleCountsAsync();
  const linear = unpad(await renderer.readRenderTargetPixelsAsync(s.target, 0, 0, width, height), width, height);
  const { data, exposure } = processOutput(linear, width, height, params, { seed });
  const tEnd = performance.now();
  return {
    rgba: data, width, height,
    stats: {
      samples: counts.min, adapter: s.adapter, triangles, framing, exposure,
      traceMs: Math.round(tTraced - t0), totalMs: Math.round(tEnd - t0),
      firstSampleMs: Math.round((tFirst ?? tTraced) - t0),
    },
  };
}

export async function encodePng(rgba, width, height) {
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

export const versions = async () => ({ three: (await import('three/webgpu')).REVISION });
