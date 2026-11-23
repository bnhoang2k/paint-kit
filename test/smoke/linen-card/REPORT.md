# Smoke test: a linen card under a desk lamp (Task 21 Step 2)

A fresh opus agent, briefed only with `AGENTS.md` and `REFERENCE.md`, built this page on
2026-11-15. It passed `paint-kit gate` on its first run, with no number changed after a result.

## Bar choice

`01-lamp-on-paper`: the only bar with paper, printed text and one spot lamp under the falloff
law. A linen card is read as linen-finish paper card under a lamp.

## What was copied and what was built

- Copied from bar 01: `fields.sheet({ warp: 0.4 })`, `fields.text`, `materials.paper()`,
  `lights.lamp`, `lights.ambient(0.06)`, detail 0.6, the seed from `?seed=`, and the page loop
  that eases the lamp toward the pointer (follow lag 0.1 s).
- Built: one `fields.shape` that writes height only. It draws an A6 card raised by its
  thickness (0.0021 short-side units) and a pressed plain weave whose threads scale with detail.
- New content (a four-line supper invitation in Georgia), layout (a centred card), palette
  (grey-white linen and oxblood ink in light; charcoal card and cream ink in dark) and lamp
  (cone 34°, soft edge 14°, level 0.6, 3000 K, over the card's top-left corner).

## Gate output

`node dist/src/cli/paint-kit.js gate test/smoke/linen-card`, exit 0:

```
pass    render: passes at seeds 1, 2, 3; at seed 1: luminance std 0.1514, frames apart differ by 0.002540, 0 errors
pass    palette: passes at seeds 1, 2, 3; at seed 1: 100.0% of the frame moved by OKLab 0.02 or more when every token was swapped (ground, ink, no accents; needs 49.3%), 0 palette reads and 0 custom lights in page code, 0 colour literals
pass    banding-grain: passes at seeds 1, 2, 3; at seed 1: light run 3 px, grain std 0.01218; dark run 6 px, grain std 0.00862 (run limit 6, grain range 0.004 to 0.018; grain read as the frame at finish grain 0.04 minus the frame at 0)
pass    still: passes at seeds 1, 2, 3; at seed 1: reduced-motion frames 2 s apart differ by 0.000000 (no settle time: it rests on its first frame); 0 frames drawn in 1 s hidden (9 in 300 ms visible)
pass    hygiene: passes at seeds 1, 2, 3; at seed 1: pixel ratio 1.5 at device ratio 3, ground gap 0/255 in fallback, test seam unset
pass    relight: passes at seeds 1, 2, 3; at seed 1: relief pass (moving lamp 0 changes the frame by 0.1300, sheet height range 0.02889); falloff pass (exponent 1.47 (inverse square is 2) over 4 samples (4 left out over ink) at 1 x level spanning ln-distance 0.494, aim gain 0.2753, moved-aim gain 0.3419, at 1.5 x cone 0.0000 from lamp off)
pass    detail: passes at seeds 1, 2, 3; at seed 1: high-frequency share 0.0077 / 0.0130 / 0.0284 at detail 0 / 0.5 / 1, relative rise 2.7061 (minimum 0.012); at detail 0 relight: relief pass (moving lamp 0 changes the frame by 0.1313, sheet height range 0.02859); falloff pass (exponent 1.48 (inverse square is 2) over 4 samples (4 left out over ink) at 1 x level spanning ln-distance 0.494, aim gain 0.2781, moved-aim gain 0.3484, at 1.5 x cone 0.0000 from lamp off)
pass    text-contrast: passes at seeds 1, 2, 3; at seed 1: light: range 0.4805, lit div "Supper on Thursday seven" (ink) 4.87; dark: range 0.1191, lit div "Supper on Thursday seven" (ink) 5.54
pass    flash: passes at seeds 1, 2, 3; at seed 1: 0 general and 0 red flashes per s over more than 25% of a 341 x 256 CSS px window; largest share flashing over 3 per s: 0% general, 0% red; 121 frames stepped frozen, 0 to 2.00 s at 60 fps; pointer path: none (pointer at rest)
passed
```

Thin margins: the dark banding run is 6 px against a limit of 6, and light lit-text contrast is
4.87 against 4.5.

## The agent's own look notes (before the owner's review)

- The pool moves with the lamp; no painted gradient.
- The light scheme reads strongly orange (3000 K on a warm ground; bar 01 moved to 5000 K).
- Card and desk are one material in one colour, and the engine casts no shadows, so the card
  reads mostly by its weave and a faint edge line.
- The weave is faint at detail 0.5 and clear only at detail 1.
- Seeds 1 to 3 look almost the same (bar 01 too).

## Where the agent docs fell short

1. AGENTS.md §3 omits `bar.json`'s required `id`, `reference: { shelfKey, title }` and `beats`,
   what a page with no reference puts in `reference`, and the optional `thresholds`, `motion`
   and `flash` fields.
2. AGENTS.md §2 does not say which files of a copied bar to keep (`gate.test.ts`, `study.md`,
   `notes.md`), nor whether adding a field to a copied paint call is still a copy.
3. AGENTS.md §2 says a page never reads the reduced-motion query; bar 01 reads it to skip its own
   pointer easing.
4. AGENTS.md §4 shows only `gate bars/<name>`; a folder or page outside `bars/` also works.
5. AGENTS.md §5 says to compare with the nearest bar's sheet, but no bar keeps one; it does not
   say where `--out` should go; the sheet labels "key A / key B" even on a page with no key.
6. AGENTS.md never says a builder's look value (emboss depth, cone, lamp place) with no reference
   is allowed, or how to label it ("builder" in bar 01's notes).
7. AGENTS.md §2 "Two pages that copy a bar must not look the same" is ambiguous: does the seed
   vary the look, or must the copy differ from the bar?
8. bars/INDEX.md has nothing for a plain weave (`fields.twill` is twill only).
9. REFERENCE.md `fields.shape` names `hash`, which does not exist (`hash11`, `hash21`); omits the
   signatures of `snoise(vec2)` and `fbm(vec2, int)`; does not say which way `q.y` points, that
   `uRes` is the sheet size in device pixels, what to return for unwritten channels (slot -1),
   or that `uniforms` is read at every draw.
10. REFERENCE.md says coverage 0 is "no surface" but not that the page's ground shows there,
    unlit.
11. REFERENCE.md gives no way for two surfaces (a card on a desk) to take two tones.
12. REFERENCE.md: `lights.lamp` has no `follow`, yet the Pointer section says lights with
    `follow` read the pointer; a lamp that follows needs its own page loop.

## the owner's verdict (2026-11-15)

"Pass, note the look (Recommended)". The test did its job. The weak card edge (card and desk
share one material and colour, and the engine casts no shadows) and the orange light scheme go
to the Phase 2 handoff as engine gaps. The 12 doc gaps above were fixed in the commit after
this one. `sheet.png` is rendered locally and kept out of git (6.9 MB); re-render it with
`paint-kit sheet test/smoke/linen-card --out test/smoke/linen-card/sheet.png`.
