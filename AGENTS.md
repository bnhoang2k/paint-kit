# paint-kit: instructions for coding agents

Follow these steps for any web surface you paint in WebGL2: paper under a lamp, denim, halftone
dots, water, glass. A surface is the thing the light falls on: a material, lit by lights, drawn
from a field, with colour from the page. Never pick a number so that a check passes. Measure it,
cite it, or ask the person.

`REFERENCE.md` lists every field, material, light and hook member. `bars/INDEX.md` lists the
finished pages. Both are the source of truth for names: do not guess an option.

## 1. Name the surface and its laws

Write down what the surface is, what it is made of, and what light falls on it. Then name the
laws it must obey. A law is one thing real light does. Each light and material declares its laws,
and the `relight` check tests them:

- relief: moving a key light changes the shading where the surface has relief.
- falloff: a lamp dims with distance (inverse square) and adds nothing outside its cone.
- highlight: a sheen highlight moves toward the light.
- tint: a glow colours the surface it falls on and fades with distance.
- caustic: light through water forms thin lines that move over time.
- transmit: light from behind passes through glass, and the ground between tiles stays unlit.
- shadow: a raised surface darkens what lies under it on the far side from the light, the shadow moves
  the other way when the light moves, and nothing that is not raised casts one.
- iridescence: foil colour changes at each point when the light or the tilt moves and never when only time
  passes; under one key, foil of one groove at one grating angle shows one colour wherever it is, different
  grooves show different colours, and one groove's colour changes across a curve. Thin film has its own branch of this law: its colour changes when
  the key's angle off the eye changes and never when only time passes; equal thickness at equal angle shows one colour wherever it
  is, different thickness shows different colour, and turning the key moves the colour along the film's own thickness
  ramp. A tilt moves a film's highlight and does not shift its hue.
- burn: a burning front only advances, so burned paper never comes back; the same paper darkens once the front
  passes it, with the ember's light off; and the ember warms the paper ahead of the front near it, adds nothing
  beyond its reach, and the light it adds fades toward its reach. No light or material declares burn: a bar with
  `fields.burn` lists it in `bar.json`.

A bar lists its laws in `bar.json` (at least one). A flat sticker style is allowed if its light
and material still obey them. The detail dial (`detail`, 0 flat to 1 near-photo) changes only fine
structure (fibres, threads, ink spread). Macro relief stays at detail 0, so the page still takes
light.

## 2. Find the nearest bar

A bar is a finished page that passes the gate and that the owner kept by eye. `bars/INDEX.md` lists
each bar with what it fits and what it is wrong for. Pick the nearest and read its `notes.md`.

