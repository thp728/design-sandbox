import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ParamError, draw, parseSet, resolve } from '../src/resolve.js';
import { SCHEMA, isBuilt } from '../src/schema.js';
import { stream } from '../src/rng.js';

const built = SCHEMA.filter((e) => isBuilt(e.stage));

test('no seed gives the defaults', () => {
  const { params } = resolve();
  for (const e of built) assert.equal(params[e.id], e.default, e.id);
});

test('the same seed gives the same params', () => {
  assert.deepEqual(resolve({ seed: 42 }).params, resolve({ seed: 42 }).params);
  assert.notDeepEqual(resolve({ seed: 42 }).params, resolve({ seed: 43 }).params);
});

test('each value comes from its own stream, so other parameters cannot shift it', () => {
  const { params } = resolve({ seed: 7 });
  for (const e of built) if (e.roll !== false) assert.deepEqual(params[e.id], draw(e, stream(7, e.id)), e.id);
});

test('drawn values stay in range and enums only pick built options', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const { params } = resolve({ seed });
    for (const e of built) {
      const v = params[e.id];
      if (e.type === 'enum') assert.ok(e.options.some((o) => o.value === v && isBuilt(o.stage)), `${e.id}=${v}`);
      else if (e.type !== 'bool') assert.ok(v >= e.min && v <= e.max, `${e.id}=${v}`);
    }
  }
});

test('locks keep preset values while the seed rolls the rest', () => {
  const preset = { name: 'graphite', values: { 'material.kind': 'metal', 'material.saturation': 0.05 } };
  const a = resolve({ seed: 1, preset, locks: ['material.*'] }).params;
  const b = resolve({ seed: 2, preset, locks: ['material.*'] }).params;
  for (const e of built.filter((e) => e.group === 'material')) assert.equal(a[e.id], b[e.id], e.id);
  assert.equal(a['material.kind'], 'metal');
  assert.equal(a['material.hue'], 222, 'locked without a preset value falls back to the default');
  assert.notDeepEqual(
    built.filter((e) => e.group === 'form').map((e) => a[e.id]),
    built.filter((e) => e.group === 'form').map((e) => b[e.id]),
  );
});

test('a preset can carry its own locks', () => {
  const preset = { name: 'p', lock: ['material.kind'], values: { 'material.kind': 'satin' } };
  assert.equal(resolve({ seed: 5, preset }).params['material.kind'], 'satin');
});

test('overrides beat everything', () => {
  const preset = { name: 'p', lock: ['form.width'], values: { 'form.width': 0.2 } };
  assert.equal(resolve({ seed: 5, preset, overrides: { 'form.width': '0.5' } }).params['form.width'], 0.5);
});

test('roll: false parameters ignore the seed', () => {
  assert.equal(resolve({ seed: 99 }).params['output.blackPoint'], 3.5);
  assert.equal(resolve({ seed: 99 }).params['frame.safe.top'], 0.06);
});

test('bad input names the parameter and its range', () => {
  assert.throws(() => resolve({ overrides: { 'form.length': 2 } }), (e) => e instanceof ParamError && /form.length=2 is out of range. Expected a number from 0.2 to 1/.test(e.message));
  assert.throws(() => resolve({ overrides: { 'form.path': 'attractor' } }), /not built yet \(stage later\)/);
  assert.throws(() => resolve({ overrides: { 'form.section': 'pleated' } }), /not built yet \(stage B\)/);
  assert.throws(() => resolve({ overrides: { 'form.strands.count': 3 } }), /form.strands.count is not built yet \(stage B\)/);
  assert.throws(() => resolve({ overrides: { 'form.knot.p': 1.5 } }), /Expected an integer/);
  assert.throws(() => resolve({ overrides: { nope: 1 } }), /unknown parameter nope/);
  assert.throws(() => resolve({ locks: ['materail.*'] }), /lock "materail.\*" matches no parameter/);
});

test('parseSet splits on the first equals sign', () => {
  assert.deepEqual(parseSet('form.path=knot'), ['form.path', 'knot']);
  assert.throws(() => parseSet('form.path'), ParamError);
});
