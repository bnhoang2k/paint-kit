# Bars

A bar is a finished page that passes `paint-kit gate` and that the owner kept by eye in a live look
review. Pick the nearest one, read its `notes.md`, and copy or build as `AGENTS.md` says. Each
folder holds `index.html`, `bar.json` (palette tokens, detail, seeds, laws, beats), `study.md`
(what the reference does) and `notes.md` (measured numbers, each with a why, and the look review).

Each page reads its colours from CSS tokens and takes a seed. Copy a bar's mechanism and feel,
never its layout, content, logo or colours. Frame time for bars 03 to 06 was measured in the
browser pane at 60 fps; see each bar's `notes.md`.

| Bar | Fits | Wrong for | Laws | Reference |
|---|---|---|---|---|
| `01-lamp-on-paper` | Text that light decides: a lamp on a rail throws a cone on paper, and words outside it sink into the dark. Day and night switch. Paper with printed type, one spot light that follows the pointer. | Anything with no moving light, anything that must read evenly everywhere (in day mode every word reads wherever the lamp is), or a non-paper surface. It opens at night, unlike its reference. | relief, falloff | Platen (`60fps.design/shots/platen-typewriter-intro-how-to-interaction`) |
| `02-denim-zip` | A full-screen cloth with a drag: denim twill, metal teeth with a moving highlight, a coverage cut that opens as the user pulls. Starts from motion-kit's bar 13 and keeps its `MOTION` block. | A page with no drag, a surface that needs shadows (the pull casts none), or a dark-mode look (light and dark look the same: no dark tokens). | relief, highlight | Flashback zip unlock (`60fps.design/shots/flashback-zip-unlock-splash-get-started-interaction`) |
| `03-halftone-resolve` | A picture that arrives as printed dots: a timeline from coarse to fine grid, then a pale dot field that darkens. Dots print in the ink token on paper, with a caption. | A picture that must read as a photo, more than one ink (it uses three page colours only), or a moving light (the light is a fixed key). Its dark mode prints a negative moon, and the accent only faintly tints the paper. | relief | Brandmelder by NEW STANDARD.S (`60fps.design/motion/brandmelder-by-new-standard-s`) |
| `04-paper-shred` | Scroll-driven paper: a cut line climbs the page, the paper below hangs as swaying strips that lift away to reveal a dark section. Shows a surface that moves (`rest` writers) with paper texture and text that travel with it. | A static page, a surface that stays whole, or one with no dark section behind. Its type sizes are off the scale and its scroll cue was removed (open notes). | relief | Shader (`shader.se`) |
| `05-pool-light` | A pool of water over the page: refraction, moving caustic lines, and a card under the surface that rises and bends with the waves. Uses a lifted layer under the water. | Light on a dry surface, or a still, flat look. Heavy to extend: the water is the engine's hardest bar. The floor stays plain by decision. | caustic | Pool (`60fps.design/shots/pool-importing-screenshots-animation`) |
| `06-glimmer` | Light inside a surface: a stepped cluster of frosted-glass tiles lit from behind, a few glowing white and the rest dim and cool, with lights that follow the pointer and drift. Glass with a glow behind it, tinted by accent tokens. | Light on the front of a surface (use a lamp or key), or a fully saturated blue (dim tiles read a greyer steel blue than the reference; in the light scheme they read as smoked panels on the slate ground). | transmit | Agentic UI (`agenticui.net`) |
| `07-light-stamp` | A card on a page that answers a moving light: an embossed stamp among paper scraps on a desk, its own tone against the desk, a soft shadow that falls away from the light, and a halftone screen after light on the stamp only (`finish.halftone` with `slots`), so lit faces print larger light dots. The pointer is the light. | A surface with no raised card, a screen over the whole page, or a dark mode that must print light dots on a dark bed (its dark mode prints a negative: dark dots on a light ink bed). The relief is the builder's ripple rings, not the reference's arches. | relief, shadow | Textured stamps (`x.com/kombaiselects/status/2114462008372285732`) |
| `10-foil-card` | Holographic foil on a card or sticker (the nearest bar for a holo sticker): a sunburst grating window (`materials.foil`) on a raised paper card on a paper page, under one key light that casts. The pointer both tilts the card (its surface turns, up to 8 degrees) and turns the key, so the colour sweeps round the burst and the shadow follows the light. Printed line art covers the foil; the words sit on the paper face. | Foil that must stay colourful at large tilts (past about 10 degrees the turned grating sends light out of the visible band and the foil goes dark), a curved foil (law (e) is not read on this flat card), or a moving page (the bar rests). | relief, shadow, iridescence | holo card (several sources; `shelfKey` none) |
| `11-heat-tint` | Temper colours on steel: a crowned steel bar on a matte desk, a thin oxide film (`materials.film`, base `"metal"`) whose thickness runs along the sheet's `param` from a hot end, so the bands read blue, purple, brown, straw. The key comes from a point above the pointer, so it turns off the eye: the highlight stripe slides across the bar and the hues shift a little. A grain field drawn after the param writer brushes the bar. | Glow or heat colour (none here), a tilting surface (a tilt does not shift film hue), or a big hue shift (it is close to invisible at the straw and thick-blue ends). The stripe dims when the pointer moves along the bar, and the bar casts no shadow. | highlight, iridescence | heated metal (temper colour sources; `shelfKey` none) |
| `12-burn-card` | A card that burns away on one click: a torn front (`fields.burn` with `tear`) starts in spots and opens holes, the printed words burn with the paper (`materials.paper({ scorch: true })`), a thin hot rim runs along the hole's edge, and glowing specks cool in the burned area (`lights.ember` with `rim` and `specks`). A plain HTML screen follows. `bar.json`'s `query` starts the burn for the checks. | Paper that must stay whole, a light-scheme look (both schemes are dark), a tall flame (none here), or a bright cream paper (the ember cannot warm paper near full brightness). | burn, tint | How We Feel, Story Burn Fire Animation (`60fps.design/shots/how-we-feel-story-burn-fire-animation`) |

## Control

`controls/spectral-drape/` is an approved page from outside the kit. It does not use the engine
and does not follow the kit's rules, so the gate runs only the checks that judge its picture and
prints `control: quiet` or `control: flagged`. It is not a bar to copy.

## No bar fits

Build from `REFERENCE.md` and tell the person. Nothing in this table covers: moving particles,
liquids beyond a pool, skies, or a grown field as a page (`fields.reactionDiffusion` is proven on
`test/pages/grown.html`, not a bar). Also not covered: a plain weave (linen, canvas). `fields.twill`
is twill only, so build a plain weave as your own `fields.shape` (threads as height) on the paper
or matte material, as `test/smoke/linen-card/` does, and say so to the person.
