#!/usr/bin/env node
// Seeded OLED wallpaper generator. Run with no arguments for help.
// Exit codes: 0 ok, 1 unexpected error, 2 bad input, 3 a check failed, 4 browser or GPU missing.
import { randomInt } from 'node:crypto';
import { access, appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve as resolvePath } from 'node:path';
import { parseArgs } from 'node:util';
import { analyze } from '../src/analyze.js';
import { decodePng } from '../src/png.js';
import { ParamError, parseSet, resolve, validate } from '../src/resolve.js';
import { BY_ID, GROUPS, SCHEMA, builtOptions, isBuilt } from '../src/schema.js';
import { ROOT, startServer } from './server.mjs';

const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TIERS = {
  draft: { width: 864, height: 559, samples: 64 },
  final: { width: 3456, height: 2234, samples: 1024 },
};
const OUT = join(ROOT, 'out');
const LOG = join(OUT, 'wallpaper.log');

const HELP = `node cli/wallpaper.mjs <command> [options]

  schema [--group form|material|light|camera|output] [--json]
  random [--seed N] [--count N] [--preset NAME] [--lock 'material.*']... [--set id=value]...
  render --params SIDECAR.json
  final SIDECAR.json                  same as render --tier final
  check FILE.png [--params SIDECAR.json]
  serve [--port N]                    studio page with sliders

Render options: --tier draft|final  --samples N  --size WxH  --out DIR  --chrome PATH  --headed
Presets: ${'presets/*.json'}. Renders go to out/, one PNG and one sidecar JSON each.
Exit codes: 0 ok, 2 bad input, 3 a check failed, 4 browser or GPU missing.`;

class CliError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

const log = (line) => appendFile(LOG, `${new Date().toISOString()} ${line}\n`).catch(() => {});

async function loadPreset(name) {
  if (!name) return null;
  const file = join(ROOT, 'presets', `${name}.json`);
  try {
    return { name, ...JSON.parse(await readFile(file, 'utf8')) };
  } catch {
    const names = (await readdir(join(ROOT, 'presets'))).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => f.slice(0, -5));
    throw new CliError(`no preset "${name}". Presets: ${names.join(', ')}`, 2);
  }
}

function renderSettings(opts, tierName) {
  const tier = TIERS[tierName];
  if (!tier) throw new CliError(`--tier must be draft or final, got "${tierName}"`, 2);
  let { width, height, samples } = tier;
  if (opts.size) {
    const m = /^(\d+)x(\d+)$/.exec(opts.size);
    if (!m) throw new CliError(`--size expects WxH such as 3024x1986, got "${opts.size}"`, 2);
    [width, height] = [Number(m[1]), Number(m[2])];
  }
  if (opts.samples) {
    samples = Number(opts.samples);
    if (!Number.isInteger(samples) || samples < 1) throw new CliError(`--samples expects a positive integer, got "${opts.samples}"`, 2);
  }
  return { tier: tierName, width, height, samples };
}

