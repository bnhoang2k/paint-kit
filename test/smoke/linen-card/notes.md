# Notes: linen card (smoke page)

Each number the page uses, with its source. Light readings are 7 x 7 px mean luma on encoded 0..255 values, at
960 x 600, dpr 1, seed 1, t 1, page text hidden, ink off (the paint alone). Scale: the card is an A6 card
(148 x 105 mm) drawn 0.68 short-side units (ss) tall, so 1 ss = 154 mm.

## Surface and laws

A linen-finish card (heavy paper card with a pressed linen weave) lying on a desk, printed with a short note. Light:
one warm desk lamp over the card's top-left corner, and the dim room light of an evening. Laws: relief (the sheet's
warp, the card's cut edge and the weave change with the lamp) and falloff (the lamp).

## Card (`CARD`)

| Number | Value | Source | Why |
|---|---|---|---|
| `halfW`, `halfH` | 0.48, 0.34 ss | A6 ratio (148 / 105 = 1.41) | The card fills the frame's height with a margin of desk |
| `fit` | 0.86 | builder | On a frame narrower than the card, the card takes 86% of the width; `.card` in CSS uses the same 86vw |
| `thick` | 0.0021 ss | general knowledge, not checked against a source: 300 gsm card is about 0.3 to 0.35 mm thick | 0.33 mm at 154 mm per ss; gives the cut edge its line |
| `pitch` | 0.008 ss | builder, bounded by sampling | 4.8 px at 600 px, about 5 sheet texels per thread at dpr 1, so the weave does not alias |
| `depth` | 0.0006 ss at detail 1 | builder's look value | 0.0003 showed no weave in a 3x crop; 0.0006 shows a crosshatch. Not measured from a real card |
| sheet `warp` | 0.4 | bar 01 | Kept from bar 01's paint call |

## Lamp (`LAMP`, `ROOM`)

| Number | Value | Source | Why |
|---|---|---|---|
| `at` | [0.14, 0.1, 0.55] | builder | A lamp over the card's top-left corner, 85 mm above the desk |
| `cone`, `soft` | 34, 14 deg | builder | The pool covers the note and most of the card at rest |
| `level` | 0.6 | builder's first value, checked by measurement | Light-scheme peak 208, under the finish shoulder's knee (231, bar 01 notes), so the pool does not clip. Dark scheme with the same lamp: peak 42 |
| `kelvin` | 3000 | general knowledge, not checked against a source: "warm white" lamps are sold at 2700 to 3000 K | Reads strongly orange on the warm ground (open point) |
| `followTau` | 0.1 s | bar 01 | The aim's lag behind the pointer |
| `ROOM` | 0.06 | bar 01 (its night ambient) | Unlit desk reads 59 to 61 (light), 5 (dark) |

Profile along the lamp's axis, from the lamp's foot to the far corner, in tenths of the way (light / dark):
0.0: 59 / 5, 0.2: 198 / 38, 0.4: 167 / 31, 0.6: 131 / 22, 0.8: 105 / 16, 1.0: 94 / 13.

## Open points for a look review

- The light scheme reads orange: 3000 K on a warm ground. Bar 01 moved to 5000 K for the same reason.
- The card reads mostly by its weave and a faint cut-edge line. The desk is the same paper and colour, because
  every material paints in the ground token, and the engine casts no shadow.
- Seeds 1 to 3 look nearly the same in the sheet (only the weave's and fibres' noise changes).
- The weave is faint at detail 0.5 and shows clearly only at detail 1.