- **Copy:** the bar's shape fits. Copy its folder, change the content, keep its paint call.
  A bar copies its reference's mechanism and feel, never its layout, content, logo or colours.
  Adding a field, a light or a shape to the copied paint call is still a copy, as long as the
  bar's lights and materials stay; say what you added in `notes.md`. Changing the card's size, its lift or its groove pattern is more than content: the shadow and iridescence laws read them (see `REFERENCE.md`, shadow and iridescence), so read the gate's lines for those laws first. Keep `bar.json` and
  `notes.md`. Drop `study.md` (it describes the bar's reference, not your page) and
  `gate.test.ts` (the bar's own vitest wrapper around `gate`; a page outside `bars/` needs
  neither).
- **Build:** no bar fits. Compose from `REFERENCE.md` only, and tell the person that no bar
  covers this surface.

Rules every page follows:

- Colour comes only from the page's CSS custom properties, through `fromPage`. No hex, `rgb()`,
  `hsl()` or named colour in code. A GLSL `vec3` that is not a colour carries
  `// not-colour: <reason>` on its line, and so does a `uniform vec3` or `uniform vec4` that is not a colour. The palette check can also flag a colour word ("white") in a comment: write "pale" instead.
- Lights come only from `lights.*`. A page never writes its own light shader.
- Text stays in the HTML. Text the light must fall on carries `data-paint-ink`; the engine draws
  it into the sheet and hides the HTML copy while WebGL runs.
- The page loads the engine as `paint-kit` through an import map to `/dist/src/engine/index.js`.
  No bundler.
- Take a `seed` (from `?seed=`) and feed it to the paint: every random number in a paint comes
  from it, and the gate runs each page at every seed in `bar.json`. No check requires that
  different seeds look different. Two pages that copy a bar must not look the same because of
  their own content, layout, palette and lamp, not because of the seed. Give `bar.json` at least
  two or three seeds, and look at them in the sheet (section 5).
- Without WebGL2 the page shows its ground colour and stays readable. Under reduced motion the
  engine settles its own clock to one still frame. Page code may read the media query only to
  skip its own motion, such as the pointer easing of a lamp (bar 01 does this and nothing
  else with it); it never settles the paint itself.
- Never dim or flatten a paint so that a contrast or banding check passes. The checks carry
  floors against that ("mud").

## 3. Say what the page is for

Write a `bar.json` beside the page. Required: `id`; `reference` as `{ shelfKey, title }`
strings; `palette` token names; `detail`; `seeds`; `laws`; how it moves (`alive`, either
`{ t0, t1 }` or `{ rests: why }`); and `beats`, a list of strings that say what the page does
in order. A page with no reference sets `shelfKey` to `"none"` and `title` to the request it
answers, plus the bar it copies. Optional: the text that must stay readable (`text.always`,
`text.lit`, two lists of selectors), `view` if it is not 960 x 600, `settle` if its picture
holds, `thresholds` (a map of name to `{ value, why }`), `motion` (`{ from, cited }`) and
`flash` (`{ pointer }`, a path of `{ t, x, y }` stops for a pointer-driven light), and `query`
(URL parameters such as `burnAt=0`, for a page that waits for a user: the gate and the sheet open it with them).
`src/bar.ts` (`loadBar`) rejects a malformed file and names the field. A threshold a bar sets
itself needs a measured value and a reason. A look value with no reference (emboss depth, cone
angle, lamp place) may be the builder's choice. Label it "builder" in `notes.md` with the
reason. Never choose it after seeing a check result.

## 4. Build, then run the gate

```bash
pnpm install
pnpm exec playwright install chromium
pnpm build
node dist/src/cli/paint-kit.js gate bars/<name>
```

`gate` takes a bar folder or a page `.html` file, inside `bars/` or not. A folder or a page
with a `bar.json` beside it runs at every seed in the file; a page with none runs once, at
seed 1.

The gate prints one line per check, then `passed`, `partial` or `failed: n`. A partial run is not
a pass: a check could not measure something, and its line says what. The nine checks:
`render`, `palette`, `banding-grain`, `still`, `hygiene`, `relight`, `detail`, `text-contrast`
(only on a page with text) and `flash`. Fix each failure, build, and run again. Each check runs
at every seed in `bar.json`.

`gate --all` runs every bar and control. A page under `controls/` is a control: an approved page
from outside the kit, which runs only the checks that judge the picture and prints
`control: quiet` or `control: flagged`. Gate results from headless Chromium are not speed. Judge
speed by eye in a real browser.

If a law check cannot read the page (no lamp to fit, no glass to find), stop and tell the person
what is missing. Never remove a light's law, a material's slot or a text selector to make a check
pass.

## 5. Look at the surface

The gate checks numbers. It cannot tell whether the surface looks made. After it passes, render
the sheet and read it:

```bash
node dist/src/cli/paint-kit.js sheet bars/<name> --out <folder of the page>/sheet.png
```

Write the page's own sheet into its folder. `sheet.png` shows seeds 1 to 3, light and dark
palettes, detail 0, 0.5 and 1, and two test positions of light 0. The label "key A" and "key B"
means those two positions, whatever light 0 is: for a page whose only light is a lamp, they
are the lamp's two test positions. A light 0 with no test positions gives one cell per detail,
labelled "key n/a". No bar keeps a sheet, so render the nearest bar's sheet to a scratch path
and compare the two. Look for painted-on light (a glow that does
not move with the light), smooth plastic, a gradient wash, and detail that shows only at
detail 1. Fix what looks wrong, then gate and sheet again. The owner judges the look in a live
browser; the checks catch faults, not beauty.

## Changing the kit itself

These rules are for work on this repository, not on a project that uses it. Each check has
planted-fault fixtures under `test/faults/` that it must fail, and `test/pages/` holds the pages
the checks run on. A new check or a changed threshold needs a fixture that fails it and a
recorded reason in `src/checks/thresholds.json`. Run `pnpm typecheck`, then the suites you
touched.

The page suite (`test/pages/*.test.ts`, `bars/*/gate.test.ts`) has two aids. `vitest.pages.config.ts`
sets `testTimeout` and `hookTimeout` to 120 s, so a page test that grows past 120 s fails. A test that
passes its own timeout above 120 s overrides the guard: avoid it. `pnpm test:pages:steps`
(`scripts/test-pages.mjs`) runs the whole suite as a series of vitest commands, each killed at 145 s with
its process group and its whole descendant tree (Chromium leads its own group). It saves results in `node_modules/.cache/paint-kit/pages-runner.json`,
so a re-run skips what passed. Results are discarded, with a printed line, when HEAD, the diff of
`test`, `src`, `bars`, `scripts` or the dist build time changed. A file that hits the cap is re-run one test per command, matched by its exact name (a row of `it.each` has its own step). Flags:
`--fresh` (start over), `--build` (run `pnpm build` once first), `--only <text>` (files whose path
contains the text), `--cap <seconds>`. It prints one line per step and ends with
`summary: n passed / n failed / n timed out`; a timeout is never a pass.