// One Chrome page for the whole command, reused across renders.
async function openSession(opts) {
  const chrome = opts.chrome ?? DEFAULT_CHROME;
  try {
    await access(chrome);
  } catch {
    throw new CliError(`Chrome not found at ${chrome}. Install Google Chrome or pass --chrome PATH (default ${DEFAULT_CHROME}).`, 4);
  }
  const { chromium } = await import('playwright-core');
  const { server, url } = await startServer();
  const browser = await chromium.launch({ executablePath: chrome, headless: !opts.headed, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  page.on('console', (m) => log(`console.${m.type()} ${m.text()}`));
  page.on('pageerror', (e) => log(`pageerror ${e.message}`));
  await page.goto(`${url}/render.html`);
  await page.waitForFunction(() => window.wallpaperReady === true, null, { timeout: 30_000 });
  const versions = await page.evaluate(() => window.wallpaper.versions());
  const pkg = JSON.parse(await readFile(join(ROOT, 'node_modules/three-gpu-pathtracer/package.json'), 'utf8'));
  return {
    versions: { three: versions.three, pathtracer: pkg.version },
    async render(params, settings, seed) {
      const r = await page.evaluate(([p, o]) => window.wallpaper.render(p, o), [params, { ...settings, seed: seed ?? 0 }]);
      if (!r.ok) throw new CliError(r.error, r.code === 4 ? 4 : 1);
      return { png: Buffer.from(r.png, 'base64'), stats: r.stats };
    },
    async close() { await browser.close(); server.close(); },
  };
}

const fmt = (r) => `black ${r.blackPct.toFixed(1)}% darkest ${r.darkest ?? '-'} haze ${r.hazePct.toFixed(2)}% safe ${r.safeTopLit + r.notchLit === 0 ? 'ok' : 'FAIL'} specks ${r.specks}`;

const checkOptions = (params) => ({ safeTop: params['frame.safe.top'], notch: params['frame.safe.notch'] });

// Renders one resolved job, writes the PNG and sidecar, checks the file, prints the summary line.
async function runJob(session, job, settings, outDir) {
  const name = `${job.preset ?? 'default'}-${job.seed ?? 'fixed'}-${settings.tier}`;
  const { png, stats } = await session.render(job.params, settings, job.seed);
  const pngPath = join(outDir, `${name}.png`);
  await writeFile(pngPath, png);
  const report = analyze(decodePng(png), checkOptions(job.params));
  const sidecar = {
    name, version: 1, seed: job.seed, preset: job.preset, locks: job.locks, overrides: job.overrides,
    params: job.params,
    render: { ...settings, ...session.versions, backend: 'webgpu', adapter: stats.adapter, samplesCompleted: stats.samples, stableNoise: true, clampIndirect: 3, appliedExposure: stats.exposure },
    framing: stats.framing,
    timings: { firstSampleMs: stats.firstSampleMs, traceMs: stats.traceMs, totalMs: stats.totalMs },
    report,
  };
  await writeFile(join(outDir, `${name}.json`), JSON.stringify(sidecar, null, 2));
  const ok = report.failures.length === 0;
  console.log(`${ok ? 'ok' : '!!'} ${name}.png ${settings.width}x${settings.height} ${stats.samples}spp ${(stats.totalMs / 1000).toFixed(1)}s ${fmt(report)}`);
  for (const f of report.failures) console.log(`!! ${name}: ${f}`);
  await log(`render ${JSON.stringify({ name, settings, stats, report })}`);
  return ok;
}

async function renderJobs(jobs, opts, tierName) {
  const settings = renderSettings(opts, tierName);
  const outDir = resolvePath(opts.out ?? OUT);
  await mkdir(outDir, { recursive: true });
  const session = await openSession(opts);
  let failed = 0;
  try {
    for (const job of jobs) if (!(await runJob(session, job, settings, outDir))) failed++;
  } finally {
    await session.close();
  }
  console.log(`${failed === 0 ? 'ok' : '!!'} ${jobs.length - failed} of ${jobs.length} passed the checks. Output in ${outDir}, log in ${LOG}`);
  if (failed) throw new CliError(`${failed} render(s) failed the checks`, 3);
}

async function readSidecar(path) {
  if (!path) throw new CliError('expected a sidecar JSON path', 2);
  let side;
  try {
    side = JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    throw new CliError(`cannot read sidecar ${path}: ${e.message}`, 2);
  }
  // Fill parameters added since the sidecar was written with their defaults, then validate all.
  const params = { ...resolve().params };
  for (const [id, v] of Object.entries(side.params ?? {})) if (BY_ID.has(id) && isBuilt(BY_ID.get(id).stage)) params[id] = validate(id, v);
  return { side, job: { seed: side.seed ?? null, preset: side.preset ?? null, locks: side.locks ?? [], overrides: side.overrides ?? {}, params } };
}

function printSchema(opts) {
  const rows = SCHEMA.filter((e) => !opts.group || e.group === opts.group);
  if (opts.group && !GROUPS.includes(opts.group)) throw new CliError(`--group must be one of ${GROUPS.join(', ')}`, 2);
  if (opts.json) return console.log(JSON.stringify(rows, null, 2));
  for (const e of rows) {
    const range = e.type === 'enum' ? `${builtOptions(e).join('|') || '-'}${e.options.some((o) => !isBuilt(o.stage)) ? ` (later: ${e.options.filter((o) => !isBuilt(o.stage)).map((o) => o.value).join('|')})` : ''}` : e.type === 'bool' ? 'true|false' : `${e.min}..${e.max}`;
    const flags = [!isBuilt(e.stage) && `stage ${e.stage}, not built`, e.roll === false && 'not rolled', e.when && `when ${Object.entries(e.when).map(([k, v]) => `${k}=${[].concat(v).join('|')}`).join(' ')}`].filter(Boolean).join('; ');
    console.log(`${e.id.padEnd(26)} ${e.type.padEnd(6)} ${range.padEnd(34)} default ${String(e.default).padEnd(9)} ${flags}${e.note ? ` - ${e.note}` : ''}`);
  }
  console.log(`${rows.length} parameters, ${rows.filter((e) => isBuilt(e.stage)).length} built`);
}

async function main(argv) {
  const { values: opts, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      seed: { type: 'string' }, count: { type: 'string' }, preset: { type: 'string' },
      lock: { type: 'string', multiple: true }, set: { type: 'string', multiple: true },
      params: { type: 'string' }, tier: { type: 'string' }, samples: { type: 'string' }, size: { type: 'string' },
      out: { type: 'string' }, chrome: { type: 'string' }, headed: { type: 'boolean' },
      group: { type: 'string' }, json: { type: 'boolean' }, port: { type: 'string' }, help: { type: 'boolean' },
    },
  });
  const [command, arg] = positionals;
  await mkdir(OUT, { recursive: true });
  await log(`$ wallpaper ${argv.join(' ')}`);

  switch (command) {
    case 'schema':
      return printSchema(opts);
    case 'random': {
      const preset = await loadPreset(opts.preset);
      const overrides = Object.fromEntries((opts.set ?? []).map(parseSet));
      const first = opts.seed === undefined ? randomInt(1, 1_000_000) : Number(opts.seed);
      const count = opts.count === undefined ? 1 : Number(opts.count);
      if (!Number.isInteger(first) || first < 0) throw new CliError(`--seed expects a non-negative integer, got "${opts.seed}"`, 2);
      if (!Number.isInteger(count) || count < 1 || count > 200) throw new CliError(`--count expects 1 to 200, got "${opts.count}"`, 2);
      const jobs = Array.from({ length: count }, (_, i) => resolve({ seed: first + i, preset, locks: opts.lock ?? [], overrides }));
      return renderJobs(jobs, opts, opts.tier ?? 'draft');
    }
    case 'render': {
      const { job } = await readSidecar(opts.params ?? arg);
      return renderJobs([job], opts, opts.tier ?? 'draft');
    }
    case 'final': {
      const { job } = await readSidecar(arg ?? opts.params);
      return renderJobs([job], opts, 'final');
    }
    case 'check': {
      if (!arg) throw new CliError('check expects a PNG path', 2);
      let img;
      try {
        img = decodePng(await readFile(arg));
      } catch (e) {
        throw new CliError(`cannot read ${arg}: ${e.message}`, 2);
      }
      const sidecarPath = opts.params ?? join(dirname(arg), `${basename(arg, '.png')}.json`);
      const params = await readSidecar(sidecarPath).then((s) => s.job.params, () => resolve().params);
      const report = analyze(img, checkOptions(params));
      const ok = report.failures.length === 0;
      console.log(`${ok ? 'ok' : '!!'} ${basename(arg)} ${img.width}x${img.height} ${fmt(report)}`);
      for (const f of report.failures) console.log(`!! ${f}`);
      if (!ok) throw new CliError(`${report.failures.length} check(s) failed`, 3);
      return;
    }
    case 'serve': {
      const { url } = await startServer({ port: Number(opts.port ?? 5180) });
      console.log(`ok studio at ${url}/  (Ctrl-C to stop)`);
      return new Promise(() => {});
    }
    default:
      console.log(HELP);
      if (command && command !== 'help') throw new CliError(`unknown command "${command}"`, 2);
  }
}

main(process.argv.slice(2)).catch((e) => {
  const code = e instanceof ParamError || e instanceof CliError ? e.code : e.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION' ? 2 : 1;
  console.log(`!! ${e.message}`);
  log(`error ${code} ${e.stack ?? e.message}`).finally(() => process.exit(code));
});
