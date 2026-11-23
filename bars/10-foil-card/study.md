# 10 Foil card: study

Reference: none. No single page is the reference. The bar follows real holo trading cards, so
`reference.shelfKey` is `"none"` and `reference.title` is "holo card (several sources)".
Source files, all under the brain repo `paint-kitBrain`:

- `Research/2026-11-14-iridescence-sources/2-diffraction-cards.md` (called "cards file" below).
- `Research/2026-11-14-iridescence-sources/4-rendering-prior-art.md` (called "prior-art file").
- `Ideas/2026-11-14-iridescent-surfaces.md`, sections "Grating and cards" and "Sources check"
  (called "ideas file").
- `Planning/specs/2026-11-16-phase-2-surfaces-round-two-design.md` (called "spec"), "Wave 2: foil"
  and "Anti-goals".

No live page was opened for this study. Nothing below is `Source: page`. The sources were read
on 2026-11-14 by research agents, not re-checked here. The source for each claim follows it.

## What it shows

A card lies on the page with its own tone and shadow. Its art window is diffraction foil. Printed
art and text stay readable over the foil. Tilting the card, or moving the light, sweeps colour
across the foil along the grooves. Source: spec, "Bar: foil card" (beats).

## Card types

- **Holo.** The foil effect sits on the card artwork. Source: cards file, item 1.
- **Reverse holo.** The foil covers the whole card except the picture. Or the picture uses a
  different pattern. Source: cards file, item 1.
- **Mirror-foil reverse holos.** Some newer reverse holos use a mirror foil base. It gives no
  colour scatter, so "holofoil" is the wrong word for them. This is a plain bright surface, not
  this bar's material. Source: cards file, item 1.
- **Art window or reverse holo is a mask.** The spec feeds the foil mask from a material slot.
  Source: spec, "Grating material".

## Groove patterns

The sources name these patterns. They give no groove geometry for any of them. How each pattern
is made physically is not confirmed: embossed grating or patterned metal. Source: cards file,
item 1 and its "NOT found" line.

| Pattern | Name in the sources | Direction field to paint (my reading) |
|---|---|---|
| Sunburst | named in the spec only ("sunburst"); not in the cards file | Grooves run along rays from one centre, so the angle turns around that point |
| Cracked ice | irregular shards; some cards cover all but the Pokemon | One direction per shard, with a jump at each shard edge |
| Tinsel | horizontal stripes | One direction everywhere (horizontal) |
| Line | thin vertical lines | One direction everywhere (vertical) |
| Sheen | diagonal sweep | Not in the sources beyond the name |
| Mirage | horizontal sweep, silver borders | Not in the sources beyond the name |
| Starlight, Cosmos, Water Web | named only | Not in the sources |

Source for all names: cards file, item 1 (Bulbapedia, a community wiki). The direction-field
column is my reading, not a source claim.

How colour moves when the card tilts (follows from the grating rule below):

- **One direction (tinsel, line).** Every point has the same groove. Colour changes smoothly
  across the card as each point's view angle differs a little, and it all sweeps together when
  the tilt changes.
- **Sunburst.** Each point has its own groove angle, so a band of colour turns around the centre
  as the tilt changes.
- **Cracked ice.** Each shard sweeps on its own, so neighbouring shards show different colours
  under the same light.

This matches the spec's law: two points with different grooves under the same light show
different colours. Source: spec, "New law: iridescence" (d).

## The grating mechanism

- Foil film is embossed with fine parallel grooves. The film sold for this is 500 lines per mm
  (2.0 µm spacing) or 1000 lines per mm (1.0 µm). Source: cards file, item 3 (Edmund Optics).
- Real card foil spacing is not published. Spec range 1.0 to 2.0 µm is an inference. Source:
  cards file, item 3; ideas file, "Grating and cards".
- A CD is the familiar case: track pitch about 1.6 µm under a thin metal layer, a reflection
  grating. Each colour adds up at a different angle, so tilting shifts the colour. Source: cards
  file, item 4 (IMSc Chennai outreach page).
- The rule: d sin(theta_m) = m lambda at normal incidence. In general
  sin(theta_i) + sin(theta_m) = m lambda / d. The spacing must be near the wavelength. Source:
  cards file, item 3 (Wikipedia, diffraction grating).
- Several orders (m = 1, 2, 3 ...) each give their own rainbow. Stam sums orders 1 to 7. Source:
  prior-art file, item 4 (GPU Gems ch. 8).
- Colour depends on the grooves' tangent T and the half vector H between light and view, as
  u = dot(T, H) times d. Source: prior-art file, item 4.
- Why a point can stay dark: when the grooves run parallel to the plane of the light and view,
  dot(T, H) is zero and u = 0. Then no rainbow forms. That is the mirror direction, where Stam
  adds a plain anisotropic highlight instead. Source: prior-art file, item 4 (u = 0 line).
  My reading: a point with groove tangent T lying in that plane shows only that highlight.
- Stam's printed wavelength range (0.5 to 1 µm) looks like a text error, because visible light
  is about 0.4 to 0.7 µm. Do not copy printed constants. Source: prior-art file, item 4.
- Stam's text is all rights reserved. Read it for reference. Write our own code. Source:
  ideas file, "Rendering prior art" (licences).
- Not oil-film colour. Oil film is thin-film interference, a different mechanism. Source: cards
  file, item 4.

## Ink over foil and the white under-print

