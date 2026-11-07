# OLED wallpaper generator: plan

A seeded generator that renders a still desktop wallpaper: a sculpted ribbon form, path-traced, lit
against exact black. A browser page with sliders is for Tejas. A CLI drives the same page headless,
so an agent can sweep seeds and render finals.

Status: plan, waiting on approval. Decisions come from the grilling rounds on 2026-11-05. A Codex
(gpt-6.1-sol) second opinion is folded in: a stronger spike, a fixed output pipeline order, checks
on the decoded PNG, and tighter test cases.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Output | Static PNG, 8-bit SDR | macOS shows HDR wallpapers as SDR (user reports, not documented by Apple). No live wallpaper. |
| Target | This Mac: 16" M4 Pro MacBook Pro, mini-LED, 3456 × 2234 | It's the machine in use. Other sizes are a re-render. |
| Panel rule | Brights as a few large shapes, not scattered fine detail | Mini-LED lights a whole backlight zone for one bright speck, which shows as a halo. Large shapes suit both mini-LED and OLED. |
| Genre | One sculpted object lit against black, like Apple's hardware-launch wallpapers (Pro Black, Chroma Blue, Motion) | The stock wallpapers with real black in them are all this genre. OS defaults are navy gradients with no true black. |
| Subject | Ribbons, heavily customizable | Large lit planes on a black field. Width, twist, path, section, material and light all vary. |
| Default palette | One saturated hue plus white highlights | Reads as designed. Iridescence tints the falloff and works against pure black. |
| Black | Background exactly 0,0,0. No cap on art coverage. | The point of the piece. |
| Safe zones | Top band and camera area stay black. Art weighted low or off-centre. | Menu bar and notch sit on pure black. |
| Renderer | three.js r187 + three-gpu-pathtracer 0.0.28, `WebGPUPathTracer` (chosen by the spike) | The look depends on real light transport off curved gloss and metal. Rasterised three.js looks like real-time CG. |
| Randomness | Seed rolls every unlocked parameter; presets are JSON files | Lock the material, reroll the form. Agents can sweep. |
| Composition | Auto-framing before render, checker after | Framing keeps the form in a target box. The checker measures what actually rendered. |
| Tiers | Draft at 864 × 559, final at 3456 × 2234 | Drafts take seconds for sweeps. Finals take minutes. Sample counts set after the spike. |
| Headless driver | `playwright-core` with the installed Google Chrome | WebGPU only exists in a browser. No extra browser download. |
| Build step | None. Import map to `node_modules`, served by a small Node server. | Sandbox default is plain HTML, CSS and JS. |
| Process | This plan plus a light second opinion. No code review. Local commits on `main`. | Experiment, not product code. |

## Step 0: spike (before anything else)

Prove the riskiest link first: headless Chrome, driven by `playwright-core`, path-traces a test
ribbon on this Mac's GPU and returns pixels.

- Use the pinned versions together: three 0.187, three-gpu-pathtracer 0.0.28 and three-mesh-bvh.
- The scene is a curved, twisted metal ribbon and a gloss ribbon, lit by two rect area lights. One
  light sits inside the camera's view, to see whether the path tracer draws the light itself.
- Render at 864 × 559 and at 3456 × 2234 and save both PNGs.
- Record, at both sizes: the WebGL backend and renderer string, startup time to the first sample,
  sustained samples per second, and the samples actually completed. Stop with a `!!` line if no
  sample completes within 60 seconds.
- Render the same seed twice after a sampler reset and compare the decoded pixels.
- Inspect the full-size curved reflection for noise at a few sample counts, then pick the draft and
  final budgets from what looks clean.
- If headless fails on the GPU, try `headless: false` with an off-screen window. If that fails too,
  stop and bring it back to Tejas.

The spike's numbers set the draft and final sample counts and the tolerance for "identical render"
in the test cases.

### Spike results (2026-11-05)

Run with `node spike/run.mjs`. Code in `spike/`, report in `out/spike/report.json`.

