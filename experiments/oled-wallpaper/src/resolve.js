// Seed, preset, locks and overrides in; a full, validated parameter object out.
// Precedence: explicit override, then the preset value (or default) for anything locked, not
// rolled, or rendered without a seed, then the seeded draw.
import { BY_ID, SCHEMA, builtOptions, isBuilt } from './schema.js';
import { stream } from './rng.js';

export class ParamError extends Error {
  constructor(message) {
    super(message);
    this.code = 2;
  }
}

const describe = (e) =>
  e.type === 'enum' ? `one of ${builtOptions(e).join(', ')}` : e.type === 'bool' ? 'true or false' : `${e.type === 'int' ? 'an integer' : 'a number'} from ${e.min} to ${e.max}`;

// Checks one value against its entry, coercing CLI strings. Returns the clean value or throws.
export function validate(id, raw) {
  const e = BY_ID.get(id);
  if (!e) throw new ParamError(`unknown parameter ${id}. Run "schema" to list them.`);
  if (!isBuilt(e.stage)) throw new ParamError(`${id} is not built yet (stage ${e.stage})`);
  if (e.type === 'enum') {
    const opt = e.options.find((o) => o.value === raw);
    if (!opt) throw new ParamError(`${id}=${raw} is not valid. Expected ${describe(e)}.`);
    if (!isBuilt(opt.stage)) throw new ParamError(`${id}=${raw} is not built yet (stage ${opt.stage})`);
    return raw;
  }
  if (e.type === 'bool') {
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    throw new ParamError(`${id}=${raw} is not valid. Expected ${describe(e)}.`);
  }
  const v = typeof raw === 'number' ? raw : Number(raw);
  const ok = Number.isFinite(v) && v >= e.min && v <= e.max && (e.type !== 'int' || Number.isInteger(v));
  if (!ok) throw new ParamError(`${id}=${raw} is out of range. Expected ${describe(e)}.`);
  return v;
}

const round = (v) => Number(v.toPrecision(5));

export function draw(entry, rand) {
  const u0 = rand();
  const u = entry.dist === 'low' ? u0 * u0 : u0;
  if (entry.type === 'enum') {
    const options = builtOptions(entry);
    return options[Math.floor(u * options.length)];
  }
  if (entry.type === 'bool') return u < 0.5;
  const [lo, hi] = entry.random ?? [entry.min, entry.max];
  const clamp = (v) => Math.min(entry.max, Math.max(entry.min, v));
  if (entry.type === 'int') return clamp(Math.floor(lo + u * (hi - lo + 1)));
  return round(clamp(lo + u * (hi - lo)));
}

const lockRegex = (pattern) => new RegExp(`^${pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);

/**
 * @param {object} o
 * @param {number|null} o.seed       null renders the preset or defaults with nothing rolled
 * @param {{name: string, lock?: string[], values?: object}|null} o.preset
 * @param {string[]} o.locks         glob patterns such as 'material.*'
 * @param {object} o.overrides       id -> value, strings allowed
 */
export function resolve({ seed = null, preset = null, locks = [], overrides = {} } = {}) {
  const built = SCHEMA.filter((e) => isBuilt(e.stage));
  const presetValues = {};
  for (const [id, v] of Object.entries(preset?.values ?? {})) presetValues[id] = validate(id, v);
  const clean = {};
  for (const [id, v] of Object.entries(overrides)) clean[id] = validate(id, v);

  const patterns = [...(preset?.lock ?? []), ...locks];
  const regexes = patterns.map((p) => {
    const r = lockRegex(p);
    if (!built.some((e) => r.test(e.id))) throw new ParamError(`lock "${p}" matches no parameter`);
    return r;
  });
  const locked = (id) => regexes.some((r) => r.test(id));

  const params = {};
  for (const e of built) {
    if (e.id in clean) params[e.id] = clean[e.id];
    else if (seed === null || e.roll === false || locked(e.id)) params[e.id] = presetValues[e.id] ?? e.default;
    else params[e.id] = draw(e, stream(seed, e.id));
  }
  return { params, seed, preset: preset?.name ?? null, locks: patterns, overrides: clean };
}

// "form.width=0.4" -> ['form.width', '0.4']
export function parseSet(s) {
  const i = s.indexOf('=');
  if (i < 1) throw new ParamError(`--set expects id=value, got "${s}"`);
  return [s.slice(0, i), s.slice(i + 1)];
}
