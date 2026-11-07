// The parameter schema: the one source for the studio's sliders, the CLI's `schema` command and the
// resolver's validation. Lengths are in units of the form's radius, which paths normalise to 1.
//
// Entry fields:
//   id, group, label, type ('number' | 'int' | 'enum' | 'bool')
//   min, max, step         numbers and ints
//   options                enums: [{ value, stage }]
//   default
//   stage                  'A' and 'B' are the first build's two stages, 'later' is planned only
//   random                 [lo, hi] range the seed draws from, clamped to [min, max]. Defaults to [min, max].
//   dist                   'uniform' (default) or 'low', which biases draws towards lo
//   roll                   false keeps the seed from drawing it: the value comes from the preset or default
//   when                   { id: value | [values] }: the entry only applies when these hold
//   note

export const BUILT_STAGES = ['A'];

const num = (id, label, min, max, def, extra = {}) => ({ id, label, type: 'number', min, max, step: extra.step ?? (max - min) / 200, default: def, stage: 'A', ...extra });
const int = (id, label, min, max, def, extra = {}) => ({ id, label, type: 'int', min, max, step: 1, default: def, stage: 'A', ...extra });
const opts = (spec) => Object.entries(spec).flatMap(([stage, values]) => values.map((value) => ({ value, stage })));
const enm = (id, label, options, def, extra = {}) => ({ id, label, type: 'enum', options, default: def, stage: 'A', ...extra });

const form = [
  enm('form.path', 'Path', opts({ A: ['knot', 'lissajous', 'spiral'], later: ['noiseWalk', 'attractor'] }), 'knot', { note: 'Curve family the ribbon follows' }),
  int('form.knot.p', 'Knot p', 1, 6, 2, { when: { 'form.path': 'knot' }, note: 'Winds round the axis p times. p and q are reduced by their common factor.' }),
  int('form.knot.q', 'Knot q', 1, 9, 3, { when: { 'form.path': 'knot' }, note: 'Winds through the hole q times' }),
  num('form.knot.depth', 'Knot depth', 0.1, 0.9, 0.5, { when: { 'form.path': 'knot' }, note: 'Minor radius as a share of the major radius' }),
  int('form.lissajous.a', 'Lissajous x', 1, 6, 3, { when: { 'form.path': 'lissajous' } }),
  int('form.lissajous.b', 'Lissajous y', 1, 6, 2, { when: { 'form.path': 'lissajous' } }),
  int('form.lissajous.c', 'Lissajous z', 1, 6, 5, { when: { 'form.path': 'lissajous' } }),
  num('form.lissajous.phaseA', 'Phase x', 0, 1, 0.25, { when: { 'form.path': 'lissajous' } }),
  num('form.lissajous.phaseB', 'Phase z', 0, 1, 0.1, { when: { 'form.path': 'lissajous' } }),
  num('form.spiral.turns', 'Spiral turns', 0.5, 5, 2.2, { when: { 'form.path': 'spiral' } }),
  num('form.spiral.pitch', 'Spiral pitch', 0, 1, 0.35, { when: { 'form.path': 'spiral' }, note: 'Rise per turn' }),
  num('form.spiral.flare', 'Spiral flare', 0, 0.95, 0.5, { when: { 'form.path': 'spiral' }, note: 'How much the radius grows from start to end' }),
  num('form.length', 'Length', 0.2, 1, 1, { random: [0.3, 1.3], note: 'Share of the path swept. Below 1, a closed path becomes an open ribbon with free ends.' }),
  num('form.start', 'Start', 0, 1, 0, { note: 'Where along the path the sweep begins' }),
  int('form.strands.count', 'Strands', 1, 5, 1, { stage: 'B', random: [1, 3] }),
  enm('form.strands.layout', 'Strand layout', opts({ B: ['parallel', 'braided'], later: ['fanned', 'offset'] }), 'parallel', { stage: 'B' }),
  num('form.strands.spacing', 'Strand spacing', 0, 1, 0.3, { stage: 'B' }),
  enm('form.section', 'Section', opts({ A: ['flat', 'tube'], B: ['pleated', 'grooved'], later: ['slatted', 'hollow'] }), 'flat'),
  num('form.section.squareness', 'Squareness', 0, 1, 0.3, { when: { 'form.section': 'tube' }, note: '0 is an ellipse, 1 a rounded box' }),
  int('form.section.pleats', 'Pleats', 2, 12, 5, { stage: 'B', when: { 'form.section': 'pleated' } }),
  num('form.section.pleatDepth', 'Pleat depth', 0, 1, 0.4, { stage: 'B', when: { 'form.section': 'pleated' } }),
  int('form.section.grooves', 'Grooves', 1, 16, 6, { stage: 'B', when: { 'form.section': 'grooved' } }),
  num('form.section.grooveDepth', 'Groove depth', 0, 1, 0.3, { stage: 'B', when: { 'form.section': 'grooved' } }),
  num('form.width', 'Width', 0.04, 0.8, 0.3, { random: [0.1, 0.6] }),
  enm('form.width.profile', 'Width profile', opts({ A: ['constant', 'taper', 'swell'], B: ['curve'] }), 'constant'),
  num('form.width.amount', 'Profile amount', 0, 1, 0.6, { when: { 'form.width.profile': ['taper', 'swell'] } }),
  num('form.width.curveA', 'Curve point 1', 0, 1, 0.3, { stage: 'B', when: { 'form.width.profile': 'curve' } }),
  num('form.width.curveB', 'Curve point 2', 0, 1, 0.8, { stage: 'B', when: { 'form.width.profile': 'curve' } }),
  num('form.thickness', 'Thickness', 0.005, 0.25, 0.03, { random: [0.01, 0.15], dist: 'low' }),
  num('form.twist.turns', 'Twist turns', -4, 4, 1, { random: [-2.5, 2.5], note: 'Closed loops round to half turns so the seam meets' }),
  enm('form.twist.profile', 'Twist profile', opts({ A: ['even', 'middle', 'ends'] }), 'even', { note: 'Where along the length the twist gathers' }),
  num('form.bevel', 'Edge bevel', 0, 1, 0, { stage: 'later' }),
  enm('form.ends', 'Ends', opts({ later: ['square', 'round', 'tapered'] }), 'square', { stage: 'later' }),
].map((e) => ({ group: 'form', ...e }));