- **Backend: WebGPU.** `WebGPUPathTracer` runs in headless Chrome on the Apple Metal 3 adapter.
  Repeat renders after a reset are byte-identical, so "identical render" means identical. The
  WebGL `WebGLPathTracer` also runs (ANGLE on Metal), but it is deprecated, slower, and not
  repeatable: 18.9% of values differed between two runs.
- **Throughput** with `frameBudget` raised to 8M (draft) and 16M (final) path steps per frame.
  The default of 250k left the GPU idle at a quarter of the speed:

  | Size | Samples per second | 64 spp | 256 spp | 1024 spp |
  | --- | --- | --- | --- | --- |
  | 864 × 559 | 56 to 73 | 1.3 s | 3.9 s | about 15 s |
  | 3456 × 2234 | 5.1 | 12.7 s | 50 s | 3.4 min |

  Startup to the first sample is 0.2 to 0.7 seconds.
- **Budgets.** Draft: 64 spp. Final: 1024 spp. At 1:1, 1024 is clean except faint grain in the
  darkest blue, and 256 is visibly grainy. A `--samples` override stays available for darker pieces.
- **Lights in view.** The WebGPU tracer hides lights from camera rays unless a light sets
  `visibleToCameraRays`. A rect light placed inside the frame drew nothing, and its reflections
  still showed.
- **Black.** With no environment and no floor, 67 to 68% of the frame is exactly 0,0,0. Pixels at
  levels 1 to 3 cover 0.11 to 0.23% with plain ACES and no black point, under the 0.5% limit.
- **Geometry lessons for `sweep.js`.** The tracer culls faces wound inward, so the winding must
  face out. Flat faces need their own vertices per side: shared corner vertices smooth the normals
  round the corner, rays bounce under the surface, and the face fills with black specks that more
  samples never clear.

## Build notes (stage A, 2026-11-05)

Changes made while building, each found by a render or a test:

- **Auto exposure** (`output.autoExposure`, on by default). Random lights left half the drafts blown
  out or murky. It scales the 99.5th percentile of lit pixels to just under white, and
  `output.exposure` is now an offset on top.
- **Black point default 3.5** levels, up from the 2.5 first tried. The dim side of a gloss ribbon
  sat at levels 2 and 3 over 2.7% of the frame. That's real shading, not noise, since it didn't fall
  with 8 times the samples.
- **`clampIndirect: 3`** on the tracer (its default is 10). It cuts fireflies from light bounced
  between ribbon faces, 25 specks to 9 on seed 1, for a small bias. Raising `filterGlossyFactor`
  instead flattened the whole ribbon into an evenly lit form, so it stays at 1.
- **Path smoothing.** Lissajous curves turn back in hairpins where all three axes slow at once
  (bend radius 0.027 against a half-width of 0.15). Paths get a Gaussian smoothing over 0.5% of
  their length, then an even resample.
- **Pinching at tight bends.** Where a bend is still tighter than the section reaches, the section
  shrinks there, eased along the length, instead of folding through itself.
- **Framing.** Distance sets the size, down to 1.6 form radii, and the lens zooms past that. The
  top limit is twice the band under the notch, plus a 1% edge margin.
- **Speck check** runs on a box-blurred brightness, so sampling grain doesn't count. Real edge glints
  still fail it, which is the mini-LED halo case.
- **Schema.** The material kind sets metalness, so there's no separate `material.metalness`.
  `camera.distance` is replaced by `frame.size`, since framing computes the distance.
- **Studio locks** are overrides. Editing a slider locks it, and rerolling keeps locked values.

## Parameter schema

One file, `src/schema.js`, is the single source. Each entry has `id`, `group`, `type`, `min`, `max`,
`step` or `options`, `default`, and `stage`. The page builds its sliders from it, the CLI's `schema`
command prints it, and the resolver validates against it.

The first build ships in two stages (agreed 2026-11-05, after the Codex review flagged the geometry
load):

