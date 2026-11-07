// The studio page: sliders built from the schema, lock toggles, a draft preview that re-renders on
// every change, and a full-size export. Locks work as overrides, the same as the CLI's sidecars.
import { analyze } from './analyze.js';
import { encodePng, render } from './render.js';
import { resolve, validate } from './resolve.js';
import { GROUPS, SCHEMA, applies, builtOptions, isBuilt } from './schema.js';

const TIERS = {
  draft: { width: 864, height: 559, samples: 64, tier: 'draft' },
  final: { width: 3456, height: 2234, samples: 1024, tier: 'final' },
};
const built = SCHEMA.filter((e) => isBuilt(e.stage));
const $ = (id) => document.getElementById(id);
const state = { seed: 1, preset: null, locks: new Set(), params: resolve().params, last: null };
const controls = new Map();

const lockedValues = () => Object.fromEntries([...state.locks].map((id) => [id, state.params[id]]));
const lockRegex = (p) => new RegExp(`^${p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);

function recompute() {
  const preset = state.preset && { ...state.preset, lock: [] };
  state.params = resolve({ seed: state.seed, preset, overrides: lockedValues() }).params;
}

// ---------- controls ----------

const LOCK_ICON = '<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 7V5a4 4 0 1 1 8 0v2h1v8H3V7h1zm2 0h4V5a2 2 0 1 0-4 0v2z"/></svg>';
const show = (e, v) => (e.type === 'number' ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(e.step < 0.01 ? 3 : 2)) : String(v));

function buildControls() {
  const host = $('groups');
  for (const group of GROUPS) {
    const details = document.createElement('details');
    details.open = group === 'form';
    details.innerHTML = `<summary>${group === 'camera' ? 'camera and framing' : group}</summary><div class="params"></div>`;
    const list = details.querySelector('.params');
    for (const e of built.filter((x) => x.group === group)) {
      const row = document.createElement('div');
      row.className = 'param';
      row.title = e.note ?? '';
      let input;
      if (e.type === 'enum') {
        input = document.createElement('select');
        for (const v of builtOptions(e)) input.add(new Option(v, v));
      } else if (e.type === 'bool') {
        input = document.createElement('input');
        input.type = 'checkbox';
      } else {
        input = Object.assign(document.createElement('input'), { type: 'range', min: e.min, max: e.max, step: e.step });
      }
      const name = Object.assign(document.createElement('span'), { className: 'name', textContent: e.label });
      const value = Object.assign(document.createElement('span'), { className: 'value' });
      const lock = Object.assign(document.createElement('button'), { className: 'lock', innerHTML: LOCK_ICON, title: 'Lock: rerolls keep this value' });
      if (e.type === 'bool') input.classList.add('check');
      row.append(name, input, ...(e.type === 'number' || e.type === 'int' ? [value] : []), lock);
      input.addEventListener('input', () => {
        const raw = e.type === 'bool' ? input.checked : e.type === 'enum' ? input.value : Number(input.value);
        state.params[e.id] = validate(e.id, raw);
        state.locks.add(e.id);
        sync();
        requestRender('draft');
      });
      lock.addEventListener('click', () => {
        if (state.locks.has(e.id)) state.locks.delete(e.id);
        else state.locks.add(e.id);
        sync();
      });
      controls.set(e.id, { e, row, input, value, lock });
      list.append(row);
    }
    host.append(details);
  }
}

function sync() {
  for (const { e, row, input, value, lock } of controls.values()) {
    const v = state.params[e.id];
    if (e.type === 'bool') input.checked = v;
    else input.value = v;
    if (value) value.textContent = show(e, v);
    lock.classList.toggle('on', state.locks.has(e.id));
    row.classList.toggle('hidden', !applies(e, state.params));
  }
  $('seed').value = state.seed;
  const top = state.params['frame.safe.top'], notch = state.params['frame.safe.notch'];
  Object.assign($('band').style, { left: '0', right: '0', top: '0', height: `${top * 100}%` });
  Object.assign($('notch').style, { left: `${(0.5 - notch / 2) * 100}%`, width: `${notch * 100}%`, top: '0', height: `${2 * top * 100}%` });
}

// ---------- rendering: one job at a time, newest wins ----------

// A draft request replaces any waiting job and cancels a running draft. A final is never cancelled:
// drafts asked for meanwhile wait and run after it.
let pending = null, busy = false, controller = null, current = null;

function requestRender(kind) {
  if (pending?.kind === 'final' && kind === 'draft') return;
  pending = { kind };
  if (current === 'draft') controller?.abort();
  pump();
}

async function pump() {
  if (busy) return;
  busy = true;
  while (pending) {
    const job = pending;
    pending = null;
    current = job.kind;
    controller = new AbortController();
    try {
      await runJob(job.kind, controller.signal);
    } catch (err) {
      if (err.name !== 'AbortError') setStatus([`!! ${err.message}`], true);
    }
  }
  current = null;
  busy = false;
  setBusy(false);
}

async function runJob(kind, signal) {
  const settings = TIERS[kind];
  const params = { ...state.params };
  setBusy(kind === 'final');
  setStatus([`rendering ${kind} ${settings.width}×${settings.height}…`]);
  const r = await render(params, {
    ...settings, seed: state.seed, signal,
    onProgress: (n) => setStatus([`rendering ${kind} ${settings.width}×${settings.height}`, `${Math.min(n, settings.samples).toFixed(0)} of ${settings.samples} spp`]),
  });
  const view = $('view');
  view.width = r.width;
  view.height = r.height;
  view.getContext('2d').putImageData(new ImageData(r.rgba, r.width, r.height), 0, 0);
  const report = analyze({ width: r.width, height: r.height, data: r.rgba }, { safeTop: params['frame.safe.top'], notch: params['frame.safe.notch'] });
  state.last = { params, settings, stats: r.stats, report };
  showReport(kind, settings, r.stats, report);
  if (kind === 'final') {
    const name = fileName('final');
    download(await encodePng(r.rgba, r.width, r.height), `${name}.png`);
    download(new Blob([JSON.stringify(sidecar(name), null, 2)], { type: 'application/json' }), `${name}.json`);
  }
}

// ---------- status, files ----------

function setStatus(parts, bad = false) {
  $('status').innerHTML = parts.map((p) => `<span class="${bad ? 'bad' : ''}">${p}</span>`).join('');
}

function showReport(kind, settings, stats, report) {
  const safeOk = report.safeTopLit + report.notchLit === 0;
  setStatus([
    `seed ${state.seed}`,
    `${kind} ${settings.width}×${settings.height}`,
    `${stats.samples} spp`,
    `${(stats.totalMs / 1000).toFixed(1)} s`,
    `black ${report.blackPct.toFixed(1)}%`,
    `darkest ${report.darkest ?? '-'}`,
    `<span class="${report.hazePct > 0.5 ? 'bad' : ''}">haze ${report.hazePct.toFixed(2)}%</span>`,
    `<span class="${safeOk ? 'good' : 'bad'}">safe ${safeOk ? 'ok' : 'fail'}</span>`,
    `<span class="${report.specks ? 'bad' : ''}">specks ${report.specks}</span>`,
  ]);
}

function setBusy(on) {
  for (const id of ['final', 'reroll', 'load', 'preset', 'seed']) $(id).disabled = on;
  $('final').textContent = on ? 'Rendering final…' : 'Render final';
}

const fileName = (tier) => `${state.preset?.name ?? 'default'}-${state.seed}-${tier}`;

function sidecar(name) {
  const l = state.last;
  return {
    name, version: 1, seed: state.seed, preset: state.preset?.name ?? null,
    locks: [], overrides: lockedValues(), params: l?.params ?? state.params,
    render: l ? { ...l.settings, backend: 'webgpu', adapter: l.stats.adapter, samplesCompleted: l.stats.samples, stableNoise: true, clampIndirect: 3, appliedExposure: l.stats.exposure } : null,
    framing: l?.stats.framing ?? null,
    report: l?.report ?? null,
    source: 'studio',
  };
}

function download(blob, name) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

async function loadPreset(name) {
  if (!name) return null;
  return { name, ...(await (await fetch(`./presets/${name}.json`)).json()) };
}

// ---------- wiring ----------

async function init() {
  buildControls();
  for (const name of await (await fetch('./presets/index.json')).json()) $('preset').add(new Option(name, name));

  $('seed').addEventListener('change', () => {
    const v = Number($('seed').value);
    if (!Number.isInteger(v) || v < 0) return sync();
    state.seed = v;
    recompute();
    sync();
    requestRender('draft');
  });
  $('reroll').addEventListener('click', () => {
    state.seed = Math.floor(Math.random() * 1_000_000);
    recompute();
    sync();
    requestRender('draft');
  });
  $('preset').addEventListener('change', async () => {
    state.preset = await loadPreset($('preset').value);
    const patterns = (state.preset?.lock ?? []).map(lockRegex);
    state.locks = new Set(built.filter((e) => patterns.some((r) => r.test(e.id))).map((e) => e.id));
    state.params = resolve({ seed: state.seed, preset: state.preset }).params;
    sync();
    requestRender('draft');
  });
  $('final').addEventListener('click', () => requestRender('final'));
  $('save').addEventListener('click', () => {
    const name = fileName('draft');
    download(new Blob([JSON.stringify(sidecar(name), null, 2)], { type: 'application/json' }), `${name}.json`);
  });
  $('load').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', async () => {
    const file = $('file').files[0];
    if (!file) return;
    try {
      const side = JSON.parse(await file.text());
      const params = { ...resolve().params };
      for (const e of built) if (side.params?.[e.id] !== undefined) params[e.id] = validate(e.id, side.params[e.id]);
      state.seed = side.seed ?? 0;
      state.preset = await loadPreset(side.preset);
      $('preset').value = side.preset ?? '';
      const patterns = (side.locks ?? []).map(lockRegex);
      state.locks = new Set([...Object.keys(side.overrides ?? {}), ...built.filter((e) => patterns.some((r) => r.test(e.id))).map((e) => e.id)]);
      state.params = params;
      sync();
      requestRender('draft');
    } catch (err) {
      setStatus([`!! cannot load ${file.name}: ${err.message}`], true);
    }
    $('file').value = '';
  });
  $('showSafe').addEventListener('change', () => $('safe').classList.toggle('on', $('showSafe').checked));

  const fromHash = Number(new URLSearchParams(location.hash.slice(1)).get('seed'));
  state.seed = Number.isInteger(fromHash) && fromHash > 0 ? fromHash : 1;
  recompute();
  sync();
  requestRender('draft');
}

init().catch((err) => setStatus([`!! ${err.message}`], true));

// For checks from the outside, such as comparing the studio's export with the CLI's.
window.studio = { state, render: (kind) => requestRender(kind), idle: () => !busy && !pending };