const material = [
  enm('material.kind', 'Material', opts({ A: ['gloss', 'metal', 'satin'], later: ['brushedMetal', 'clearcoat', 'glass', 'thinFilm'] }), 'gloss', { note: 'Sets metalness, clearcoat and sheen' }),
  num('material.hue', 'Hue', 0, 360, 222, { step: 1 }),
  num('material.saturation', 'Saturation', 0, 1, 0.9, { random: [0.5, 1] }),
  num('material.value', 'Value', 0, 1, 0.8, { random: [0.45, 0.95] }),
  num('material.roughness', 'Roughness', 0, 1, 0.18, { random: [0.04, 0.55], dist: 'low' }),
  enm('material.inner', 'Inner face', opts({ later: ['same', 'contrast', 'dark'] }), 'same', { stage: 'later' }),
  num('material.edgeGlow', 'Edge glow', 0, 1, 0, { stage: 'later' }),
].map((e) => ({ group: 'material', ...e }));

const ROLE_DEFAULTS = [
  { role: 'key', azimuth: -35, elevation: 45, distance: 3.5, size: 5, aspect: 0.35, intensity: 40, kelvin: 6000 },
  { role: 'rim', azimuth: 25, elevation: -10, distance: 3, size: 4.5, aspect: 0.08, intensity: 80, kelvin: 7500 },
  { role: 'key', azimuth: 60, elevation: 20, distance: 4, size: 3, aspect: 0.5, intensity: 30, kelvin: 5000 },
  { role: 'rim', azimuth: -40, elevation: 30, distance: 3, size: 3, aspect: 0.1, intensity: 60, kelvin: 8000 },
];