- **Stage A**: one ribbon. Three path families, flat and tube sections, taper and twist, three
  materials, two lights, and the full camera and output group.
- **Stage B**: multiple strands and braiding, pleated and grooved sections, and custom width curves.
  It starts only after Tejas has judged a dozen stage A renders, which decide what earns its place.

The full schema is written now so names and ranges settle. Each option and entry is tagged `A`, `B`
or `later`. The resolver rejects anything not built yet with "not built yet".

### Form

| Parameter | Stage | Notes |
| --- | --- | --- |
| `form.path` | A: knot, lissajous, spiral. Later: noiseWalk, attractor | Curve family the ribbon follows |
| `form.path.*` | A | Per family: knot p and q, Lissajous frequencies and phases, spiral turns and pitch. Scale. |
| `form.length` | A | Fraction of the closed path swept, so open ribbons get free ends |
| `form.strands.count` | B: 1 to 5. Stage A is fixed at 1 | |
| `form.strands.layout` | B: parallel, braided. Later: fanned, offset | How strands relate |
| `form.strands.spacing` | B | |
| `form.section` | A: flat, tube. B: pleated, grooved. Later: slatted, hollow | Cross-section profile |
| `form.section.*` | A: tube roundness. B: pleat and groove count and depth | |
| `form.width.profile` | A: constant, taper, swell. B: two-control-point curve | Width along the length |
| `form.twist.turns` and `form.twist.profile` | A | Total twist and how it's spread along the length |
| `form.thickness` | A | |
| `form.bevel` | later | Edge bevel radius |
| `form.ends` | later | Square, round or tapered ends |

### Material

| Parameter | Stage | Notes |
| --- | --- | --- |
| `material.kind` | A: gloss, metal, satin. Later: brushedMetal, clearcoat, glass, thinFilm | Maps to `MeshPhysicalMaterial` settings |
| `material.hue`, `material.saturation`, `material.value` | A | Default: one saturated hue |
| `material.roughness`, `material.metalness` | A | Presets per kind, overridable |
| `material.inner` | later | Second material on the inside face |
| `material.edgeGlow` | later | Emissive edge strength and colour |

### Light

| Parameter | Stage | Notes |
| --- | --- | --- |
| `light.count` | A: 1 to 2. Later: up to 4 | Rect area lights |
| `light.N.role` | A: key, rim. Later: kicker | Sets default placement relative to the camera |
| `light.N.azimuth`, `.elevation`, `.distance`, `.size`, `.intensity`, `.kelvin` | A | |
| `light.flagging` | later | Extra control to keep light off parts of the form |

There is no environment map and no floor, so camera rays that miss the form return exactly 0. The
background is black by construction, not by clamping. Lights must not show up as visible shapes in
the frame. The spike shows whether the path tracer draws them, and the scene hides them if it does.

### Camera and output

| Parameter | Stage | Notes |
| --- | --- | --- |
| `camera.fov`, `.distance`, `.azimuth`, `.elevation`, `.roll` | A | |
| `camera.dof.focus`, `.aperture` | A | Aperture 0 disables |
| `frame.box` | A | Target box in normalised screen space, default weighted low-right |
| `frame.safe.top` | A | Height of the top band kept black, default 6% |
| `frame.safe.notch` | A | Width of the centre-top area kept black |
| `output.exposure`, `output.toneMap` | A | AgX or ACES |
| `output.blackPoint` | A | Values below it quantise to 0, so faint haze never reaches the levels just above black |
| `output.grain` | A | Applied only above the black point |
| `output.dither` | A | Triangular dither at the 8-bit quantise, skipped for pixels at 0 |

### Output pipeline

`render.js` runs these steps in this order. Zero stays zero through every one of them:

1. Path-traced linear light, averaged over N samples.
2. Exposure, then the tone map (AgX or ACES). Both map 0 to 0. A unit test checks it for each one.
3. Black point: any pixel whose luminance is below `output.blackPoint` becomes 0 in all channels.
   The pixel is masked from here on.