Magic: The Gathering foils are a holographic laminate glued to the paperboard. Elements are
under-printed with different values of white ink (the "WUP" plate) to make shiny areas and opaque
areas. Source: cards file, item 2 (Wizards of the Coast, 2018-06-29, a primary source).

- **Where foil shows.** Where the under-print is thin or absent, ink printed over the foil is
  see-through, so the foil colour shows through the light parts of the ink. Source: spec, "Ink
  over foil". Community wiki detail: opaque areas need a white base. Source: cards file, item 2
  (mtg.fandom.com, secondary).
- **Where foil is blocked.** A heavy white under-print makes the ink opaque, so no foil shows.
  Text and fine art sit on this, to stay readable. Source: spec, "Ink over foil".
- Peeling the foil leaves a blank white front. This confirms the white sits under the ink. Source:
  cards file, item 2 (community wiki).
- Paint-kit page rule for this bar: text stays in the HTML and carries `data-paint-ink`. The
  under-print is a mask the page paints, not a second copy of the text. Source: `AGENTS.md`,
  section 2.

## Input

The sources describe one web demo family, `pokemon-cards-css`. Its pointer sets CSS variables
for the pointer's place and its distance from the card centre. A gradient stack of hand-picked
colours slides with the pointer. A glare, a radial gradient at the pointer, follows it. Source:
prior-art file, item 5.

- Feel to read: the colour slides with the pointer and the glare follows the pointer. Whether
  the card also rotates in 3D is not in the sources.
- This is not physics. The colour is a hand-made gradient slid by the pointer. Source:
  prior-art file, item 5.
- Licence: GPL-3.0. Read it for feel only. Copy no code, gradients, numbers or image assets.
  Source: prior-art file, item 5; ideas file, "Rendering prior art" (licences).
- What the pointer drives in this bar (tilt the card, move the lamp, or both) is decided by eye at
  the look review. The page offers each option while under review. Source: spec, decisions table
  ("What the pointer drives on the foil card").
- Under reduced motion the engine settles its own clock to one still frame. Page code may skip
  its own pointer easing only. Source: `AGENTS.md`, section 2.

## Material law

Laws for this bar: relief, shadow, iridescence. Source: spec, "Bar: foil card".

- **Relief and shadow:** the card has tone and a shadow on the page. It moves with the light.
- **Iridescence:** (a) colour at a fixed point changes when the light or tilt moves. (b) Under
  one directional key light, two points with the same tilt and groove show the same colour. (c)
  Colour does not change when only time passes. (d) Different grooves under the same light give
  different colours. Source: spec, "New law: iridescence".
- **Page pull.** The foil colour is pulled toward the page's colour ramp by a declared amount.
  Amount and target (nearest ramp stop, or the ground's hue) are set by eye at the look review.
  Source: spec, decisions table.

## Anti-goals

- **Painted-on rainbow.** Hue on a clock, or keyed to the pointer's x position with no light in
  it. Source: spec, "Anti-goals". The `pokemon-cards-css` colour is this kind of gradient, so
  do not copy how it makes colour, only how the pointer feels.
- **Hue soup.** Foil so saturated that the page palette is lost. The pull exists against this.
  Source: spec, "Anti-goals".
- **Sticker.** A flat card, no shadow, no tone change. Source: spec, "Anti-goals".
- Also: never dim the paint to pass a contrast or banding check. Source: `AGENTS.md`, section 2.

## Copy the mechanism, not the identity

Copy: grooves split light by angle, ink over foil with a white under-print, and the card's tone
and shadow. Do not copy any real card's layout, logo, characters, set symbols, frame, text or
colours. Colours come from the page's CSS custom properties through `fromPage`. Source:
`AGENTS.md`, section 2; spec, anti-goals.

## Numbers and sources

| Number | Value | Source |
|---|---|---|
| Groove spacing, grating film | 1.0 and 2.0 µm (1000 and 500 lines/mm) | cards file, item 3 |
| Groove spacing, CD | about 1.6 µm | cards file, item 4 |
| Groove spacing, real card foil | not in the sources (1-2 µm is an inference) | cards file, item 3 |
| Spec range for the bar | 1.0 to 2.0 µm | spec, "Grating material" |
| Orders summed | 1 to 7 (Stam's loop is fixed at 8) | prior-art file, item 4 |
| Visible light | about 0.4 to 0.7 µm (my note, used to flag Stam's text) | prior-art file, item 4 |
| Security hologram detail | 10 µm dot-matrix, 0.1 µm e-beam; tagged citation needed | cards file, item 3 |
| Foil thickness on a credit card | "a couple of microns" | cards file, item 5 |
| Pull amount and target | not in the sources; set at the look review | spec, decisions table |
| Pointer easing time | not in the sources | none |
| Card size, corner radius, shadow depth | not in the sources; builder choice, label in `notes.md` | none |

## Scope verdict

Engine parts this bar needs, all from the spec's wave 2: the tilt input, the grating (foil)
material, ink over foil, the spectrum helper with the page pull, and the iridescence law. Source:
spec, "Wave 2: foil".

Gaps in the sources: no primary source says how Pokemon patterns are made. No verified WebGL holo
demo was found (the search hit a captcha). Etched foil, which has no laminate and a grainy
metallic finish, is out of scope: it is a different material and is known from one community page
only. Source: cards file, items 1, 2 and `4-rendering-prior-art.md` item 5.