const light = [
  int('light.count', 'Lights', 1, 2, 2, { random: [1, 2], note: 'Up to 4 later' }),
  ...ROLE_DEFAULTS.flatMap((d, i) => {
    const stage = i < 2 ? 'A' : 'later';
    const when = i === 1 ? { 'light.count': [2] } : undefined;
    const p = `light.${i}`;
    return [
      enm(`${p}.role`, `Light ${i + 1} role`, opts({ A: ['key', 'rim'], later: ['kicker'] }), d.role, { stage, when, note: 'Key sits on the camera side, rim behind the form' }),
      num(`${p}.azimuth`, `Light ${i + 1} azimuth`, -90, 90, d.azimuth, { stage, when, step: 1, random: [-75, 75], note: 'Degrees round the form, relative to the role side' }),
      num(`${p}.elevation`, `Light ${i + 1} elevation`, -60, 90, d.elevation, { stage, when, step: 1, random: [-25, 70] }),
      num(`${p}.distance`, `Light ${i + 1} distance`, 1.5, 10, d.distance, { stage, when, random: [2.5, 5] }),
      num(`${p}.size`, `Light ${i + 1} size`, 0.2, 16, d.size, { stage, when, random: [1.5, 8] }),
      num(`${p}.aspect`, `Light ${i + 1} aspect`, 0.02, 1, d.aspect, { stage, when, random: [0.04, 0.6], dist: 'low', note: 'Height over width: low is a strip, 1 a square box' }),
      num(`${p}.intensity`, `Light ${i + 1} intensity`, 1, 300, d.intensity, { stage, when, step: 1, random: [20, 140], note: 'Nits' }),
      num(`${p}.kelvin`, `Light ${i + 1} temperature`, 2500, 10000, d.kelvin, { stage, when, step: 50, random: [4500, 8500] }),
    ];
  }),
  num('light.flagging', 'Flagging', 0, 1, 0, { stage: 'later' }),
].map((e) => ({ group: 'light', ...e }));

const camera = [
  num('camera.fov', 'Field of view', 12, 60, 30, { step: 0.5, random: [18, 45] }),
  num('camera.azimuth', 'Camera azimuth', -180, 180, 0, { step: 1 }),
  num('camera.elevation', 'Camera elevation', -60, 60, 10, { step: 1, random: [-40, 50] }),
  num('camera.roll', 'Camera roll', -45, 45, 0, { step: 1, random: [-30, 30] }),
  num('camera.dof.focus', 'Focus offset', -1, 1, 0, { note: '0 focuses on the form centre, negative pulls focus closer' }),
  num('camera.dof.aperture', 'Aperture', 0, 1, 0, { random: [0, 0.25], dist: 'low', note: '0 is a pinhole, no depth of field' }),
  num('frame.cx', 'Frame centre x', -0.2, 1.2, 0.58, { random: [0.35, 0.75], note: 'Where the form centres, 0 left to 1 right' }),
  num('frame.cy', 'Frame centre y', -0.2, 1, 0.42, { random: [0.28, 0.55], note: '0 bottom to 1 top' }),
  num('frame.size', 'Frame size', 0.3, 2, 0.95, { random: [0.6, 1.4], note: "Form's projected height as a share of the frame height. Above 1 it bleeds off the edges." }),
  num('frame.safe.top', 'Safe band', 0, 0.2, 0.06, { roll: false, note: 'Top band kept black, as a share of the height' }),
  num('frame.safe.notch', 'Notch width', 0, 0.5, 0.2, { roll: false, note: 'Width of the centre-top area kept black, twice the band deep' }),
].map((e) => ({ group: 'camera', ...e }));

const output = [
  { id: 'output.autoExposure', label: 'Auto exposure', type: 'bool', default: true, stage: 'A', roll: false, note: 'Scales the brightest 0.5% of lit pixels to just under white' },
  num('output.exposure', 'Exposure', -3, 3, 0, { step: 0.05, random: [-0.5, 0.5], note: 'Stops, on top of auto exposure' }),
  enm('output.toneMap', 'Tone map', opts({ A: ['aces', 'agx'] }), 'aces'),
  num('output.blackPoint', 'Black point', 0, 8, 3.5, { step: 0.1, roll: false, note: '8-bit levels. Pixels whose luminance would encode below it become exactly 0.' }),
  num('output.grain', 'Grain', 0, 0.08, 0, { step: 0.001, roll: false, note: 'Multiplicative, so it never lifts black' }),
  { id: 'output.dither', label: 'Dither', type: 'bool', default: true, stage: 'A', roll: false, note: 'Triangular dither at the 8-bit quantise, skipped for pixels at 0' },
].map((e) => ({ group: 'output', ...e }));

export const SCHEMA = [...form, ...material, ...light, ...camera, ...output];
export const GROUPS = ['form', 'material', 'light', 'camera', 'output'];
export const BY_ID = new Map(SCHEMA.map((e) => [e.id, e]));

export const isBuilt = (stage) => BUILT_STAGES.includes(stage);
export const builtOptions = (entry) => entry.options.filter((o) => isBuilt(o.stage)).map((o) => o.value);

// Whether an entry applies given the other resolved values, following its `when` conditions.
export function applies(entry, params) {
  if (!entry.when) return true;
  return Object.entries(entry.when).every(([id, want]) => (Array.isArray(want) ? want : [want]).includes(params[id]));
}