4. Encode to sRGB.
5. Grain, then dither, only on pixels not masked in step 3. Both clamp to at least 1/255, so they
   can't push a lit pixel to 0 or a masked one above it.
6. Quantise to 8 bits.

Levels 1 to 3 are flagged, not forbidden. Every edge that falls into black passes through them.
The worry is a faint haze across a large area, so the check fails when more than 0.5% of the frame
sits at 1 to 3. That threshold is a parameter of the checker.

## Seeds, locks and presets

- The resolver takes a seed, an optional preset, a list of lock patterns, and explicit overrides, and
  returns a full, validated parameter object.
- Each parameter draws from its own stream, hashed from the seed plus its `id`. Adding a parameter
  later doesn't change the values of existing ones for the same seed.
- Order of precedence: explicit override, then preset value for a locked parameter, then the seeded
  draw, then the preset default.
- Presets live in `presets/*.json` and hold any subset of parameters. Stage A ships three: `graphite`
  (monochrome metal), `cobalt` (saturated blue gloss, the default), and `ember` (warm satin).

## Files

```
experiments/oled-wallpaper/
  PLAN.md
  package.json            three, three-gpu-pathtracer, three-mesh-bvh, playwright-core
  index.html              studio page: preview canvas, sliders from the schema, lock icons, export
  render.html             headless entry the CLI drives
  src/schema.js           the parameter schema
  src/resolve.js          seed, preset, locks, overrides -> validated params
  src/rng.js              seeded per-parameter streams
  src/form/paths.js       knot, lissajous, spiral curves, smoothed and resampled by arc length
  src/form/sections.js    flat and tube sections (stage B adds pleated and grooved)
  src/form/sweep.js       rotation-minimising frames, width and twist profiles, bend pinching
  src/form/index.js       params -> mesh arrays
  src/scene.js            params -> three.js scene: geometry, materials, lights, camera
  src/framing.js          fits the form's projected bounds where the frame asks, clear of safe zones
  src/render.js           browser only: WebGPU path tracing to N samples, readback, output pipeline
  src/output.js           auto exposure, tone map, black point, encode, grain, dither, quantise
  src/analyze.js          black share, darkest non-zero value, haze, safe zones, bright specks
  src/png.js              8-bit PNG codec for Node
  src/studio.js           the studio page's logic
  cli/wallpaper.mjs       the CLI
  cli/server.mjs          static server for the pages and node_modules
  spike/                  step 0: run.mjs, index.html, spike.js
  presets/*.json
  test/*.test.mjs         node --test
  out/                    renders and sidecars, gitignored
  research/               survey page; stock-wallpapers.png is gitignored (Apple and Nothing artwork)
```

## CLI

The CLI starts the server, opens the page in headless Chrome, calls `window.wallpaper.render(params,
tier)`, and writes the PNG plus a sidecar JSON. The sidecar holds the full resolved parameters, the
render settings (width, height, samples, tier, sampler seed, library versions) and the report.
Output is one line per step and one summary line, with the full log in `out/wallpaper.log`.
`--chrome <path>` overrides the Chrome location, which defaults to `/Applications/Google
Chrome.app`. Every render runs the checker on the PNG it wrote, and a render whose check fails
exits 3 with its file kept for inspection.

```
node cli/wallpaper.mjs schema [--group form]
node cli/wallpaper.mjs random [--seed N] [--preset cobalt] [--lock 'material.*'] [--set form.twist.turns=2] [--count 12]
node cli/wallpaper.mjs render --params out/cobalt-1234-draft.json [--tier draft|final]
node cli/wallpaper.mjs final out/cobalt-1234-draft.json
node cli/wallpaper.mjs check out/cobalt-1234-final.png
node cli/wallpaper.mjs serve
```

