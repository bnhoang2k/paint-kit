# Notes: 01 lamp on paper

Each number the page uses, with its source and why. Light profiles are 7 x 7 px mean luma on encoded 0..255 values,
read at 960 x 600, dpr 1, seed 1, t 1, page text hidden, text ink off (the paint alone). The lamp head is at y 456.
Distances are in short-side units (ss): the bar's short side is 600 px, the reference phone screen's is 300 px.

## Light (`LAMP`, `ROOM`)

| Number | Value | Source | Why |
|---|---|---|---|
| Lamp height `z` | 0.2 ss | Source: page (study.md profile) | For a flat sheet, light from a bulb at height z falls as z / (r^2 + z^2)^1.5. With z 0.2 that gives 1/4 of the peak at 0.31 ss and 1/8 at 0.39 ss, matching the reference's axis profile (lamp-only linear light: about 1/4 at 0.29 ss, 1/8 at 0.39 ss) |
| Lamp head `y` | 0.76 | page layout | The bulb sits on the CSS `.head` (top 76%), just above the rail (top 80%) |
| Aim `aimY` | 0.3 | page layout | Aims up the page at a grazing angle (23 deg below level), so the pool is a fan that reaches the top of the page, as in the reference |
| Cone, soft | 62 deg, 22 deg | Source: page | The reference's pool starts right at the lamp head (197 at 0.04 ss) and peaks at 0.09 ss. With the aim 23 deg below level, the full-light part reaches 63 deg below level (0.10 ss from the foot) and the soft edge fades to 85 deg (0.02 ss), so the bar's peak sits at 0.08 to 0.1 ss |
| `level` (light paper) | 0.1 | Source: page | Peak 208 at 0.08 to 0.1 ss against the reference's 213 at 0.09 ss, both under the shoulder's knee (231), so the pool does not clip and has no banding run (bar note from check-fix (a)). At 0.06 the peak was 149; at 0.14 it was 236, over the knee |
| `levelDark` (dark paper) | 0.20 | the owner's look call (Task 14 preview, 2026-11-14) | The sweep's dimmest value meeting the look target (0.12) shows no visible pool, which misses the bar's beat (a lamp throws a visible cone); 0.20 is the first grid value with a clear fan while outside words stay under 3:1 (2.71). Not a reflectance ratio: dark paper (ground L 0.27) reflects 0.27^3 / 0.93^3 = 0.0245 of light paper, about 1/41, and no ratio gives this number. The lamp must rise over dark paper because WCAG contrast adds 0.05 to both luminances, so at night's low light levels that flare term swamps the gap between light ink and dark paper |
| `kelvin` | 5000 | Source: page | The reference's hottest pixel is a little warmer than neutral (blue / red about 0.94 encoded). At 3400 K the bar's hot spot read 137 / 113 / 89 (blue / red 0.65, orange); at 5000 K it reads 168 / 154 / 134 (0.80). The rest of the warmth is the ground token's tint, which paint-kit keeps by design |
| `ROOM.night` (ambient) | 0.06 | Source: page | Unlit paper reads 62 (light scheme) against the reference's 53 to 64 |
| `ROOM.day` | 1 | builder | Day is the paper at its own colour under full room light |
| `railMin`, `railMax` | the two word columns' centres (0.347 and 0.653 at 960 x 600) | page layout | Read from the columns' boxes on load and resize. Rule: the lamp never travels past the middle of an outer word column, so at either end it stands under that column and its pool lights it (review I3). Measured in the dark scheme at 0.12, seed 1: lit words 5.15:1 with the pointer at the left edge, 5.05:1 at the right edge. The rail itself (CSS 0.08 to 0.92) is drawn wider than the travel. Reference note, not used: in the clip the capsule's left end of travel is about 22% of the width |
| Lamp head `y` (live) | the .head box's centre | page layout | The head sits a fixed 26 px above the capsule's centre (its post meets the capsule's top), so it never hides behind the 28 px capsule at short viewports (review M3); the light's `y` is read from that box on load and resize, so light and prop stay together. At 960 x 600 it is 0.757 (was 0.76) |

| Sheet `warp` | 0.4 | builder | Gives a sheet height range of 0.0265, above relight's floor 0.005, so the lamp's relief law reads at detail 0; the shelf gives no relief number for Platen |

Bar profile (light scheme, final values), along the lamp's axis, px above the head: 6: 62, 12: 69, 27: 154,
45: 207, 57: 208, 87: 182, 117: 159, 147: 139, 192: 120, 237: 108, 267: 98, 330: 85, 400: 78. Across at 47 px
above the head: half height (135) at about x -75 and +75 px. Below the rail: 61. Top corners: 70 and 71.
Dark scheme (`levelDark` 0.20, the shipped value): peak 51, unlit 4; with the pointer at either rail end the lit score is 7.07 / 6.90 (sweep row 0.20 below; the gate's resting-lamp lit score is 6.75, range 0.0879).

## Dark-scheme night: look target (written before the sweep, fix round 1)

The dark scheme's night is the same light on dark paper. Its look target, stated before any value was measured:

1. Lit words read as body text. The words in the pool core reach at least 4.5:1 (the WCAG body-text level) at the
   worst tenth of their glyph cores. "Pool core" is the pixels text-contrast scores as lit: ink-off luminance at
   least half the frame's 99th percentile.
2. Words outside the cone sink. The glyph cores of #typed outside the pool core have a median contrast under 3:1
   (the WCAG large-text level), so they do not read as text at a glance.
3. The pool does not clip. Its peak (7 x 7 px mean luma, encoded) stays under the shoulder's knee (231), the rule
   `level` already follows in the light scheme.

Among values that meet all three, the dimmest lamp wins: the night stays dark and the outside words sink most. If
the value the target picks fails a gate check, that is reported, and the target does not move.

### Sweep (fix round 1, 2026-11-14)

Dark scheme, 960 x 600, dpr 1, t 1, page text hidden, lamp at rest unless named. Grid: `levelDark` 0.1, 0.15,
0.2, 0.3 with the night ambient 0.06; the night ambient (dark scheme only) 0.1 and 0.15 with `levelDark` 0.1, and
0.1 with 0.15. The lit score crossed 4.5 between 0.1 and 0.15, so 0.11, 0.12 and 0.13 were added to find the
dimmest. "Lit" is the worst tenth of lit glyph cores (scored as text-contrast scores them); "outside" is the median
contrast of the other glyph cores; "range" is the paint's luma p95 - p5 (text-contrast's floor is 0.07); "peak" is
the pool's 7 x 7 mean luma. Seed 1 unless named; "ends" is the lit score with the pointer at the left / right edge.

| levelDark | ambient | Lit (target >= 4.5) | Outside (target < 3) | Range | Peak | Ends | What the frame shows |
|---|---|---|---|---|---|---|---|
| 0.10 | 0.06 | 4.23 (fails 1) | 2.19 | 0.0560 | 36 | 4.64 / 4.56 | Near-black page; only the gutter words ("warm", "rail", "line.", "Slide it", "the rest.") turn cream; no pool visible on the paper |
| 0.11 | 0.06 | 4.49 (fails 1) | 2.24 | 0.0599 | 38 | 4.78 / 4.64 | As 0.10 |
| **0.12** | 0.06 | **4.72; seed 2: 4.83; seed 3: 4.79** | 2.28 | **0.0639** | 39 | 5.15 / 5.05 | As 0.10, the gutter words a little brighter; the pool is a faint smudge under the last lines |
| 0.13 | 0.06 | 5.13; seeds 2, 3: 5.07, 5.04 | 2.39 | 0.0675 (seed 3: 0.0706) | 41 | 5.41 / 5.29 | As 0.12 |
| 0.15 | 0.06 | 5.45 | 2.41 | 0.0753 | 44 | 5.92 / 5.79 | The fan starts to show as light on the paper above the gutter |
| 0.20 | 0.06 | 6.75 | 2.71 | 0.0902 | 51 | 7.07 / 6.90 | A clear grey fan rising from the gutter; outer words still dim grey |
| 0.30 | 0.06 | 8.76 | 3.17 (fails 2) | 0.1146 | 63 | 9.03 / 8.94 | A bright fan; the outer words lift and read too |
| 0.10 | 0.10 | 4.51 | 2.65 | 0.0557 | 37 | 4.87 / 4.68 | Whole page charcoal; pool not visible; outer words greyer |
| 0.10 | 0.15 | 4.71 | 3.19 (fails 2) | 0.0546 | 38 | 5.27 / 5.01 | Whole page lighter charcoal; every word reads, the pool does not show |
| 0.15 | 0.10 | 5.88 | 2.94 | 0.0714 | 45 | 6.18 / 6.03 | As 0.15 / 0.06 on a greyer page |

Result: every row meets target 3 (peaks 36 to 63, far under 231). The dimmest lamp that meets targets 1 and 2 at
seeds 1 to 3 is `levelDark` 0.12 with the night ambient 0.06 (0.11 misses target 1 at seed 1). The ambient lever is
worse on its own terms: raising the room light lifts the outside words (2.65 and 3.19) and shrinks the range
(0.0557, 0.0546), so the night ambient stays 0.06 in both schemes. **At 0.12 the range is 0.0639, under
text-contrast's floor 0.07: the target's pick fails the gate (reported, not tuned).** The first grid value that
meets both the target and the floor at seed 1 is 0.15. The dark cells go to the owner in the Task 14 look review.

Look call (the owner, 2026-11-14): after seeing night frames at 0.12, 0.15 and 0.20 side by side, they chose 0.20, the dimmest level where the cone is visible.

## Beats (`BEAT`)

| Number | Value | Source | Why |
|---|---|---|---|
| `dimS` | 0.4 s | Source: frames, 0.1 to 0.5 s | Day to night: the room light goes down |
| `growS` | 0.5 s | Source: frames, 0.5 to 1.0 s | Then the cone grows, after the dim |
| `outS` | 0.4 s | Source: frames, 7.0 to 7.4 s | Night to day: cone out and room up together |
| `holdS` | 0.45 s | builder (not in the clip) | The clip shows no finger. Long enough that a tap does not switch |
| `slopPx` | 8 px | Android's default touch slop (8 dp) | A press that moves further than this from where it went down is a drag: it cancels the hold and slides the lamp. A still finger jitters a few px, so a smaller slop would cancel real holds |
| `followTau` | 0.1 s | builder (not in the clip) | The clip shows no finger, so it has no pointer lag. An exponential follow keeps the lamp's travel smooth |
| `keyStep` | 0.04 | builder | Arrow keys move the lamp about 1/19 of the rail per press |

Reduced motion: the lamp jumps to the pointer and the day / night switch is immediate.

## Live checks (2026-11-14, headless Chromium, software WebGL)

- Pointer moved to x 250: the lamp eased there; the pool lit the left half of the typed words, and the right half
  sank toward the grey paper.
- A 0.7 s hold on the capsule switched to day ("Day mode"): the lamp went out and the paper showed at its own colour.
  A 0.2 s press did not switch. No page errors.
- Fix round 1 (gate.test.ts, second test): a 1 s drag on the capsule (10 moves of 20 px, 100 ms apart) keeps
  night, and a still 1 s hold switches to day. Before the slop fix the drag switched to day (red); after it, green.
- Fix round 1, short viewports: at 400 x 250 and 640 x 300 the head (172 to 176 px at 250 tall) clears the
  capsule's top (186) and reads as a T on a post above it; the sheet's 400 x 250 cells now show the head.

## Page-capture readout (bar-study-capture.md step 4)

Not run as a comparison. The reference has no WebGL trace (`gl summary`: 0 draw calls per frame), so `gl compare`
has no channels to compare, and its frames show the 60fps.design gallery page around a phone-sized video, so
`compare --blur 4` would score the gallery's chrome against the bar. The profile numbers above stand in for it.

## Frame time

Not measured. It is read by eye on real hardware in the Task 14 look review.

## Look review (Task 14, 2026-11-14)

Verdict: **keep**. The owner: "Keep". Open points kept as notes, not fixes: the bar opens at night (the reference clip opens in day); in day mode every word reads wherever the lamp is. Frame time: not measured (the session window was not on screen during the review).

## Look review (Phase 2 Task 5, 2026-11-16)

Read live in the browser pane, dark then light, at a build of 1b7db11. The only change since the last review: the paper's dial-driven fibre variation is zero-mean (Phase 2 Task 2c), so the fibres no longer shift the page's tone as the detail dial rises.

- Dark: **keep**. The owner: "Keep (Recommended)".
- Light: **keep**. The owner: "Keep (Recommended)".
