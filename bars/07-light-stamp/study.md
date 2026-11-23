# 07 Light stamp: study

Reference: X post by Kombai Selects, "Textured stamps", credited to @mightbe_dg.
https://x.com/kombaiselects/status/2114462008372285732
Studied 2026-11-14 in the owner's signed-in Chrome. Frames were read from the post's video through a
canvas (720 x 720, 6.0 s). No live page was found, so nothing below is `Source: page`.

## What it shows

A stack of three postage stamps on a pale desk among paper scraps. The front stamp is a navy
print: a title, small issue text, and a set of curved arches drawn as a halftone screen. A
cursor moves over it, and the arches light up and go dark. At 2.5 s the video cuts to a close-up
of the stamp on black, and at 5.3 s it cuts back to the wide shot. Source: frames.

## Input

Pointer hover only. No press, no drag. The stamp outline does not move or tilt in any frame, so
the pointer changes the light, not the geometry. Source: frames.

## What moves

- **The lit faces of the arches.** Light coverage in one patch of the lower-left arches
  (video pixels x 300-380, y 360-470) reads 82%, 75%, 68% at 2.8, 3.0 and 3.4 s, then 0% at
  3.6, 3.8 and 4.0 s, then 74% at 4.4 s and 0% at 4.8 s. "Light" means luma above 110. The face
  goes from lit to dark within 0.2 s, so any smoothing on the pointer is short. Source: frames.
- **The dots, not a tint.** Lit areas are light-blue and cream dots on navy. Dark areas are bare
  navy with sparse dots (luma range 31-88 when dark, up to 207 when lit). So brightness is
  printed as dot coverage. The screen is applied after the light, not before. Source: frames.
- **Which side lights up.** The bright pixels cluster on the side away from the cursor. Cursor
  at right and low (video x 434, y 364 at 2.8 s): bright centroid at left and low (362, 422).
  Cursor at upper left (302, 210 at 3.5 s): bright centroid at upper right (426, 269). Only 3
  clean cursor reads exist, so this is a weak reading. Source: frames.

## Material law

Read as an embossed print under a moving key light. The arches are raised relief; a light
direction set from the pointer lights the faces that slope toward it. Because the bright side
sits opposite the cursor, the pointer most likely sets a mirrored light direction (or a virtual
card tilt), not a lamp at the cursor. Then the lit result is screened into halftone dots: the
lighter the shading, the larger the light dots.

Two laws from the Phase 1 relight check apply: **relief** (moving the key light changes shading
where there is relief) and, if the cream highlight is a gloss, **highlight**. The highlight
reading is not confirmed from frames.

## Feel numbers

| Number | Value | Source |
|---|---|---|
| Video length and size | 6.0 s, 720 x 720 | frames |
| Close-up segment | 2.5 s to 5.3 s | frames (whole-frame mean luma drops from 218-223 to 26-52) |
| Halftone pitch in the close-up | about 6 video px (autocorrelation peak at 6 on a row at y 470) | frames |
| Lit-to-dark switch time | 0.2 s or less (3.4 s to 3.6 s) | frames |
| Colours on the stamp | navy, mid blue, light blue, cream highlight on a white paper margin | frames (colour bins plus zooms) |

## Scope verdict (paint-kit Phase 1, "surfaces")

**In scope.** Every colour fits the palette rule: white paper is the ground, navy the ink, and
light blue and cream are two accents (the limit is three).

Engine parts it would use:

- `shape` field for the arches as macro relief, and for the perforated stamp edge as a coverage
  cut (sheet channel G).
- `ink` field for the title and issue text (`data-paint-ink`).
- `paper` and `ink` materials.
- `key` light whose direction follows the pointer (mirrored), plus `ambient`.
- The relight check's **relief** law covers the main beat.

What the engine lacks:

1. **Halftone after light.** In Phase 1 the halftone is a `points` field that writes ink into
   the sheet before shading. Light then brightens paper and dots together, so dot size never
   follows the light. This look needs a screen applied in the finish stage to the lit result.
   It is a small, contained addition: one finish option, no new layer.
2. **Relief from a picture.** Phase 1's `ink` field writes printed coverage, not height. If a
   page wants to emboss a picture rather than a formula shape, it needs a picture-to-height
   option. Drawing the arches as a formula `shape` field avoids this gap for this bar.

No view-angle colour shift and no colour outside the page tokens. It overlaps two Phase 1 bars
closely: `03-halftone-resolve` (the dots) and `01-lamp-on-paper` (light that decides what reads).

## Recommendation

A **follow-up bar after Phase 1** (the spec's "Follow-ups after Phase 1" list, not the roadmap's
Phase 2, which is a new set of paints), and the standing replacement if `05-pool-light` is cut. The Phase 1 spec
says a bar that fails two fix rounds is cut and Phase 1 closes with five; this stamp would reuse
wave 1's halftone and paper work, and needs only the "halftone after light" finish option. It is
not a wave 2 addition by default: wave 2 is three bars the owner picked, and adding one is their call.

Copy the mechanism, not the identity: no "Replay" title, arches, stamp stack or navy-and-cream
scheme. The bar reads its colours from the page.