File names are `<preset>-<seed>-<tier>.png`. The summary line reads like
`ok cobalt-1234-draft.png 864x559 64spp 6.1s black 71.4% darkest 3 safe ok specks 0`.

Exit codes: 0 for success, 2 for bad input (naming the parameter and its range), 3 when the check
fails (each failure on a `!!` line), 4 when the browser or GPU is missing (with the fix).

## Checks

`analyze.js` runs on every render and on `check`:

- Black share: percentage of pixels at exactly 0,0,0.
- Darkest non-zero value, plus the share of pixels at levels 1 to 3. More than 0.5% fails, since
  a haze at those levels looks blotchy on OLED.
- Safe zones: any pixel above 0 inside the top band or the notch area fails.
- Specks: bright connected regions smaller than a threshold area fail. This is the mini-LED halo risk.

The checker reads the decoded PNG, never the float buffer. Depth of field spreads light past the
form's projected bounds, so framing can't promise a clean safe zone on its own. The check on the
rendered file is what decides.

## Test cases

Each has a setup, steps and an expected result. Tejas gives the verdict on the visual ones.

1. **Spike.** Run step 0. Expect PNGs at both sizes of lit ribbons on black, the backend and
   renderer string, timings and completed samples, and a note on whether the in-view light shows.
2. **Exact black.** `random --seed 1` four times: AgX and ACES, each with grain and dither on, then
   off. Expect background pixels exactly 0,0,0 in the decoded PNG every time, and a pass on the 1 to
   3 haze check.
3. **Same params, same image.** Render one sidecar twice. Expect the same width, height and samples
   in both sidecars, and decoded pixels within the tolerance the spike set.
4. **Locks.** `random --seed 1 --lock 'material.*'`, then `--seed 2` with the same lock. Expect
   identical material values in both sidecars and different form values.
5. **Stable streams.** Unit test: adding a parameter to the schema leaves existing values unchanged
   for the same seed.
6. **Framing.** Ten random seeds, then one seed at the maximum aperture with `frame.box` touching the
   top band. Expect each form's bounds inside `frame.box`, and `safe ok` in every summary. If the
   wide-aperture render fails, framing needs a margin that grows with aperture.
7. **Checker catches violations.** Run `check` on a test PNG with a bright patch in the top band, a
   lone 2 × 2 speck, and a 1% haze at level 2. Expect exit 3 and one `!!` line for each.
8. **Bad input.** `--set form.length=2`. Expect exit 2 and a message with the valid range. Also
   `--set form.path=attractor`, and in stage A `--set form.section=pleated`, both expecting
   "not built yet".
9. **Variety, the stage A gate.** `random --count 12` with the `cobalt` preset. Tejas judges whether
   the twelve read as twelve different pieces, not one ribbon in twelve poses, and picks which stage
   B features to build. Stage B reruns this case with its new parameters unlocked.
10. **Final on the desktop.** `final` on Tejas's pick. Expect 3456 × 2234. Set it as the wallpaper.
    Tejas judges banding in the falloff, halos around brights, and the menu bar on black.
11. **Studio page matches the CLI.** Load a sidecar in the page and export it at the sidecar's size
    and sample count. Expect decoded pixels within the spike's tolerance of the CLI render.
12. **Missing Chrome.** `render --chrome /nonexistent`. Expect exit 4 and a line naming
    `--chrome` and the default path.

## Automated tests

`node --test` covers:
- the resolver: precedence, locks, validation and stable streams
- the sweep: no NaN, frames stay orthonormal, and the width and twist profiles hit their end values
- the output pipeline: each tone map sends 0 to 0, and grain and dither never touch masked pixels
- `analyze.js` on synthetic images: black share, darkest value, the haze share, safe zones and specks

## Open questions

- Whether Cursor picks up the three.js skills from the project's `.agents/skills/`. A new Cursor
  thread will show it.

## Out of scope

Live or animated wallpapers, HDR output, Windows and phone sizes, the "later" parameters, and
setting the wallpaper automatically.
