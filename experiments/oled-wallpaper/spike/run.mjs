// Runs the spike in headless Chrome and writes PNGs plus a report to out/spike/.
// Usage: node spike/run.mjs [--backend webgpu|webgl|both] [--samples 64] [--sizes draft,final] [--headed]
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { ROOT, startServer } from '../cli/server.mjs';

const { values: args } = parseArgs({
  options: {
    backend: { type: 'string', default: 'both' },
    samples: { type: 'string', default: '64' },
    sizes: { type: 'string', default: 'draft,final' },
    headed: { type: 'boolean', default: false },
    budget: { type: 'string', default: '250000' },
    chrome: { type: 'string', default: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
  },
});

const SIZES = { draft: [864, 559], final: [3456, 2234] };
const outDir = join(ROOT, 'out', 'spike');
await mkdir(outDir, { recursive: true });

const { server, url } = await startServer();
const browser = await chromium.launch({
  executablePath: args.chrome,
  headless: !args.headed,
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--use-angle=metal'],
});
const report = [];
try {
  const backends = args.backend === 'both' ? ['webgpu', 'webgl'] : [args.backend];
  for (const backend of backends) {
    for (const size of args.sizes.split(',')) {
      const [width, height] = SIZES[size];
      const page = await browser.newPage();
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      await page.goto(`${url}/spike/index.html?budget=${args.budget}`);
      await page.waitForFunction(() => window.spikeReady === true, null, { timeout: 30_000 });
      const name = `${backend}-${size}-${args.samples}spp-b${args.budget}`;
      try {
        const r = await page.evaluate((o) => window.spike(o), { backend, width, height, samples: Number(args.samples), firstSampleTimeoutMs: 60_000 });
        await writeFile(join(outDir, `${name}.png`), Buffer.from(r.png, 'base64'));
        delete r.png;
        report.push({ name, ...r, warnings: errors });
        const f = r.first;
        console.log(`ok ${name} ${width}x${height} adapter="${r.adapter}" build ${f.buildMs.toFixed(0)}ms first ${f.firstSampleMs.toFixed(0)}ms total ${(f.totalMs / 1000).toFixed(1)}s ${f.samplesPerSec.toFixed(2)}spp/s samples min ${f.counts.min} avg ${f.counts.avg} repeat ${r.repeat.identical ? 'identical' : `maxAbs ${r.repeat.maxAbs.toExponential(2)} ${r.repeat.differingPct.toFixed(2)}%`} black ${r.stats.zeroOutPct.toFixed(1)}% low1-3 ${r.stats.lowPct.toFixed(3)}%`);
      } catch (e) {
        report.push({ name, error: e.message, warnings: errors });
        console.log(`!! ${name} ${e.message}`);
        for (const w of errors.slice(0, 5)) console.log(`   ${w}`);
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
  await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`report ${join(outDir, 'report.json')}`);
}
