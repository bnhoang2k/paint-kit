// relight: light behaves like light. Every law in `bar.laws` (or `__paint.laws()` without a bar) is tested on the
// page frozen at t = 2 and the page's seed. Lights move only through `moveLight(i, 0 | 1)`; a light is switched
// off with `setLight(i, { level: 0 })`, and every light is put back to its declared props after each law.
// Frames are taken with the page's text hidden, at the target's view (`viewOf`: the bar's `view`, else 960 x 600),
// dpr 1. Every law runs twice, on the page opened in the light and then the dark colour scheme
// (`prefers-color-scheme`), as banding-grain reads both: a palette can light its relief in one scheme and lose it in
// the other (bars 03, 05 and 06 did, Phase 2 Task 1). The line names the failing scheme first (`joinSchemes`), and
// every measured key carries its scheme, `relief.diff.light`, `relief.diff.dark`. `checkScheme` runs one scheme
// alone; detail uses it to read relight at detail 0 in the scheme it is reading.
//
// Laws:
// - relief: the first key light (else the first lamp) is moved between its two test positions, frames A and B; the
//   change relative to the page's own brightness must be above `relight.reliefDiff` (Phase 2 Task 2b, `reliefChange`):
//     change = (sum over pixels and R, G, B of |A - B|) / (sum over pixels and R, G, B of (A + B) / 2),
//   that is the frames' mean absolute RGB difference over their mean RGB brightness, both in 8-bit units, so the
//   ratio has no unit (0 when both frames are black). Shading scales with the colour it falls on, so the raw
//   difference of the same relief shrinks with a dark palette by about the ground's lightness (bar 03 dark: ground
//   OKLCH L 0.95 -> 0.23, raw difference 0.0347 -> 0.0091); the ratio does not. A key is preferred because it lights the
//   whole sheet's relief, where a lamp's moving pool changes the frame even on a flat sheet. Floor: the
//   `sheet()` height range must be above `relight.minRelief`, so a flat sheet cannot pass by having nothing to light.
//   Raw floor (Task 2b fix round 3, the owner: "Add a raw floor"): the raw change, mean absolute RGB difference / 255,
//   must also be above `relight.reliefRawFloor`. As the frames near black the ratio's denominator nears 0, so a tiny
//   change reads large: mud on a ground of OKLCH L 0.12 reads 0.0167 relative but 0.0008 raw
//   (test/faults/relight-mud-near-black). The pure verdict is `reliefVerdict`.
//   Measured too: `relief.rawDiff` (the old mean absolute difference over 255) and `relief.brightness` (the mean RGB
//   brightness over 255), for the record.
// - falloff: on the first lamp. Up to nine points on the sheet across the full-light part of its cone (where the
//   cone factor is exactly 1): along and across the aim, at up to 0.85 x (cone - soft) degrees off it. A point is
//   kept only when it is on the page and no pixel of its patch, lamp on or off, reaches the finish's highlight
//   knee (8-bit 231), where light can no longer be read back; when fewer than 4 are kept, the lamp is dimmed by
//   halves (at most to 0.25 x its level) for the fit, since the law is about shape, not level. At each kept point the
//   lamp's own diffuse light is the linear luminance with the lamp on, its specular term off (`specular: 0`; a gloss
//   lobe is not inverse square), minus with it off. Divided by the lambert factor of a flat sheet there (bulb height
//   / distance), what is left must fall as distance^-p. Points are ordered by distance from the bulb, and p is fitted
//   by least squares on log-log axes (points whose patch has any ink, or coverage under 1, in the sheet are left out
//   first: page text under the lamp darkens by its print, not by the light); it must be within
//   `relight.falloffSlack` of 2 (inverse square). The fit needs at least 4 kept points spanning ln(dmax / dmin) of at
//   least `relight.falloffSpan` (4) x the page's own fit rms (Phase 2 Task 3; it was one global span, 0.064): the rms
//   of the log residuals about the fitted line of the page's widest fit, the cone opened as below (the declared fit's
//   when the declared cone is already that wide). Measured: lights-overhead-nofalloff's declared cone (span 0.0217)
//   reads rms 0.0047 / 0.0052 / 0.0040 light and exponent -0.46 / 1.06 / -0.13; at seed 2 the exponent is off by about
//   1.2 (1.06 against the about -0.15 its wrap bias gives with no falloff), where 2 x 0.0052 / 0.0217 = 0.48 predicts
//   much less. So a narrow fit's own rms is not a safe noise measure, and the widest fit's is used.
//   Span by construction (check-fix (c)): a lamp straight above its aim with a narrow cone has all its full-light
//   points nearly equidistant from the bulb (lights-overhead.html: ln-distance 0.022 at cone 20, soft 6). When the
//   declared cone's kept samples span under `relight.falloffSpan` x the page's fit rms, the fit opens the lamp's
//   cone (and only the cone: same bulb, aim, level and falloff) so its outermost samples sit `WIDE_REACH` (45)
//   degrees off the aim; for an overhead lamp that spans ln(1 / cos 45) = 0.347. Rejected: comparing two lamp
//   heights, because a lamp's `level` is defined at its aim point (the shader scales by aim distance^2 / distance^2),
//   so the aim reads the same at any height, with or without falloff; and sampling the declared pool radially, which
//   is the 0.022 span again. If the opened cone's points still do not span enough (off the page, under the knee or
//   over ink), the law is partial ("the lamp's geometry cannot resolve its falloff").
//   The slot rule (Phase 2 Task 2d): inverse-square falloff compares like surface with like surface, and a material
//   of a different albedo is not distance. So the fit also leaves out every point whose patch has a texel on a
//   material slot other than the pool's slot (`poolSlot`): of the fully covered sheet texels on the page whose
//   centre, seen from the bulb, lies within (cone - soft) degrees of the declared aim, the slot with the most
//   texels (a tie goes to the lower slot). The pool's slot is read once, from the declared cone, and holds for the
//   opened fit too. A page with one material has every covered texel on slot 0, so the rule leaves out nothing there.
//   Points on another slot are counted apart from ink ("n on a material slot other than the pool's slot s").
//   The lamp must also light its aim point (encoded luminance gain above `relight.ambientBand`), still light its
//   new aim after `moveLight(i, 1)` (a painted pool stays behind), and at 1.5 x the cone angle match the lamp-off
//   frame within `relight.ambientBand`. That point is the first of `OUTSIDE_AZIMUTHS` on the 1.5 x cone ring that
//   lands on the page: the four turns along and across the aim first, in the order the probe always used (along
//   away from the foot, along toward it, across right, across left), then the rest of the ring every 15 degrees
//   (Phase 2 Task 2d: core.html's dark lamp has all four turns off the page, but its ring crosses the upper left).
//   A page an old turn reached keeps that point. When no ring point lands on the page, the law is partial.
// - highlight: every other light is switched off, then the key light is moved between its test positions. Two
//   conditions, both required, each read along the light's screen motion:
//   (a) the specular shift. At each position the highlight alone is read as the frame with the key's specular term
//   on minus the frame with it off (`setLight(i, { specular: 0 })`): the centroid of that difference (linear
//   luminance, positive part, weighted) must move by at least `relight.highlightShift` px. Diffuse shading is in
//   both frames and cancels, so a domed shape lit without gloss gives no difference (cloth-gloss-off), and a lobe
//   that ignores the light's motion gives no shift (cloth-spec-frozen). Each material that declares the law
//   (`__paint.materials()`, by slot) must also show a specular term in its own slot at both positions, or the law
//   fails for it: otherwise one real gloss on the page (cloth.html's denim) would carry a material whose highlight
//   is painted on (the zipper of cloth-sheen-static). A declaring material with no pixels on the frame cannot be
//   read, so the law is partial for it, not failed. The shift is read on the whole frame, not per material: on a
//   random drape no fold is nearer the light than another, so a cloth's own highlight has no direction to move in
//   (cloth.html's denim alone: -3.2 to 10.2 px over seeds 1 to 3), while a convex carrier's does (its zipper alone:
//   19.8 to 21.1 px).
//   (b) the brightest-1% shift, per material slot (Phase 2 Task 3). For each material that declares the law, its own
//   specular centroid (as in (a), on its slot) and the centroid of the brightest 1% of its slot's fully covered pixels
//   in the key-only frame (specular on) are read at both positions. (b) is judged in the declaring slot whose own
//   specular highlight moves farthest along the light: its brightest 1% must move by at least `relight.brightShift`
//   px. There the gloss has the clearest direction, so a brightest part that stays put is painted on. Fully covered
//   means sheet coverage at least `relight.fullCoverage` (frame pixels map to sheet texels as the slots do): the bare
//   ground (coverage 0) is drawn unlit and cannot carry a highlight, an edge pixel mixes the ground in, and a ground
//   brighter than the lit surface would tie at the top and stand still (bar 06, test/pages/islands.html). With no
//   declaring slot that reads both centroids at both positions, (b) cannot be read and the law is partial.
//   Why per slot: a highlight painted into the colour is the same in both frames of (a) and cancels there, so real
//   gloss elsewhere carries a static painted streak past (a) (cloth-painted-streak). On the whole frame the brightest
//   1% mixes the static streak with the moving real gloss and diffuse shading, which dilute its shift by seed
//   (3.7 / 6.5 / 7.6 px light, seeds 1 / 2 / 3), so the old whole-frame (b) caught it at seed 1 only. In its own slot
//   the streak leads: -9.7 to 6.9 px over seeds 1 to 3, light and dark, against cloth.html's sheen 13.4 to 24.3. Why
//   not every declaring slot: a random drape's brightest 1% jumps between its folds (cloth.html's denim -22.9 to
//   32.4 px; bar 02's tape -49.2 to 192.6), whatever its gloss does. The whole frame's shift is still measured
//   (`highlight.brightShift.frame`), for the record. A streak painted on a slot that is not the most directional
//   gloss on the page passes (b). (b) alone passed cloth.html with all gloss off, as it tracked the domed band's
//   diffuse shading, so neither condition replaces the other.
//   The 1% share is the spec's own measure for the highlight law ("the centroid of the brightest 1% of the surface's
//   pixels"), not derived from any page; here it is 1% of one slot's fully covered pixels.
// - tint: on the first light that declares tint (a glow, or an ember read by its `region`: Light.region), inside 0.6 x its radius, the mean OKLab hue with the glow on must be nearer the
//   glow's hue (its ramp positions, from the page's tokens; partial when a token is unset) than with it off, and the chroma must rise. Beyond
//   1.2 x its radius the frames must match: mean absolute difference within `relight.ambientBand`. With no pixel
//   beyond 1.2 x the radius (a circle that holds a front across the whole frame) the law is partial: it cannot judge
//   the fade.
// - caustic: on the first light through water (`throughWater`). The caustic alone is read as the frame with the
//   light's caustic on over the frame with it off (`setLight(i, { caustic: 0 })`: the same light through still
//   water), minus 1, in linear luminance, so the floor's own picture cancels (light on a tone of the picture scales
//   both frames alike) and a caustic painted into the picture reads as nothing. It is read at one exposure that
//   leaves it the pure light concentration c - 1 (caustic fix, 2026-11-14): every other light at level 0 (with any
//   ambient, on / off is k(c - 1) / (a + k) + 1, which moves with the page's light split), the finish's grain at 0
//   (it is added to OKLab lightness, so it does not scale with the light), and the light through water halved from
//   its declared level (at most CAUSTIC_DIMS times) until the finish's knee (KNEE_8BIT, the falloff law's rule)
//   cannot change what the law reads: a clipped line core reads flat, and the brightest 5% then follow the
//   floor's grain and joints instead of the light. The guard judges only the pixels the law reads (`kneeBiases`,
//   Phase 2 Task 4): it halves while a read pixel reaches the knee in its caustic-off frame, or in a caustic-on frame
//   with its c - 1 at or under that frame's cut. The knee only lowers an on frame, so a read pixel clipped above the
//   cut stays above it and the cut and the brightest 5% are exact; a clipped pixel the law does not read (not water,
//   or too dark to divide by) changes nothing. Until Task 4 any clipped water pixel halved the whole read, so bar 05's
//   bright card frame in dark (32 px at the bottom edge) dropped its dark floor under CAUSTIC_DARK. Pixels whose caustic-off frame is under CAUSTIC_DARK linear
//   luminance are left out (a ratio over near-black is noise). "Inside the water" is the pixels whose sheet slot is a
//   `water` material (the whole frame when no material is water). It is read at t = 2 and t = 2.5 (`setTime`). Two
//   conditions, both required:
//   (a) the lines move: the brightest 5% of the water's pixels at the two times overlap (intersection over union)
//   under `relight.causticOverlap`. A static caustic (one baked once: the water-static-caustics fault) lights the
//   same pixels in both frames however much the surface moves.
//   (b) the lines are thin: in each frame the concentration, the cut of c - 1 at the brightest 5%, is at least
//   `relight.causticConcentration`. Light is conserved, so 5% of the floor that gets 1 + cut times still water's
//   light is a set of concentrated lines; a soft pool (a floor far nearer than the waves' focus) spreads the same
//   light, and its brightest 5% sit near still water's. This replaced a mean line width (area over skeleton length),
//   which moved with exposure (clipped speckle read thin) and, read unclipped, could not tell soft pools from lines
//   (the 5% mask's width is set by how many cells the net has, not by how sharp they are).
//   A light that adds no caustic at all (the frames on and off are the same) fails both.
// - transmit: on every light behind the sheet (a light whose props say `behind: true`; none fails the law, as the
//   glass is then lit from the front only). Until the checks-scope round (2026-11-15) it read only the first light
//   behind, so a second light behind (bar 06's wash) counted as "not from behind" in (a), and a second light behind
//   that spilled or stood still went unread in (c) and (b). "The glass" is the pixels whose sheet slot is a material
//   declaring the law, with coverage above 0 (frame pixels map to sheet texels as for highlight). Four conditions,
//   all required:
//   (a) lit mainly from behind: with every light as declared, over the brightest 5% (by linear luminance) of the
//   fully covered glass pixels (coverage at least `relight.fullCoverage`), the lights behind's share of their light,
//   (on - off) / on in linear luminance with EVERY light behind at level 0 together for "off", averaged, must be at
//   least `relight.transmitShare`. Their joint contribution, not the strongest one's: the law asks whether the
//   glass is lit mainly from behind, and every light behind is behind. Turned off together, not summed one by one:
//   the finish's shoulder is not additive, so two lights that each clip a tile alone would each read a share near 0.
//   A glass that ignores the light behind and is lit from the front reads 0 (glass-front-lit).
//   (b) the glow moves, for each light behind in turn: every other light at level 0, that light is moved between its
//   test positions, and the brightest 5% of the glass pixels by its gain (linear luminance on minus off) at the two
//   positions must overlap (intersection over union) under `relight.transmitOverlap`. Each light, not the first: a
//   light behind whose glow stands still is the fault whichever slot it sits in (glass-glow-static-second). It is
//   read below the knee, as the caustic is: the light is halved from its declared level (at most TRANSMIT_DIMS times)
//   until no fully covered glass pixel reaches KNEE_8BIT (an edge pixel mixes in the ground, which on a light page is
//   over the knee unlit), since clipped tiles tie at white and their set cannot show where the light went. A glow
//   drawn at a fixed place lights the same pixels at both (glass-glow-static); one that adds nothing to the glass
//   fails. `transmit.overlap` and `transmit.level` are the worst over the lights (largest overlap, lowest level);
//   each light's are `transmit.overlap.<i>` and `transmit.level.<i>`.
//   (c) the ground stays unlit: with every light as declared, then every light behind at level 0 together, the
//   pixels outside the glass (coverage 0, or another material's slot) must change by at most `relight.ambientBand`
//   (mean absolute 8-bit difference, 0..1), as the tint law's "beyond the radius". The mean is taken for each light
//   behind inside its OWN radius of its centre (the whole frame when it has no `at` and `radius`; a moving glow's
//   `at` is its centre at the frozen time, as `__paint.lights()` reports it), and the largest decides. Per light,
//   not over the union of the circles (checks fix round 1, 2026-11-15; the checks-scope round's union let a wide
//   light's circle dilute a small light's spill: glass-spill-small passed it at 0.00475). With one light behind this
//   is the law as it was. The engine routes a light behind only through materials that pass it, so this reads 0 on
//   an honest page; a surface between the tiles that passes the light (glass-spill; glass-spill-second, where only
//   the second light's radius holds it; glass-spill-small, where only the first, small light's does) does not.
//   `transmit.outside` is the largest; each light's is `transmit.outside.<i>`.
//   (d) the tiles vary (checks fix round 2, 2026-11-15, the owner's ruling "Add a tile-variation rule now": lit glass
//   tiles must vary in brightness, some blown to white and others dimmer). The tiles are the 4-connected components
//   of the fully covered glass pixels that do not touch the frame's border and hold the 9 x 9 patch about their
//   centroid (`tileFaces`). Each tile has two faces over that patch, so rims and grain do not decide it: its luma
//   face, the mean encoded Rec. 709 luma (the bar 06 report's method), and its white face, the mean of each pixel's
//   dimmest channel (encoded, 0..1): white is every channel at white. Not the brightest channel, as the knee tests
//   here read a pixel: that reads "clipped", and a pale tinted tile clips its main channel under a wash alone
//   (glimmer-no-swell-drift reads 0.991 to 0.995 on it, bar 06 0.993 to 0.995; checks fix round 3, correction 1).
//   Coloured glass blown only in its main channel therefore fails (d1), as the ruling says "white". With n tiles, top the brightest luma
//   face and low the lower-quartile luma face (dimmest first, index floor(0.25 (n - 1))): (d1) some tile is blown to
//   white, its white face at least TILE_WHITE (252 / 255, within 3 levels of 255; why at the constant), and (d2)
//   top - low is at least `relight.tileSpread`. The lower quartile, not the median (the reference's own tile median
//   is 1.000 at one frame) nor the dimmest (one odd tile would pass a flat page): at least a quarter of the tiles
//   clearly dimmer. (d) is read at TILE_MOMENTS (t = 1, 2, 3), each on the frame at the declared lights and the glass
//   read at that time, and passes when one moment meets (d1) and (d2) together; one moment's white tile is never
//   paired with another moment's spread (checks fix round 3, review-checks-fix2 Minor 4: a drifting swell between
//   tiles at t = 2 is over one a second later). Under MIN_TILES (5) tiles at a moment, that moment cannot judge, as
//   the lower quartile is then the dimmest; when no moment reads 5 tiles the law is partial, named "too few tiles
//   to judge variation", never a pass (checks fix round 3, review-checks-fix2 I2: a mosaic whose joints are fully
//   covered reads as one tile). Faults: glimmer-flat-bright-drift (flat, drifting; passed every check on 8b6c77c),
//   glimmer-no-swell-drift (bar 06 with no swell: varied, but no tile reaches white; passed (d) on 799f2f2, when (d1)
//   was the knee, 231). `transmit.tiles`, `.tileWhite`, `.tileTop`, `.tileLow`, `.tileSpread` and `.tileT` are the
//   deciding moment's (the one that meets (d), else the nearest to it); `transmit.<key>.t<t>` each moment's.
//   Measured too: transmit.peak, the brightest glass pixel's encoded luminance at the declared levels (0..1): a
//   strongly backlit tile reaches near-white through the finish's shoulder, not through a colour literal.
// - shadow (Phase 2 Task 7): on the light that casts (the one whose props have a `shadow`; none is partial, as there
//   is no shadow to read). Moving the light moves the shadow the other way; a raised surface darkens what lies under
//   it on the far side; no shadow where nothing is raised. At each of the light's two test positions the frame is
//   taken with the shadow on and with `setLight(i, { shadow: null })` (the same light, no shadow), every other light as
//   declared. The shadow mask is the pixels darker with it on by more than `relight.shadowDark`, read as the relative
//   darkening (off - on) / off in linear luminance, so a dark palette's shadow reads as deep as a light one's
//   (`shadowMask`; its deepest darkening is `shadow.depth.<k>`). Everything else is the same in both frames, so it
//   reads 0 there. The sheet's own height says where a shadow should be: `shadowOracle` marches the sheet (read at its
//   full resolution, in the page) toward the light exactly as the shading pass does (shade.ts SHADOW_MARCH), with a
//   hard edge, and gives the share of the frame its height blocks (`shadow.predicted.<k>`) and the raised region: the
//   texels above the middle of the sheet's height range. A bare-ground texel (coverage 0) receives the shadow only
//   when the light's `shadow.ground` is on, as the shading pass draws it; otherwise it is never in the predicted
//   share (it still blocks by its height). The verdict (`shadowVerdict`):
//   Floor: a sheet whose height range (`sheet()`, as the relief law reads it) is at or under `relight.minRelief` is
//   flat. Its mask share must be under `relight.shadowNone` at both positions, else the law fails (a shadow where
//   nothing is raised); under it, the law is partial (nothing is raised, so there is nothing to judge). A raised sheet
//   whose height blocks the light over less than `relight.shadowNone` of the frame at both positions (a gentle warp
//   under a high lamp) is judged the same way. Blocked at one position only: partial.
//   Otherwise, at both positions, the mask must cover at least `relight.shadowNone` of the frame (else the light casts
//   no shadow where its height blocks it), and:
//   (a) its centroid sits on the far side of the raised region's centroid from the light: the signed distance along
//   the screen direction away from the light (a key: its direction's x and y, screen y down; a lamp: from its foot,
//   the page point under the bulb, through the raised centroid) is above 0 (`shadow.side.<k>`, px);
//   (b) between the positions it moves against the light's screen move (a key: its direction's change; a lamp: its
//   foot's) by at least `relight.shadowShift` px (`shadow.shift`). A shadow painted into the colour, or held where
//   the light was declared, stays put; one cast on the light's side moves with it.
// - iridescence (Phase 2 Task 14): foil colour comes from the light and the view, never from the clock, the pointer
//   or the place on the page. On the first key light (none is partial: a lamp gives each point its own light
//   direction, so the colour of one groove would sweep in bands, as it should). The foil pixels are the frame pixels
//   whose sheet texel (mapped as the highlight law maps them) sits on a slot whose material declares the law
//   (`__paint.materials()`), with coverage at least `relight.fullCoverage` and no ink (ink covers the foil:
//   materials.foil); none on the frame is partial. Colours are compared in the OKLab chroma plane, a and b, lightness
//   left out (`chromaDistance`, Task 14 fix round 1): a grating's colour is hue and chroma, and a groove-aware white
//   highlight (a band flattened to its luminance, or an anisotropic metal brushed along the grooves) moves and differs
//   between grooves in lightness alone; read in full OKLab it passed (a) and (d) (test/faults/iridescence-white).
//   The texels are grouped in the page (`foilTexels`), twice. For (d), by groove direction (the direction image's
//   angle as a line, 0 to 180, in GROOVE_BIN = 5 degree bins: the spec's "within 5 degrees"; no direction image runs
//   every groove along +x, as the shade pass does), groove share (the direction's length, in 0.1 bins) and normal (its
//   tilt about each sheet axis, NORMAL_BIN = 2 degree bins). For (b) and (e), by groove, share and the grating's
//   u = |X.(l + v)| in GRATING_U_BIN = 0.0025 bins (5 nm of first order at 2.0 um), computed in check code from the
//   grating equation and the frame's own geometry, never from the engine's grating code: 2 degrees of normal moves a
//   grating's first order about 50 nm, so "same tilt" is read as same u. Five conditions, all required:
//   (a) the colour moves with the light and the view, per point (the owner: "Per-point change"): every other light as
//   declared and the tilt held at [0, 0], the key moved between its test positions moves the foil pixels' colour by
//   more than `relight.iridescenceShift` (`iridescence.light`), read as the mean over the foil pixels of each pixel's
//   own chroma distance between the two frames (`pointChromaShift`); and on a page that tilts
//   (`__paint.tiltOptions()`, max above 0), `setTilt([max / 2, 0])` against [0, 0] with nothing else moved does too
//   (`iridescence.tilt`). Per point, not the change of the mean: a sunburst whose wedges trade colours keeps its mean.
//   A page with no tilt has no tilt to move: the tilt is not read and the line says so. A rainbow painted from the
//   pointer's x has no light in it and stands still under both (test/faults/iridescence-pointer-x); a grating that
//   holds the key's direction (engine fault spec-fixed-light, test/faults/iridescence-fixed-light) stands still under
//   the key move; one whose surface stays unturned (engine fault tilt-surface-fixed,
//   test/faults/iridescence-fixed-surface) stands still under the tilt. One 8-bit step is 0.0011 to 0.0023 in OKLab chroma per pixel (greys 40, 128, 220),
//   and the dither is spatial only (finish.ts takes it from fragCoord), so a fault's reading never falls below that
//   floor where its colour moves at all; no pixel is blurred or averaged before the reading.
//   (c) the colour holds when only time passes: the frame at t = 3 against t = 2, the foil pixels' mean absolute
//   8-bit difference (0..1) under `relight.ambientBand` (`iridescence.time`), judged only on foil pixels whose
//   surface held. Nothing else may move: the sheet is read at t and again at t + 1 (`sheetHeld`), and only foil
//   pixels whose texel, and every texel within HELD_REACH (3) of it that its normal and its sample read, kept its
//   height, direction, coverage, slot and ink count (`iridescence.still`, their share).
//   Foil on a drifting sheet changes because its surface moved, which is real light; where every foil texel moved,
//   (c) cannot be read and the law is partial ("the surface moves with the clock", test/pages/foil-drift.html). A
//   light that moves with the clock is held still the same way: restore() sets each light to the props
//   `__paint.lights()` read at t, so a light whose place is a function of time (a moving glow's `at`) stands at its
//   place at t for (c); a light through water draws its caustic from the clock in its own shader, so (c) reads it
//   through still water (`caustic: 0`, the caustic law's switch). A hue cycled on the clock on a still sheet moves
//   (test/faults/iridescence-clock).
//   (b), (d) and (e) are read under the key alone (every other light at level 0) at detail 0 (`__paint.setDetail(0)`,
//   the dial put back from `__paint.detail()` after): the film grain (materials.foil FOIL_GRAIN) tilts the engine's
//   normal at detail above 0 and is not in the sheet's height, so the law's u could not see it. They read region
//   means: the finish's grain tips each pixel a little, zero-mean, so per-pixel colours of one group scatter where
//   region means agree. Assumption: one view direction for the whole frame (orthographic: the eye at +z), as the shade
//   pass draws it. A tilt turns the surface, not the eye (Task 16): the normal and the grooves turn by the tilt
//   (`turnOfTilt`) and v stays +z. The law reads (b), (d) and (e) with the tilt held at [0, 0] (the turn is then the
//   identity), so their readings do not depend on it.
//   (b) one groove and u, one colour: in each (b) group of at least GROOVE_MIN_PX (400) pixels, split once at its
//   median column and once at its median row, the halves' mean colours differ by less than
//   `relight.iridescenceMatch`; the worst group decides (`iridescence.match`, its groove `.match.groove`, u
//   `.match.u`, size `.match.px`). Under a directional key and an orthographic view a grating's wavelengths are a
//   function of groove spacing and u alone, so the halves agree; a colour keyed to the place on the page does not
//   (test/faults/iridescence-place-hue: a wavelength ramp across the canvas, 20 nm between one group's
//   half-centres). Honest curved foil reads a little here (the lobe and the diffuse light scale chroma inside one u
//   contour). No group that size is partial.
//   (d) different grooves, different colours: the largest grooved group (share above 0) of at least GROOVE_MIN_PX
//   pixels and the largest such group with the same normal and share whose groove runs at least GROOVE_APART (30, the
//   plan's value) degrees from it must differ in mean colour by more than `relight.iridescenceApart`
//   (`iridescence.apart`, `.apart.angle`). The same normal and share, so only the groove differs between them. The
//   angle is taken between 5-degree bin centres, so the true cut lies about 25 to 35 degrees; "at least", as on bin
//   centres "more than 30" would mean 35 or more, a boundary the plan never set. Foil that ignores the groove reads
//   one colour (test/faults/iridescence-no-groove); a white highlight differs in lightness only
//   (test/faults/iridescence-white). No such pair (a single groove direction) is partial.
//   (e) ours, not the spec's, the converse of (b) (Task 14 fix round 3; (b) alone passes a grating that ignores the
//   surface): within one groove, far-apart u gives different colour. In each groove region (groove bin and share
//   above 0), the most-populated (b) group of at least GROOVE_MIN_PX pixels against the most-populated one at least
//   U_SPAN (0.02 in u: 20 nm of first order at 1.0 um) from it; their mean colours differ by more than
//   `relight.iridescenceSpread`, and the weakest region decides (`uSpread`; `iridescence.spread`, `.spread.du`). A
//   grating whose frame ignores the surface normal reads one colour across a curve
//   (test/faults/iridescence-flat-normal on foil-drift's copy, -flat-normal-foil on foil.html's bevelled rim). Where no
//   groove spans U_SPAN (a flat foil under a directional key has one u per groove), (e) is not read, the line says
//   "(e) not read: no groove spans 0.02 in u" (`E_NOT_READ`) and the verdict comes from (a) to (d). (e) can fail
//   honest foil where both bins show no grating colour (the lobe under 1e-5, or every order outside 380 to 780 nm).
//   Known gap, logged (no fault row claims it): a grating that ignores its declared spacing (a constant in place of
//   the material's spacing) keeps its colour a function of u, so it passes (a) to (e) by design (round 2 scratch on
//   foil-drift, light seed 1: (a) 0.024, (b) 0.0162, (d) 0.101, mean form). The fix is a wavelength oracle: d x u
//   through the CIE 1931 table, against the spacing `__paint.materials()` declares; a later phase.
//   The tilt is handed back to the pointer (`setTilt(null)`) after the law; restore() puts the lights back.
//   The film branch (Phase 2 Task 18, task-18-law-design.md): a material with `film` in `__paint.materials()` is read here
//   and never as foil. A page with both reads both, and the worse status decides (`iridescenceJoin`). A film's colour is
//   set by its optical path difference (OPD), OPD = 2 ior d cos(theta_t), read at the half vector: with the eye at +z only
//   the key's angle off the eye enters. So a key that turns off the eye shifts the hue a little. A key that swings about
//   the view axis holds it, and a tilt does not shift film hue: a tilt turns the normal, so the highlight moves and the
//   hue holds. Under one key, one thickness shows one hue across a curve. The law bins the film by slot and OPD at the
//   key's declared place (FILM_OPD_BIN, 5 nm) and reads the key's highlight alone (specular on minus specular off, in
//   linear light, at detail 0 and grain 0) as a tint, (a / L, b / L) in OKLab, so the lobe's brightness does not read as
//   colour. A turn of FILM_KEY_TURN (30 degrees, builder) gives the second key position. Five conditions:
//   (a) the key's turn, and a tilt of half the page's max, each change the film's colour per point by more than
//   `relight.filmShift` (`pointChromaShift`; `iridescence.film.key`, `.tilt`). The tilt reading sees the highlight move, so
//   it proves that the surface turns, not that the hue moved.
//   (b) equal thickness and equal angle give equal colour, wherever the film is. Each counted bin is split once at its
//   median column, row and n.v, and each half keeps its mean OPD at A. A 5 nm bin holds a thickness gradient, so its
//   halves can differ in mean OPD (on a ramp that runs one way, its row halves do: Task 18c read that as a mismatch).
//   So each split reads | (tint(h1) - tint(h2)) - (f(OPD(h1)) - f(OPD(h2))) |, its colour difference less what the
//   film's own ramp gives for its thickness difference (Task 18e, task-18e-b-design.md). f is the bin's curve
//   (`filmCurve`): the parabola through three neighbouring counted bins of its slot (the bin and both neighbours, else
//   the bin and the two on its one counted side), never across a gap of uncounted bins. A bin with no such curve is not
//   read. The worst split of the worst bin is under `relight.filmMatch` (`iridescence.film.match`). The n.v split
//   catches a film that reads n.v. Known gaps, logged: a film whose counted bins lie only in runs of fewer than 3
//   neighbouring bins (separate uniform patches, say) has no curve and leaves (b) unread. An error that is a smooth function of thickness alone looks like a
//   different ramp, and the correction absorbs the part of a place error that runs along the ramp's own direction on
//   the page; it enters the curve with the bin's own weight at a gap's edge. (d), (e) and film.test.ts's band-order
//   row, not (b), catch those. The half's OPD is a pixel mean while its tint is of the summed highlight, so where the
//   lobe's brightness varies inside a half the two weigh it differently (at most 0.1 of the limit on the pages read).
//   (c) only time passing changes nothing: as foil's (c), under `relight.ambientBand`, on film whose sheet held, `param`
//   included (`iridescence.film.time`, `.still`). Film whose surface or thickness moves everywhere is partial.
//   (d) different thickness shows different colour: the mean tint distance to the bin about 275 nm further along in OPD
//   (at most half the slot's span) is over `relight.filmApart` (`iridescence.film.apart`).
//   (e) ours, the converse of (b): turning the key acts as a move along the film's own thickness ramp. The ratio of how
//   far each bin lands from the ramp's colour at its new OPD, over how far it would land had its colour not moved, is
//   under `relight.filmSpread` (`iridescence.film.spread`): near 0 for an honest film, 1 for a film that ignores the angle.
//   The ramp's colour is read only between two neighbouring counted bins: a bin whose new OPD falls in a gap of uncounted
//   bins is not read, as the ramp never measured a colour there.
//   (e) is read only when the page's own (b) reading over (e)'s denominator is under `relight.filmSpread`, so noise alone
//   cannot reach the limit. Otherwise the line says FILM_E_NOT_READ and the verdict comes from (a) to (d).
//   Known gaps, logged (no row claims them): a film that ignores its `ior` or `range` passes (a) to (e), and needs a later
//   wavelength oracle. Where (e) is not read, a film that ignores the angle passes. A reversed range passes the law, and
//   only film.test.ts's band-order row catches it. A page that drifts only part of its film passes (c) on the part that
//   holds. The steel page counts no bin from about 39 to 47 nm of oxide (OPD 180 to 220 nm), each under FILM_SPEC_MIN at
//   the key's two positions, so (b), (d) and (e) say nothing there.
// - burn (Phase 2 Task 21): a burning sheet (`fields.burn`, paper scorch, `lights.ember`). The page is frozen at five
//   times across the bar's `alive` window (t0 + k (t1 - t0) / 4), else t 1 to 5 (`burnTimes`). Three parts:
//   (a) the front only advances: the burned share (`__paint.sheet()` grid cells with coverage under 0.5) never drops
//   between neighbouring times by more than `relight.burnJitter` (`shareDrop`; `burn.jitter`). A share that holds at
//   every time is partial: the front did not move, so there is nothing to judge.
//   (b) paper the front passes darkens: the same pixels at a time their sheet texel has param 0 at full coverage
//   (`relight.fullCoverage`) and at the next time, when it has param in (0, 0.5) at full coverage, with the ember at
//   level 0 in both frames. The mean per-pixel drop of relative luminance (linear Y, 0..1) must be over
//   `relight.scorchDrop` (`scorchReading`; `burn.scorchDrop`, `burn.scorchPx`). Same pixels, so neither place nor the
//   ember's light stands in for scorch. Under BURN_MIN_PX such pixels is partial.
//   (c) the ember tints by distance from the front: per pixel, ember on against off, on paper ahead of the front only
//   (param 0, full coverage). Distance is Euclidean on the sheet, in short-side units, to the nearest texel the burn
//   has reached: param above 0 (`frontDistance`). Ground and holes are not the front, so a card's edges on the page's
//   ground are not read as one. Within 0.6 x the ember's `reach` the mean warmth gain (the OKLab (a, b) change
//   projected on the ember's own hue, `lightAb`) must be above 0; beyond 1.2 x reach the frames must match within
//   `relight.ambientBand` (mean absolute 8-bit RGB difference / 255), the tint law's own limits read by distance from
//   a line source instead of a circle. And the light fades out to reach: the mean added relative luminance (on minus
//   off) in the outer quarter of reach [0.75, 1) over that in the inner quarter [0, 0.25) must be under
//   `relight.emberFade` (`emberReading`; `burn.ember.fade`), and the inner quarter must gain light. The fade is read on
//   light, not warmth: warmth rises away from the front, as paper reaches the finish's knee (burn.html light: 94-97% of
//   paper at 8-bit 231 with the ember off) and as the ember's colour cools from core to the more saturated edge.
//   Fewer than BURN_MIN_PX pixels near, beyond or in either quarter is partial, never a pass; a page with no ember
//   light reads (c) partial. Pixels of all five times are pooled.
//   Known gaps: (a) passes a retreat under relight.burnJitter (0.073 of the grid, F / 2 of the retreat fault, as the
//   gap rule gives when honest pages read 0); (b) is an absolute drop set by the dark scheme, so a light-scheme scorch
//   at a few percent of its strength passes; no light or material declares burn, so a page lists it in bar.json.
//   Planted faults: test/faults/burn-retreat (a), burn-clean-wipe (b), burn-glow-dark, burn-glow-flat and
//   burn-glow-step (c). Honest pages: test/pages/burn.html, its ?from=point and its ?card=1 (a card on the ground).
import { emberColour } from "../engine/lights/ember.js";
import { lampRingPoint, lampSheetPoint, pageToSheet } from "../engine/lights/lamp.js";
import { buildRamp, linearToOklab, linearToOklch, mixOklab, parseCssColor } from "../engine/palette.js";
import { SHADOW_MARCH } from "../engine/shade.js";
import { hasHook, hideText, open, round } from "./frames.js";
import { luminance, srgbToOklab } from "./image.js";
import { threshold } from "./threshold.js";
import { joinSchemes, SCHEMES } from "./types.js";
const NAME = "relight";
const T = 2;
/** Half-size of a sampled patch, px: a 15 x 15 mean averages out grain and dither. */
const PATCH = 7;
/** The finish's highlight knee (linear 0.8) in 8-bit sRGB: 231. A patch touching it cannot be read as linear light. */
const KNEE_8BIT = 231;
/** Falloff needs at least this many usable samples for its fit. */
const MIN_SAMPLES = 4;
/**
 * Degrees off the aim of the outermost falloff samples when the declared cone is too narrow to resolve the falloff:
 * a flat sheet there gets lambert cos 45 = 0.71, so matte's wrap (0.15) biases the fitted exponent by about
 * -0.15 / (0.71 + 0.15) = -0.17 at most, and for a lamp straight above its aim the samples span ln(1 / cos 45) = 0.347.
 */
const WIDE_REACH = 45;
const srgbToLinear = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
/** Mean of `f(pixel offset)` over a square patch around a page-fraction point. */
function patch(fr, [fx, fy], f) {
    const cx = Math.round(fx * fr.w);
    const cy = Math.round(fy * fr.h);
    let s = 0;
    let n = 0;
    for (let y = cy - PATCH; y <= cy + PATCH; y++) {
        for (let x = cx - PATCH; x <= cx + PATCH; x++) {
            s += f((y * fr.w + x) * 4);
            n++;
        }
    }
    return s / n;
}
const encLum = (fr) => (o) => (0.2126 * fr.data[o] + 0.7152 * fr.data[o + 1] + 0.0722 * fr.data[o + 2]) / 255;
const linLum = (fr) => (o) => 0.2126 * srgbToLinear(fr.data[o]) + 0.7152 * srgbToLinear(fr.data[o + 1]) + 0.0722 * srgbToLinear(fr.data[o + 2]);
/** Least-squares slope of y on x. */
export function slope(x, y) {
    const n = x.length;
    const mx = x.reduce((a, b) => a + b, 0) / n;
    const my = y.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
        num += (x[i] - mx) * (y[i] - my);
        den += (x[i] - mx) ** 2;
    }
    return den === 0 ? NaN : num / den;
}
/**
 * The highlight's centroid [x, y] in px: the centroid of `on` minus `off` (linear luminance, positive part, as
 * weights), where the two frames differ only by a light's specular term. Null when the light adds no highlight.
 * `keep(pixel index)` limits it to some pixels (one material's slot).
 */
export function specularCentroid(on, off, keep) {
    const a = linLum(on);
    const b = linLum(off);
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (let y = 0; y < on.h; y++) {
        for (let x = 0; x < on.w; x++) {
            if (keep && !keep(y * on.w + x))
                continue;
            const o = (y * on.w + x) * 4;
            const d = a(o) - b(o);
            if (d <= 0)
                continue;
            sx += d * (x + 0.5);
            sy += d * (y + 0.5);
            sw += d;
        }
    }
    return sw > 0 ? [sx / sw, sy / sw] : null;
}
/**
 * Centroid [x, y] in px of the brightest `share` of the kept pixels (by luminance), ties included; all pixels when
 * `keep` is not given. The 1% default is the spec's (header, highlight (b)). Null when no pixel is kept.
 */
export function brightCentroid(lum, w, h, share = 0.01, keep) {
    const read = [];
    for (let p = 0; p < w * h; p++)
        if (!keep || keep(p))
            read.push(lum[p]);
    if (!read.length)
        return null;
    const sorted = Float32Array.from(read).sort();
    const cut = sorted[Math.max(0, Math.floor(sorted.length * (1 - share)))];
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const p = y * w + x;
            if ((!keep || keep(p)) && lum[p] >= cut) {
                sx += x + 0.5;
                sy += y + 0.5;
                n++;
            }
        }
    }
    return [sx / n, sy / n];
}
/** Shift of centroid `a` to `b` along the light's screen motion (its direction's x right, y up; screen y runs down). */
export function shiftAlong(a, b, d0, d1) {
    const mx = d1[0] - d0[0];
    const my = -(d1[1] - d0[1]);
    const ml = Math.hypot(mx, my) || 1;
    return ((b[0] - a[0]) * mx + (b[1] - a[1]) * my) / ml;
}
/** The highlight law's verdict: both conditions must pass; each failing one is named. */
export function highlightVerdict(r, minShift, minBright) {
    const problems = [];
    const measured = {};
    const [s0, s1] = r.specular;
    let facts = "";
    if (!s0 || !s1) {
        const where = !s0 && !s1 ? "at either test position" : `at test position ${s0 ? 1 : 0}`;
        problems.push(`the key puts no specular highlight on the frame ${where}: the frames with its specular term on and off are the same`);
        measured["highlight.shift"] = 0;
    }
    else {
        const shift = shiftAlong(s0, s1, r.dir[0], r.dir[1]);
        measured["highlight.shift"] = shift;
        facts = `the specular highlight's centroid moves ${round(shift, 1)} px`;
        if (shift < minShift)
            problems.push(`the specular highlight's centroid moves ${round(shift, 1)} px along the light's motion, under ${minShift}`);
    }
    if (r.dull.length && s0 && s1) {
        problems.push(`the key puts no specular highlight on ${r.dull.join(", ")}, which declares the highlight law: any highlight there is painted on`);
        measured["highlight.dull"] = r.dull.length;
    }
    measured["highlight.read"] = r.read;
    // (b) per material slot: each declaring material's own specular shift and brightest-1% shift. (b) is judged in the
    // slot whose own specular highlight moves farthest along the light: there the gloss has the clearest direction, so
    // a brightest part that stays put is painted on. A random drape's own gloss has no direction (cloth.html's denim:
    // -3.2 to 10.2 px), and the brightest 1% of a slot with many peaks jumps between them (its denim: -22.9 to 32.4 px).
    let judged;
    for (const sl of r.slots ?? []) {
        const [a0, a1] = sl.specular;
        const [c0, c1] = sl.bright;
        const shift = a0 && a1 ? shiftAlong(a0, a1, r.dir[0], r.dir[1]) : NaN;
        const bright = c0 && c1 ? shiftAlong(c0, c1, r.dir[0], r.dir[1]) : NaN;
        if (Number.isFinite(shift))
            measured[`highlight.shift.slot${sl.slot}`] = shift;
        if (Number.isFinite(bright))
            measured[`highlight.brightShift.slot${sl.slot}`] = bright;
        if (Number.isFinite(shift) && Number.isFinite(bright) && (!judged || shift > judged.shift))
            judged = { name: sl.name, slot: sl.slot, shift, bright };
    }
    const [b0, b1] = r.bright;
    if (b0 && b1)
        measured["highlight.brightShift.frame"] = shiftAlong(b0, b1, r.dir[0], r.dir[1]);
    if (judged) {
        measured["highlight.brightShift"] = judged.bright;
        measured["highlight.brightSlot"] = judged.slot;
        if (judged.bright < minBright)
            problems.push(`the brightest 1% of ${judged.name} moves ${round(judged.bright, 1)} px along the light's motion, under ${minBright}, while its own specular highlight moves ${round(judged.shift, 1)} px: its brightest part stays put, as a highlight painted into the colour does`);
    }
    if (problems.length)
        return { status: "fail", line: `highlight FAIL (${problems.join("; ")})`, measured };
    if (!judged)
        return { status: "partial", line: `highlight PARTIAL (no material that declares the highlight law has fully covered pixels and its own specular highlight at both test positions, so the brightest 1% of its slot cannot be read; ${facts})`, measured };
    const all = `${facts} and the brightest 1% of ${judged.name} ${round(judged.bright, 1)} px along the light's motion, where its own specular highlight moves ${round(judged.shift, 1)} px`;
    if (r.offFrame.length) {
        measured["highlight.offFrame"] = r.offFrame.length;
        return { status: "partial", line: `highlight PARTIAL (${r.offFrame.join(", ")} declares the highlight law but has no pixels on the frame, so its own highlight cannot be read; ${all})`, measured };
    }
    return { status: "pass", line: `highlight pass (${all})`, measured };
}
const hueOf = (a, b) => {
    const d = (Math.atan2(b, a) * 180) / Math.PI;
    return d < 0 ? d + 360 : d;
};
export const hueDistance = (p, q) => {
    const d = Math.abs(p - q) % 360;
    return d > 180 ? 360 - d : d;
};
/** The CPU twin of the GLSL `ramp(t)`: t 0..1 walks the 5 stops, mixed in OKLab. */
export function rampAt(stops, t) {
    const x = Math.min(1, Math.max(0, t)) * 4;
    const i = Math.min(Math.floor(x), 3);
    return mixOklab(stops[i], stops[i + 1], x - i);
}
const json = (v) => JSON.stringify(v);
const restore = async (c) => {
    for (const [i, l] of c.lights.entries())
        await c.h.hook(`__paint.setLight(${i}, ${json(l.props)})`);
};
const shot = (c) => c.h.shot();
const firstOf = (c, ids) => c.lights.findIndex((l) => ids.includes(l.id));
/** The two relief frames' mean absolute RGB difference and mean RGB brightness, each over 255 (0..1). */
function reliefSums(a, b) {
    let d = 0;
    let sum = 0;
    let n = 0;
    for (let p = 0; p < a.data.length; p += 4)
        for (let k = 0; k < 3; k++) {
            const x = a.data[p + k];
            const y = b.data[p + k];
            d += Math.abs(x - y);
            sum += (x + y) / 2;
            n++;
        }
    return n ? { raw: d / (n * 255), brightness: sum / (n * 255) } : { raw: 0, brightness: 0 };
}
/** The relief law's reading: the frames' mean absolute RGB difference over their mean RGB brightness (no unit; 0 when both are black). */
export function reliefChange(a, b) {
    const { raw, brightness } = reliefSums(a, b);
    return brightness > 0 ? raw / brightness : 0;
}
async function relief(c) {
    const key = firstOf(c, ["key"]);
    const i = key >= 0 ? key : firstOf(c, ["lamp"]);
    if (i < 0)
        return { status: "partial", line: "relief PARTIAL (no key or lamp light to move)", measured: {} };
    const sheet = await c.h.hook("__paint.sheet()");
    const range = Math.max(...sheet.height) - Math.min(...sheet.height);
    await c.h.hook(`__paint.moveLight(${i}, 0)`);
    const a = await shot(c);
    await c.h.hook(`__paint.moveLight(${i}, 1)`);
    const b = await shot(c);
    const diff = reliefChange(a, b);
    const { raw, brightness } = reliefSums(a, b);
    const lim = { diff: c.th("relight.reliefDiff"), raw: c.th("relight.reliefRawFloor"), range: c.th("relight.minRelief") };
    return reliefVerdict({ diff, raw, brightness, range }, lim, `${c.lights[i].id} ${i}`);
}
/** The relief law's verdict from its reading: height range over `range`, relative change over `diff`, raw change over `raw`. */
export function reliefVerdict(r, lim, mover = "the light") {
    const measured = { "relief.diff": r.diff, "relief.rawDiff": r.raw, "relief.brightness": r.brightness, "relief.heightRange": r.range };
    const facts = `moving ${mover} changes the frame by ${round(r.diff)} of its brightness (raw change ${round(r.raw, 5)}), sheet height range ${round(r.range, 5)}`;
    const problems = [];
    if (r.range <= lim.range)
        problems.push(`the sheet is flat: height range ${round(r.range, 5)}, at or under the floor ${lim.range}`);
    if (r.diff <= lim.diff)
        problems.push(`moving the light changes the frame by ${round(r.diff)}, at or under ${lim.diff} (mean RGB change ${round(r.raw)} over mean RGB brightness ${round(r.brightness)})`);
    if (r.raw <= lim.raw)
        problems.push(`raw change ${round(r.raw, 5)}, at or under the floor ${lim.raw}: the frames are so dark (mean RGB brightness ${round(r.brightness)}) that the relative change of ${round(r.diff)} is not shading`);
    return problems.length ? { status: "fail", line: `relief FAIL (${problems.join("; ")})`, measured } : { status: "pass", line: `relief pass (${facts})`, measured };
}
const onPage = (p, w, h) => p !== null && p[0] * w > PATCH + 2 && p[0] * w < w - PATCH - 2 && p[1] * h > PATCH + 2 && p[1] * h < h - PATCH - 2;
/** A patch is usable for falloff only when no pixel in it, on or off, reaches the finish's knee. */
function belowKnee(frames, p) {
    return frames.every((fr) => patch(fr, p, (o) => (Math.max(fr.data[o], fr.data[o + 1], fr.data[o + 2]) >= KNEE_8BIT ? 1 : 0)) === 0);
}
/**
 * The falloff law's span rule, per page: the page's noise is the rms of its widest fit's log residuals (`widest`; the
 * declared fit's when the widest has none). A narrow fit's own rms is not a safe noise measure: the overhead fault's
 * declared cone (span 0.0217, rms 0.0052 at seed 2) misses its exponent by about 1.2 where 2 x 0.0052 / 0.0217 = 0.48
 * predicts much less (header, falloff). The declared cone is read when its samples span at least `ratio` x that noise; else the
 * cone is opened (`open`). Either fit resolves the falloff only when its own span is at least `ratio` x `noise`.
 */
export function falloffPlan(declared, widest, ratio) {
    const noise = Number.isFinite(widest.rms) ? widest.rms : declared.rms;
    return { open: !(declared.span >= ratio * noise) && Number.isFinite(noise), noise };
}
/**
 * What the sheet under a sample patch is: "bare" surface (no ink, full coverage, every texel on `slot`), "ink" (any
 * ink, or coverage under 1) or "slot" (bare of ink, but some texel is on a material slot other than `slot`). Ink (page
 * text) under a lamp darkens a sample by its own albedo, not by the light, so an inked patch would corrupt the falloff
 * fit; a patch on another material is left out for the same reason (header, falloff: the slot rule). Ink is judged
 * first, so a patch with both counts as ink.
 */
async function sampleSheet(c, [fx, fy], slot) {
    const s = await c.h.hook(`(() => { const d = devicePixelRatio || 1, r = ${PATCH} / d; return __paint.sheetRegion(${fx} * innerWidth - r, ${fy} * innerHeight - r, 2 * r + 1 / d, 2 * r + 1 / d); })()`);
    if (!(s.ink.every((v) => v <= 0) && s.coverage.every((v) => v >= 1)))
        return "ink";
    return s.slot.every((v) => v === slot) ? "bare" : "slot";
}
/**
 * The falloff law's slot rule (Phase 2 Task 2d): the material slot the lamp's declared full-light pool mostly falls on.
 * Of the sheet texels (`grid`, the whole page, rows top down) that are fully covered (coverage at least 1, as a kept
 * sample must be) and whose centre, seen from the bulb, lies within `cone - soft` degrees of the lamp's aim, it is the
 * slot with the most texels; a tie goes to the lower slot. -1 when no texel qualifies. A texel's centre is
 * ((x + 0.5) / w, (y + 0.5) / h) in the page frame at z 0 (the sheet's own height is ignored, as in
 * `lampSheetPoint`). The falloff fit then leaves out every sample whose patch has a texel on any other slot.
 * Self-contained (no imports; it repeats `pageToSheet`'s scale), because the check runs its source in the page so the
 * whole sheet is not copied out to node (copying it made relight about 4 x slower on lights.html: 37.6 s, not 8.8 s).
 */
export function poolSlot(grid, lamp, aspect) {
    // pageToSheet: x right, y up, short-side units, centred.
    const [sx, sy] = aspect >= 1 ? [aspect, 1] : [1, 1 / aspect];
    const toSheet = (x, y, z) => [(x - 0.5) * sx, (0.5 - y) * sy, z];
    const L = toSheet(lamp.at[0], lamp.at[1], lamp.at[2]);
    const A = toSheet(lamp.aim[0], lamp.aim[1], lamp.aim[2]);
    const ax = [A[0] - L[0], A[1] - L[1], A[2] - L[2]];
    const al = Math.hypot(ax[0], ax[1], ax[2]) || 1;
    const cosFull = Math.cos(((lamp.cone - lamp.soft) * Math.PI) / 180);
    const count = new Map();
    for (let ty = 0; ty < grid.h; ty++)
        for (let tx = 0; tx < grid.w; tx++) {
            const k = ty * grid.w + tx;
            if (!(grid.coverage[k] >= 1))
                continue;
            const P = toSheet((tx + 0.5) / grid.w, (ty + 0.5) / grid.h, 0);
            const d = [P[0] - L[0], P[1] - L[1], P[2] - L[2]];
            const dl = Math.hypot(d[0], d[1], d[2]) || 1;
            if ((d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2]) / (dl * al) < cosFull)
                continue;
            count.set(grid.slot[k], (count.get(grid.slot[k]) ?? 0) + 1);
        }
    let best = -1;
    let most = 0;
    for (const [sl, n] of [...count.entries()].sort((p, q) => p[0] - q[0]))
        if (n > most)
            [best, most] = [sl, n];
    return best;
}
/**
 * The azimuths (degrees around the aim; 0 along away from the foot, 90 across toward screen right) the falloff law's
 * outside probe tries on the 1.5 x cone ring, in order: the four turns the probe always tried, in their old order
 * (along away from the foot, along toward it, across right, across left), then the rest of the ring every 15 degrees.
 * The first that lands on the page is read, so a page whose old probe found a point keeps that point (Phase 2 Task 2d).
 */
export const OUTSIDE_AZIMUTHS = [0, 180, 90, 270, ...Array.from({ length: 24 }, (_, k) => k * 15).filter((a) => a % 90 !== 0)];
async function falloff(c) {
    const i = firstOf(c, ["lamp"]);
    const partial = (why, measured = {}) => ({ status: "partial", line: `falloff PARTIAL (${why})`, measured });
    if (i < 0)
        return partial("no lamp light");
    const lamp = c.lights[i].props;
    const on = await shot(c);
    await c.h.hook(`__paint.setLight(${i}, { level: 0 })`);
    const off = await shot(c);
    const aspect = on.w / on.h;
    const full = lamp.cone - lamp.soft;
    if (!(full >= 2))
        return partial(`the lamp's full-light cone (${full} degrees) is too narrow to sample`);
    const aim = lampSheetPoint(lamp, aspect, 0);
    if (!onPage(aim, on.w, on.h))
        return partial("the lamp's aim point is off the page");
    // The outside probe: the first point of the 1.5 x cone ring, in OUTSIDE_AZIMUTHS order, that lands on the page.
    const outsideAzimuth = OUTSIDE_AZIMUTHS.find((az) => onPage(lampRingPoint(lamp, aspect, 1.5 * lamp.cone, az), on.w, on.h));
    if (outsideAzimuth === undefined)
        return partial("no point on the ring at 1.5 x the cone angle, swept every 15 degrees, lands on the page");
    const outside = lampRingPoint(lamp, aspect, 1.5 * lamp.cone, outsideAzimuth);
    // The slot rule: the slot the declared full-light pool mostly falls on (poolSlot); samples on another slot are left out.
    // Run in the page on the whole sheet (rows top down), so only the slot number comes back.
    const geo = { at: lamp.at, aim: lamp.aim, cone: lamp.cone, soft: lamp.soft };
    const pool = await c.h.hook(`(() => { const s = __paint.stats(); const g = { ...__paint.sheetRegion(0, 0, innerWidth, innerHeight), w: s.sheetW, h: s.sheetH }; return (${poolSlot.toString()})(g, ${json(geo)}, ${json(aspect)}); })()`);
    // Samples across the full-light part of the cone (where the cone factor is exactly 1): along the aim and across
    // it, at up to 0.85 of its angle. Kept only on the page and below the knee; then ordered by distance.
    const L = pageToSheet(lamp.at, aspect);
    const sampleAt = (fitCone) => {
        const reach = 0.85 * (fitCone - lamp.soft);
        const turns = [-1, -0.5, 0, 0.5, 1].map((k) => [k * reach, false]);
        turns.push(...[-1, -0.5, 0.5, 1].map((k) => [k * reach, true]));
        return turns.map(([deg, across]) => lampSheetPoint(lamp, aspect, deg, across)).filter((p) => onPage(p, on.w, on.h));
    };
    const distOf = (p) => {
        const P = pageToSheet([p[0], p[1], 0], aspect);
        return Math.hypot(L[0] - P[0], L[1] - P[1], L[2] - P[2]);
    };
    // The page's own fit at a cone: kept points ordered by distance, its exponent, its span and the rms scatter of its
    // log residuals about the fitted line (the noise the span has to beat).
    const fitAt = async (cone) => {
        const onPagePoints = sampleAt(cone);
        // Patches over ink or partial coverage are left out: they measure the print, not the light. So are patches on a
        // material slot other than the pool's (the slot rule): a different albedo is not distance.
        const points = [];
        let otherSlot = 0;
        for (const p of onPagePoints) {
            const kind = await sampleSheet(c, p, pool);
            if (kind === "bare")
                points.push(p);
            else if (kind === "slot")
                otherSlot++;
        }
        // The fit reads the lamp's diffuse light alone: its specular term is off (on a glossy material the lobe adds a
        // shape that is not inverse square). A bright lamp pushes its pool into the knee. The law is about shape, not
        // level, so the lamp is dimmed by halves (at most twice) until enough points read below the knee.
        await c.h.hook(`__paint.setLight(${i}, { level: ${json(lamp.level)}, specular: 0, cone: ${json(cone)} })`);
        let fit = await shot(c);
        let dim = 1;
        let kept = points.filter((p) => belowKnee([fit, off], p));
        for (const k of [0.5, 0.25]) {
            if (kept.length >= MIN_SAMPLES)
                break;
            await c.h.hook(`__paint.setLight(${i}, { level: ${json(lamp.level * k)} })`);
            const f = await shot(c);
            const k2 = points.filter((p) => belowKnee([f, off], p));
            if (k2.length > kept.length)
                [fit, dim, kept] = [f, k, k2];
        }
        const samples = kept
            .map((p) => {
            const d = distOf(p);
            return { d, lambert: L[2] / d, gain: patch(fit, p, linLum(fit)) - patch(off, p, linLum(off)) };
        })
            .sort((a, b) => a.d - b.d);
        const span = samples.length >= 2 ? Math.log(samples.at(-1).d / samples[0].d) : 0;
        const lit = samples.every((s) => s.gain > 0);
        const exponent = samples.length >= 2 && lit ? -slope(samples.map((s) => Math.log(s.d)), samples.map((s) => Math.log(s.gain / s.lambert))) : NaN;
        const xs = samples.map((s) => Math.log(s.d));
        const ys = samples.map((s) => Math.log(Math.max(s.gain, 1e-6) / s.lambert));
        const mx = xs.reduce((p, q) => p + q, 0) / Math.max(xs.length, 1);
        const my = ys.reduce((p, q) => p + q, 0) / Math.max(ys.length, 1);
        const rms = Number.isFinite(exponent) ? Math.sqrt(xs.reduce((acc, x, k) => acc + (ys[k] - (my - exponent * (x - mx))) ** 2, 0) / xs.length) : NaN;
        return { samples, dim, inked: onPagePoints.length - points.length - otherSlot, otherSlot, span, lit, exponent, rms };
    };
    // The page's own noise is the rms of its widest fit: the cone opened so the outer samples sit WIDE_REACH off the
    // aim (the declared cone when that is already as wide), not the narrow fit's own rms, which the overhead fault
    // showed is not a safe noise measure (header, falloff). The declared cone is read when its samples span at least
    // `relight.falloffSpan` x that rms; otherwise the shade is opened for the fit only, and the law is read there.
    const ratio = c.th("relight.falloffSpan");
    const wide = Math.max(lamp.cone, lamp.soft + WIDE_REACH / 0.85);
    const declared = await fitAt(lamp.cone);
    const widest = wide === lamp.cone ? declared : await fitAt(wide);
    const { open, noise } = falloffPlan(declared, widest, ratio);
    const fitCone = open ? wide : lamp.cone;
    const { samples, dim, inked, otherSlot, span, lit, exponent } = fitCone === lamp.cone ? declared : widest;
    const rms = noise;
    const aimGain = patch(on, aim, encLum(on)) - patch(off, aim, encLum(off));
    const outsideDiff = Math.abs(patch(on, outside, encLum(on)) - patch(off, outside, encLum(off)));
    // The lamp moved to its second test position must light its new aim point (a painted pool stays behind).
    await c.h.hook(`__paint.setLight(${i}, { level: ${json(lamp.level)}, specular: ${json(lamp.specular ?? 1)}, cone: ${json(lamp.cone)} })`);
    await c.h.hook(`__paint.moveLight(${i}, 1)`);
    const moved = (await c.h.hook("__paint.lights()"))[i].props;
    const movedAim = lampSheetPoint(moved, aspect, 0);
    let movedGain = NaN;
    if (onPage(movedAim, on.w, on.h)) {
        const mOn = await shot(c);
        await c.h.hook(`__paint.setLight(${i}, { level: 0 })`);
        const mOff = await shot(c);
        movedGain = patch(mOn, movedAim, encLum(mOn)) - patch(mOff, movedAim, encLum(mOff));
    }
    const band = c.th("relight.ambientBand");
    const slack = c.th("relight.falloffSlack");
    const measured = {
        "falloff.rms": rms,
        "falloff.exponent": exponent,
        "falloff.span": span,
        "falloff.samples": samples.length,
        "falloff.inked": inked,
        "falloff.otherSlot": otherSlot,
        "falloff.poolSlot": pool,
        "falloff.outsideAzimuth": outsideAzimuth,
        "falloff.dim": dim,
        "falloff.cone": fitCone,
        "falloff.declaredSpan": declared.span,
        "falloff.declaredRms": declared.rms,
        "falloff.fitRms": fitCone === lamp.cone ? declared.rms : widest.rms,
        "falloff.minSpan": ratio * rms,
        "falloff.cosMax": samples[0]?.lambert ?? NaN,
        "falloff.cosMin": samples.at(-1)?.lambert ?? NaN,
        "falloff.aimGain": aimGain,
        "falloff.movedGain": movedGain,
        "falloff.outsideDiff": outsideDiff,
    };
    const facts = `exponent ${round(exponent, 2)} (inverse square is 2) over ${samples.length} samples (${inked} left out over ink${otherSlot ? `, ${otherSlot} on a material slot other than the pool's slot ${pool}` : ""}) at ${dim} x level${fitCone !== lamp.cone ? ` with the cone opened from ${lamp.cone} to ${round(fitCone, 1)} degrees (the declared one's samples span ln-distance ${round(declared.span, 3)}, under ${ratio} x the page's fit rms ${round(noise, 4)})` : ""} spanning ln-distance ${round(span, 3)} (the page's fit rms ${round(noise, 4)}), aim gain ${round(aimGain)}, moved-aim gain ${round(movedGain)}, at 1.5 x cone${OUTSIDE_AZIMUTHS.indexOf(outsideAzimuth) >= 4 ? ` (ring azimuth ${outsideAzimuth} degrees)` : ""} ${round(outsideDiff)} from lamp off`;
    const problems = [];
    if (aimGain <= band)
        problems.push(`turning the lamp off changes its aim point by ${round(aimGain)}, at or under ${band}: the light does not answer setLight`);
    else if (Number.isFinite(movedGain) && movedGain <= band)
        problems.push(`moved to its second test position, the lamp adds ${round(movedGain)} at its new aim, at or under ${band}: the light does not follow the lamp`);
    if (outsideDiff > band)
        problems.push(`at 1.5 x the cone angle (ring azimuth ${outsideAzimuth} degrees) the lamp still adds ${round(outsideDiff)}, over ${band}`);
    if (problems.length)
        return { status: "fail", line: `falloff FAIL (${problems.join("; ")}; ${facts})`, measured };
    if (!Number.isFinite(movedGain))
        return partial(`the lamp's second test position aims off the page; ${facts}`, measured);
    if (samples.length < MIN_SAMPLES)
        return partial(`only ${samples.length} samples in the full-light cone are on the page and under the finish's knee, needs ${MIN_SAMPLES}; ${facts}`, measured);
    // The span gate: span against the widest fit's rms (`falloffPlan`), never the narrow fit's own.
    if (!(span >= ratio * rms) && lit)
        return partial(`the lamp's geometry cannot resolve its falloff: its full-light samples span ln-distance ${round(span, 3)}, under ${ratio} x the page's own fit rms ${round(noise, 4)}; ${facts}`, measured);
    if (!lit || !(Math.abs(exponent - 2) <= slack))
        return { status: "fail", line: `falloff FAIL (the lamp's light falls with distance^${round(exponent, 2)}, not within ${slack} of inverse square; ${facts})`, measured };
    return { status: "pass", line: `falloff pass (${facts})`, measured };
}
async function highlight(c) {
    const i = firstOf(c, ["key"]);
    if (i < 0)
        return { status: "partial", line: "highlight PARTIAL (no key light to move)", measured: {} };
    // Only the key lights the frame while the highlight is measured; restore() puts the others back.
    for (const j of c.lights.keys())
        if (j !== i)
            await c.h.hook(`__paint.setLight(${j}, { level: 0 })`);
    const declared = c.lights[i].props.specular ?? 1;
    // The materials that declare the law, by slot, and the sheet's slot under each frame pixel (read once at the
    // sheet's resolution, rows top down, as the slots do not move with the light).
    const mats = await c.h.hook("__paint.materials()");
    const glossy = [...mats.entries()].filter(([, m]) => m.laws.includes("highlight"));
    // Read once for the coverage too: (b) reads only fully covered pixels, as the bare ground (coverage 0) is drawn
    // unlit and cannot carry a highlight, and an edge pixel mixes the ground into the surface's colour.
    const grid = await c.h.hook("(() => { const s = __paint.stats(); return { ...__paint.sheetRegion(0, 0, innerWidth, innerHeight), w: s.sheetW, h: s.sheetH }; })()");
    const texel = (p, fw, fh) => Math.floor((Math.floor(p / fw) * grid.h) / fh) * grid.w + Math.floor(((p % fw) * grid.w) / fw);
    const slotAt = (p, fw, fh) => grid.slot[texel(p, fw, fh)];
    const full = c.th("relight.fullCoverage");
    let covered;
    const coveredOf = (fw, fh) => {
        if (covered)
            return covered;
        covered = new Uint8Array(fw * fh);
        for (let p = 0; p < covered.length; p++)
            covered[p] = grid.coverage[texel(p, fw, fh)] >= full ? 1 : 0;
        return covered;
    };
    const name = ([k, m]) => `${m.id} (slot ${k})`;
    let onFrame;
    const at = async (step) => {
        await c.h.hook(`__paint.moveLight(${i}, ${step})`);
        const on = await shot(c);
        await c.h.hook(`__paint.setLight(${i}, { specular: 0 })`);
        const off = await shot(c);
        // restore() resets the declared props, which may not name `specular`, so it is put back here.
        await c.h.hook(`__paint.setLight(${i}, { specular: ${json(declared)} })`);
        const dir = (await c.h.hook("__paint.lights()"))[i].props.dir;
        if (!onFrame) {
            onFrame = new Set();
            if (glossy.length)
                for (let p = 0; p < on.w * on.h; p++)
                    onFrame.add(slotAt(p, on.w, on.h));
        }
        const shown = glossy.filter(([k]) => onFrame.has(k));
        // A material on the frame shows no highlight when its slot has no specular difference.
        const dull = shown.filter(([k]) => !specularCentroid(on, off, (p) => slotAt(p, on.w, on.h) === k)).map(name);
        const cov = coveredOf(on.w, on.h);
        const lum = luminance(on);
        const slots = shown.map(([k, m]) => ({
            name: name([k, m]),
            slot: k,
            specular: specularCentroid(on, off, (p) => slotAt(p, on.w, on.h) === k),
            bright: brightCentroid(lum, on.w, on.h, 0.01, (p) => cov[p] === 1 && slotAt(p, on.w, on.h) === k),
        }));
        return { specular: specularCentroid(on, off), bright: brightCentroid(lum, on.w, on.h, 0.01, (p) => cov[p] === 1), dir, dull, slots };
    };
    const p0 = await at(0);
    const p1 = await at(1);
    const offFrame = glossy.filter(([k]) => !onFrame.has(k)).map(name);
    const slots = p0.slots.map((a, j) => ({ name: a.name, slot: a.slot, specular: [a.specular, p1.slots[j].specular], bright: [a.bright, p1.slots[j].bright] }));
    return highlightVerdict({ specular: [p0.specular, p1.specular], bright: [p0.bright, p1.bright], read: covered.reduce((n, v) => n + v, 0), dir: [p0.dir, p1.dir], dull: [...new Set([...p0.dull, ...p1.dull])], offFrame, slots }, c.th("relight.highlightShift"), c.th("relight.brightShift"));
}
const tokenName = (t) => t.replace(/^var\(\s*/, "").replace(/\s*\)$/, "");
const unsetLine = (unset) => `the palette token${unset.length > 1 ? "s" : ""} ${unset.join(", ")} ${unset.length > 1 ? "are" : "is"} unset`;
/**
 * A tinting light's own hue as an OKLab (a, b) direction: the mean of its colours, a glow's ramp positions or an ember's
 * heat colours (edge and core) pulled to the ramp, built from the page's palette tokens. `unset` names tokens the page
 * leaves unset (the hue is then unknown). Shared by the tint law and the burn law's (c).
 */
async function lightAb(c, info) {
    const pal = c.target.bar?.palette ?? { ground: "--ground", ink: "--ink", accents: ["--accent"] };
    const names = [pal.ground, pal.ink, ...pal.accents].map(tokenName);
    const unset = await c.h.hook(`${json(names)}.filter((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() === "")`);
    if (unset.length)
        return { unset };
    const css = await c.h.hook(`${json(names)}.map((n) => { const p = document.createElement("span"); p.style.color = "var(" + n + ")"; document.body.append(p); const v = getComputedStyle(p).color; p.remove(); return v; })`);
    const [ground, ink, ...accents] = css.map(parseCssColor);
    const ramp = buildRamp(ground, ink, accents.slice(0, 3));
    const hues = info.props.hues;
    const colours = info.id === "ember"
        ? info.props.kelvin.map((k) => emberColour(k, ramp, info.props.pull))
        : (hues === "accents" ? [0.25, 0.5, 0.75] : hues).map((t) => rampAt(ramp.stops, t));
    let ga = 0;
    let gb = 0;
    for (const col of colours) {
        const [, C, hue] = linearToOklch(col);
        ga += (C * Math.cos((hue * Math.PI) / 180)) / colours.length;
        gb += (C * Math.sin((hue * Math.PI) / 180)) / colours.length;
    }
    return { ab: [ga, gb] };
}
async function tint(c) {
    // The first light that declares tint: a glow on the front (a glow behind the sheet declares transmit instead), or an
    // ember. A light that gives a `region` (Light.region: an ember lights a band along its front) is read by that circle,
    // as `__paint.lights()` reports it at the frozen time; a glow by its `at` and `radius`.
    const i = c.lights.findIndex((l) => l.laws.includes("tint"));
    if (i < 0)
        return { status: "partial", line: "tint PARTIAL (no glow light)", measured: {} };
    const info = c.lights[i];
    const g = { ...info.props, ...info.region };
    const hue = await lightAb(c, info);
    if ("unset" in hue)
        return { status: "partial", line: `tint PARTIAL (${unsetLine(hue.unset)}, so the glow's hue is unknown)`, measured: {} };
    const glowHue = hueOf(hue.ab[0], hue.ab[1]);
    const on = await shot(c);
    await c.h.hook(`__paint.setLight(${i}, { level: 0 })`);
    const off = await shot(c);
    const side = Math.min(on.w, on.h);
    const cx = g.at[0] * on.w;
    const cy = g.at[1] * on.h;
    const dist = (p) => Math.hypot((p % on.w) + 0.5 - cx, Math.floor(p / on.w) + 0.5 - cy) / side;
    const mean = (fr) => {
        let a = 0;
        let b = 0;
        let n = 0;
        for (let p = 0; p < fr.w * fr.h; p++) {
            if (dist(p) >= 0.6 * g.radius)
                continue;
            const [, aa, bb] = srgbToOklab(fr.data[p * 4], fr.data[p * 4 + 1], fr.data[p * 4 + 2]);
            a += aa;
            b += bb;
            n++;
        }
        return { C: Math.hypot(a / n, b / n), h: hueOf(a / n, b / n) };
    };
    const mOn = mean(on);
    const mOff = mean(off);
    let s = 0;
    let n = 0;
    for (let p = 0; p < on.w * on.h; p++) {
        if (dist(p) <= 1.2 * g.radius)
            continue;
        for (let k = 0; k < 3; k++)
            s += Math.abs(on.data[p * 4 + k] - off.data[p * 4 + k]);
        n++;
    }
    // No pixel beyond 1.2 x the radius (a circle holding a front across the whole frame): "nothing beyond" cannot be
    // judged, so the law is partial there, never a pass by default.
    const empty = n === 0;
    const beyondDiff = empty ? 0 : s / (n * 3 * 255);
    const hueGain = hueDistance(mOff.h, glowHue) - hueDistance(mOn.h, glowHue);
    const chromaGain = mOn.C - mOff.C;
    const measured = { "tint.hueGain": hueGain, "tint.chromaGain": chromaGain, ...(empty ? {} : { "tint.beyondDiff": beyondDiff }) };
    const band = c.th("relight.ambientBand");
    const inside = `inside, hue ${round(mOff.h, 1)} -> ${round(mOn.h, 1)} toward the glow's ${round(glowHue, 1)}, chroma ${round(mOff.C)} -> ${round(mOn.C)}`;
    const facts = empty ? `${inside}; no pixel lies beyond 1.2 x radius` : `${inside}; beyond 1.2 x radius the frames differ by ${round(beyondDiff, 5)}`;
    const problems = [];
    if (!(hueGain > 0))
        problems.push("the glow does not move the hue toward its own");
    if (!(chromaGain > 0))
        problems.push("the glow does not raise the chroma");
    if (beyondDiff > band)
        problems.push(`beyond its radius the glow still changes the frame by ${round(beyondDiff, 5)}, over ${band}`);
    if (problems.length)
        return { status: "fail", line: `tint FAIL (${problems.join("; ")}; ${facts})`, measured };
    if (empty)
        return { status: "partial", line: `tint PARTIAL (nothing beyond 1.2 x its radius ${round(g.radius, 3)} to read, so the fade cannot be judged; ${inside})`, measured };
    return { status: "pass", line: `tint pass (${facts})`, measured };
}
/** Linear luminance under which a caustic-off pixel is too dark to divide by (8-bit sRGB about 25). */
const CAUSTIC_DARK = 0.01;
/** The caustic law's share of the water's pixels that are its lines (the plan's "brightest 5%"). */
const CAUSTIC_SHARE = 0.05;
/** The caustic law's second frame, seconds after the first (the plan's "frames 0.5 s apart"). */
const CAUSTIC_GAP = 0.5;
/** The most times the light through water is halved to bring its caustic under the knee (to 1/256 of its level). */
const CAUSTIC_DIMS = 8;
/** The caustic alone per pixel: linear luminance on over off, minus 1; NaN where off is under CAUSTIC_DARK. */
export function causticAlone(on, off) {
    const a = linLum(on);
    const b = linLum(off);
    const out = new Float32Array(on.w * on.h);
    for (let p = 0; p < out.length; p++) {
        const d = b(p * 4);
        out[p] = d < CAUSTIC_DARK ? NaN : a(p * 4) / d - 1;
    }
    return out;
}
/** The brightest `share` of the pixels `keep` marks (finite values only), ties included, as a 0/1 mask, and its cut. */
export function brightMask(v, keep, share = CAUSTIC_SHARE) {
    const vals = [];
    for (let p = 0; p < v.length; p++)
        if (keep[p] && Number.isFinite(v[p]))
            vals.push(v[p]);
    const mask = new Uint8Array(v.length);
    if (!vals.length)
        return { mask, cut: NaN };
    const sorted = Float32Array.from(vals).sort();
    const cut = sorted[Math.max(0, Math.floor(sorted.length * (1 - share)))];
    for (let p = 0; p < v.length; p++)
        if (keep[p] && v[p] >= cut)
            mask[p] = 1;
    return { mask, cut };
}
/**
 * Guo-Hall thinning (algorithm A1, 1989) of a 0/1 mask (w x h, rows top down) to a one-pixel skeleton; the mask is
 * not changed. Guo-Hall, not Zhang-Suen: Zhang-Suen erases a line two pixels thick on a diagonal step entirely
 * (it read 200 px wide in test/unit/relight.test.ts, a thin line taken for a pool of light).
 */
export function skeleton(mask, w, h) {
    const m = Uint8Array.from(mask);
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : m[y * w + x]);
    const kill = [];
    for (let changed = true; changed;) {
        changed = false;
        for (const pass of [0, 1]) {
            kill.length = 0;
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    if (!m[y * w + x])
                        continue;
                    // Neighbours P2..P9, clockwise from north.
                    const [p2, p3, p4, p5, p6, p7, p8, p9] = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
                    const c = (+!p2 & (p3 | p4)) + (+!p4 & (p5 | p6)) + (+!p6 & (p7 | p8)) + (+!p8 & (p9 | p2));
                    if (c !== 1)
                        continue;
                    const n = Math.min((p9 | p2) + (p3 | p4) + (p5 | p6) + (p7 | p8), (p2 | p3) + (p4 | p5) + (p6 | p7) + (p8 | p9));
                    if (n < 2 || n > 3)
                        continue;
                    const keep = pass === 0 ? (p6 | p7 | +!p9) & p8 : (p2 | p3 | +!p5) & p4;
                    if (keep)
                        continue;
                    kill.push(y * w + x);
                }
            }
            for (const p of kill)
                m[p] = 0;
            if (kill.length)
                changed = true;
        }
    }
    return m;
}
/**
 * Length of a skeleton in px: each link between neighbouring skeleton pixels counts once, 1 for a side step and
 * sqrt 2 for a diagonal one, a diagonal only when neither pixel beside it is on the skeleton (else the corner's two
 * side steps already join them). At least 1 for a skeleton with any pixel (a disc thins to a point).
 */
export function skeletonLength(sk, w, h) {
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : sk[y * w + x]);
    let len = 0;
    let any = false;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (!sk[y * w + x])
                continue;
            any = true;
            if (at(x + 1, y))
                len += 1;
            if (at(x, y + 1))
                len += 1;
            if (at(x + 1, y + 1) && !at(x + 1, y) && !at(x, y + 1))
                len += Math.SQRT2;
            if (at(x - 1, y + 1) && !at(x - 1, y) && !at(x, y + 1))
                len += Math.SQRT2;
        }
    }
    return any ? Math.max(len, 1) : 0;
}
/**
 * Mean width of the lines a mask forms, px: its area over its skeleton's length (0 for an empty mask). The caustic
 * law's old thin half; it is kept for test/pages/water.test.ts, whose exposure guard shows it moving with exposure.
 */
export function lineWidth(mask, w, h) {
    let area = 0;
    for (const v of mask)
        area += v;
    const len = skeletonLength(skeleton(mask, w, h), w, h);
    return len > 0 ? area / len : 0;
}
/** Intersection over union of two 0/1 masks (0 when both are empty). */
export function overlap(a, b) {
    let both = 0;
    let either = 0;
    for (let p = 0; p < a.length; p++) {
        both += a[p] & b[p];
        either += a[p] | b[p];
    }
    return either ? both / either : 0;
}
/** The caustic law's verdict: both conditions must pass; each failing one is named. */
export function causticVerdict(r, minConcentration, maxOverlap, level = 1) {
    const [c0, c1] = r.concentration;
    const low = Math.min(c0, c1);
    const measured = { "caustic.overlap": r.overlap, "caustic.concentration": low, "caustic.level": level };
    if (!(c0 > 0) || !(c1 > 0))
        return { status: "fail", line: "caustic FAIL (the light draws no caustic: the frames with its caustic on and off are the same)", measured };
    const facts = `the brightest 5% overlap ${round(r.overlap, 3)} across ${CAUSTIC_GAP} s, concentration ${round(c0, 2)} / ${round(c1, 2)}, read alone at ${round(level, 4)} x its level`;
    const problems = [];
    if (r.overlap >= maxOverlap)
        problems.push(`the caustic lines stand still: the brightest 5% at t ${T} and ${T + CAUSTIC_GAP} overlap ${round(r.overlap, 3)}, at or over ${maxOverlap}`);
    if (low < minConcentration)
        problems.push(`the brightest 5% get only ${round(1 + low, 2)} x still water's light (concentration ${round(low, 2)}, under ${minConcentration}): pools of light, not lines`);
    return problems.length ? { status: "fail", line: `caustic FAIL (${problems.join("; ")}; ${facts})`, measured } : { status: "pass", line: `caustic pass (${facts})`, measured };
}
/** True when a pixel `keep` marks reaches the finish's knee in any channel (8-bit), where light cannot be read back. */
export function reachesKnee(fr, keep) {
    for (let p = 0; p < keep.length; p++)
        if (keep[p] && atKnee(fr, p))
            return true;
    return false;
}
const atKnee = (fr, p) => Math.max(fr.data[p * 4], fr.data[p * 4 + 1], fr.data[p * 4 + 2]) >= KNEE_8BIT;
/**
 * True when the finish's knee can change what the caustic law reads (header, caustic; Phase 2 Task 4). Only the
 * pixels the law reads count (`keep`: water, readable in both caustic-off frames). One of them biases the read when it
 * reaches the knee in its caustic-off frame (its ratio is then raised, unbounded), or in a caustic-on frame with its
 * c - 1 at or under that frame's cut. The knee only lowers an on frame, so a pixel clipped above the cut would read
 * above it unclipped too: the cut and the brightest 5% (concentration and overlap) are exact. A clipped pixel the law
 * leaves out changes nothing.
 */
export function kneeBiases(on, off, v, keep) {
    for (const n of [0, 1]) {
        const { cut } = brightMask(v[n], keep);
        for (let p = 0; p < keep.length; p++) {
            if (!keep[p])
                continue;
            if (atKnee(off[n], p))
                return true;
            if (atKnee(on[n], p) && !(v[n][p] > cut))
                return true;
        }
    }
    return false;
}
/**
 * The caustic law's exposure (header, caustic): every light but light `i` off, grain 0, light `i` at `level` x its
 * declared level, or, when `level` is not given, halved from 1 until the knee cannot change what the law reads
 * (`kneeBiases`; `clear` false when it still can at the last level). Puts the lights and the grain back before it
 * returns.
 */
export async function readCaustic(h, lights, i, level) {
    const props = lights[i].props;
    const declared = props.caustic ?? 1;
    const own = props.level ?? 1;
    const grain = await h.hook("__paint.grain()");
    const mats = await h.hook("__paint.materials()");
    const waterSlots = new Set([...mats.entries()].filter(([, m]) => m.id === "water").map(([k]) => k));
    const grid = waterSlots.size
        ? await h.hook("(() => { const s = __paint.stats(); return { ...__paint.sheetRegion(0, 0, innerWidth, innerHeight), w: s.sheetW, h: s.sheetH }; })()")
        : null;
    try {
        for (const j of lights.keys())
            if (j !== i)
                await h.hook(`__paint.setLight(${j}, { level: 0 })`);
        await h.hook("__paint.setGrain(0)");
        let water = null;
        const waterOf = (w, hh) => {
            if (water)
                return water;
            water = new Uint8Array(w * hh);
            for (let p = 0; p < water.length; p++) {
                if (grid) {
                    const g = Math.floor((Math.floor(p / w) * grid.h) / hh) * grid.w + Math.floor(((p % w) * grid.w) / w);
                    if (!waterSlots.has(grid.slot[g]) || !(grid.coverage[g] > 0))
                        continue;
                }
                water[p] = 1;
            }
            return water;
        };
        // The frames at k x the light's level: caustic on, then off, at both times; the caustic alone and the read pixels.
        const at = async (k) => {
            await h.hook(`__paint.setLight(${i}, { level: ${json(own * k)}, caustic: ${json(declared)} })`);
            const on = [];
            for (const t of [T, T + CAUSTIC_GAP]) {
                await h.hook(`__paint.setTime(${t})`);
                on.push(await h.shot());
            }
            await h.hook(`__paint.setLight(${i}, { caustic: 0 })`);
            const off = [];
            for (const t of [T, T + CAUSTIC_GAP]) {
                await h.hook(`__paint.setTime(${t})`);
                off.push(await h.shot());
            }
            const v = [causticAlone(on[0], off[0]), causticAlone(on[1], off[1])];
            const { w, h: hh } = on[0];
            const keep = Uint8Array.from(waterOf(w, hh));
            for (let p = 0; p < keep.length; p++)
                if (!Number.isFinite(v[0][p]) || !Number.isFinite(v[1][p]))
                    keep[p] = 0;
            return { on: on, off: off, v, w, h: hh, keep };
        };
        let k = level ?? 1;
        let r = await at(k);
        let clear = !kneeBiases(r.on, r.off, r.v, r.keep);
        for (let n = 0; level === undefined && !clear && n < CAUSTIC_DIMS; n++) {
            k /= 2;
            r = await at(k);
            clear = !kneeBiases(r.on, r.off, r.v, r.keep);
        }
        return { v: r.v, w: r.w, h: r.h, keep: r.keep, level: k, clear };
    }
    finally {
        await h.hook(`__paint.setTime(${T})`);
        await h.hook(`__paint.setGrain(${json(grain)})`);
        for (const [j, l] of lights.entries())
            await h.hook(`__paint.setLight(${j}, ${json(l.props)})`);
    }
}
async function caustic(c) {
    const i = firstOf(c, ["throughWater"]);
    if (i < 0)
        return { status: "partial", line: "caustic PARTIAL (no light through water)", measured: {} };
    const r = await readCaustic(c.h, c.lights, i);
    if (!r.clear)
        return { status: "partial", line: `caustic PARTIAL (the water reaches the finish's knee even at ${round(r.level, 4)} x the light's level, so the caustic cannot be read)`, measured: {} };
    if (!r.keep.some((v) => v))
        return { status: "partial", line: "caustic PARTIAL (no water pixel is lit enough to read the caustic)", measured: {} };
    const ma = brightMask(r.v[0], r.keep);
    const mb = brightMask(r.v[1], r.keep);
    return causticVerdict({ overlap: overlap(ma.mask, mb.mask), concentration: [ma.cut, mb.cut] }, c.th("relight.causticConcentration"), c.th("relight.causticOverlap"), r.level);
}
/** The transmit law's share of the glass's pixels read as its brightest (the caustic's 5%). */
const TRANSMIT_SHARE = 0.05;
/** The most times the light behind is halved to bring the glass under the knee (to 1/256 of its level). */
const TRANSMIT_DIMS = 8;
/** Indexes of the `share` brightest kept entries of `v` (ties included), as a 0/1 mask. */
function topMask(v, keep, share) {
    const read = [];
    for (let p = 0; p < v.length; p++)
        if (keep[p])
            read.push(v[p]);
    const mask = new Uint8Array(v.length);
    if (!read.length)
        return mask;
    const sorted = Float32Array.from(read).sort();
    const cut = sorted[Math.max(0, Math.floor(sorted.length * (1 - share)))];
    for (let p = 0; p < v.length; p++)
        if (keep[p] && v[p] >= cut)
            mask[p] = 1;
    return mask;
}
/** Per-pixel linear luminance of a frame. */
const linear = (fr) => {
    const f = linLum(fr);
    const v = new Float32Array(fr.w * fr.h);
    for (let p = 0; p < v.length; p++)
        v[p] = f(p * 4);
    return v;
};
/**
 * (c)'s ground readings: for each light behind, the mean absolute 8-bit change (0..1) between `on` and `off` over the
 * pixels outside the glass inside that light's own circle (`radius` short-side units about `at`, page fractions), or
 * over the whole frame when the light has no `at` or no `radius` (a light with no place lights everywhere it can).
 */
export function transmitGrounds(on, off, glassPx, lights) {
    const W = on.w;
    const H = on.h;
    const side = Math.min(W, H);
    return lights.map(({ light, at, radius }) => {
        const near = (p) => !at || !radius || Math.hypot((p % W) + 0.5 - at[0] * W, Math.floor(p / W) + 0.5 - at[1] * H) / side <= radius;
        let d = 0;
        let m = 0;
        for (let p = 0; p < W * H; p++) {
            if (glassPx[p] || !near(p))
                continue;
            for (let k = 0; k < 3; k++)
                d += Math.abs(on.data[p * 4 + k] - off.data[p * 4 + k]);
            m++;
        }
        return { light, outside: m ? d / (m * 3 * 255) : 0 };
    });
}
/** Side of the square patch a tile's face is read over, px: the bar 06 report's 9 x 9 tile-centre patch. */
const FACE = 9;
/**
 * (d) judges the tiles' variation at a moment only with at least this many tiles: the smallest n where the lower
 * quartile (index floor(0.25 (n - 1))) is not the dimmest tile (checks fix round 3, review-checks-fix2 I2).
 */
export const MIN_TILES = 5;
/**
 * (d1): a tile is blown to white when its white face (the mean dimmest channel: every channel) reaches 252 / 255,
 * within 3 levels of 255 (checks fix round 3, review-checks-fix2 I1, stated before measuring; the channel corrected
 * after the first measurement, header (d)). From the finish (src/engine/finish.ts,
 * knee 0.8 linear, out = k + 0.2 (1 - exp(-(c - k) / 0.2))): the shoulder's output reaches 252 at a linear input of
 * 1.2, 1.5 x the knee's, and from there a doubling of the light moves it under 3 levels: the tile has stopped
 * answering more light. The shoulder is per channel, so this is asked of every channel. 252 is OKLab L 0.991 for a
 * neutral, within half a palette.visibleMove (0.02) of white. The face is a mean over the grain (colourless, OKLab L):
 * at the default grain (0.04) a fully blown face reads 253.3 (the grain dips under 255 and clips over it), so a
 * blown tile clears 252 by 1.3 levels; a page with grain over about 0.07 cannot reach
 * it (a known limit). Not the knee (231, where the shoulder starts): bar 06's wash alone puts every tile over it
 * (glimmer-flat-white). Not derived from bar 06, glass.html or any fault.
 */
export const TILE_WHITE = 252 / 255;
/** (d) is read at these times: the check's frozen T and one second either side (checks fix round 3, Minor 4). */
export const TILE_MOMENTS = [T - 1, T, T + 1];
/**
 * (d)'s tile faces on the frame `fr`: the 4-connected components of `full` (the fully covered glass pixels), each
 * read as a tile when it does not touch the frame's border and the FACE x FACE patch about its centroid (rounded)
 * lies wholly in it. Over that patch a tile's luma face is the mean encoded Rec. 709 luma and its white face the mean
 * of each pixel's dimmest channel, so the rim and the grain do not decide it. Returns one face per tile read.
 */
export function tileFaces(fr, full) {
    const { w, h, data } = fr;
    const label = new Int32Array(w * h).fill(-1);
    const faces = [];
    const stack = [];
    const half = (FACE - 1) / 2;
    let next = 0;
    for (let p0 = 0; p0 < w * h; p0++) {
        if (!full[p0] || label[p0] !== -1)
            continue;
        const id = next++;
        let sx = 0;
        let sy = 0;
        let n = 0;
        let border = false;
        label[p0] = id;
        stack.push(p0);
        while (stack.length) {
            const p = stack.pop();
            const x = p % w;
            const y = (p - x) / w;
            sx += x;
            sy += y;
            n++;
            if (x === 0 || y === 0 || x === w - 1 || y === h - 1)
                border = true;
            for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
                if (q >= 0 && full[q] && label[q] === -1) {
                    label[q] = id;
                    stack.push(q);
                }
            }
        }
        if (border)
            continue;
        const cx = Math.round(sx / n);
        const cy = Math.round(sy / n);
        let luma = 0;
        let white = 0;
        let inside = true;
        for (let y = cy - half; y <= cy + half && inside; y++) {
            for (let x = cx - half; x <= cx + half; x++) {
                if (x < 0 || y < 0 || x >= w || y >= h || label[y * w + x] !== id) {
                    inside = false;
                    break;
                }
                const o = (y * w + x) * 4;
                luma += 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
                white += Math.min(data[o], data[o + 1], data[o + 2]);
            }
        }
        if (inside)
            faces.push({ luma: luma / (255 * FACE * FACE), white: white / (255 * FACE * FACE) });
    }
    return faces;
}
/** (d)'s statistics at one moment: the whitest white face, the brightest luma face, the lower-quartile luma face (dimmest first, index floor(0.25 (n - 1))) and the spread between those two. Null under MIN_TILES. */
export function tileSpread(faces) {
    if (faces.length < MIN_TILES)
        return null;
    const sorted = faces.map((f) => f.luma).sort((a, b) => a - b);
    const top = sorted[sorted.length - 1];
    const low = sorted[Math.floor(0.25 * (sorted.length - 1))];
    return { n: faces.length, white: Math.max(...faces.map((f) => f.white)), top, low, spread: top - low };
}
/**
 * The transmit law's verdict: (a), (b) and (c) must all pass; each failing one is named. (b) holds for every light
 * behind: one whose glow does not move, or adds nothing, fails it. `transmit.overlap`, `.level` are the worst over
 * the lights behind (the largest overlap, the lowest level); each light's are kept as `transmit.overlap.<light>`.
 * (c) takes the largest of the per-light ground readings (`transmit.outside`); each is `transmit.outside.<light>`.
 * (d) judges each moment with at least MIN_TILES faces (`tileSpread`) and passes when one meets (d1) and (d2)
 * together; when no moment has MIN_TILES faces, the law is partial ("too few tiles to judge variation").
 */
export function transmitVerdict(r, minShare, maxOverlap, band, minSpread) {
    const known = r.moves.filter((m) => m.overlap !== null);
    const worst = known.length ? Math.max(...known.map((m) => m.overlap)) : null;
    const level = r.moves.length ? Math.min(...r.moves.map((m) => m.level)) : 1;
    const clear = r.moves.every((m) => m.clear);
    const ground = r.grounds.reduce((w, g) => (w === null || g.outside > w.outside ? g : w), null);
    const outside = ground?.outside ?? 0;
    const measured = { "transmit.outside": outside, "transmit.peak": r.peak, "transmit.level": level, "transmit.behind": r.moves.length };
    for (const g of r.grounds)
        measured[`transmit.outside.${g.light}`] = g.outside;
    if (r.share !== null)
        measured["transmit.share"] = r.share;
    if (worst !== null)
        measured["transmit.overlap"] = worst;
    // (d), per moment: (d1) and (d2) are judged together at each moment, never across moments.
    const reads = r.tiles.map((m) => ({ t: m.t, n: m.faces.length, s: tileSpread(m.faces) }));
    const judged = reads.flatMap((x) => (x.s ? [{ t: x.t, ...x.s }] : []));
    const blown = (x) => x.white >= TILE_WHITE;
    const varied = (x) => x.spread >= minSpread;
    // The deciding moment: the first that meets both, else the nearest to it (the larger of its two shortfalls least).
    const near = (x) => Math.min(x.white / TILE_WHITE, x.spread / minSpread);
    const decide = judged.find((x) => blown(x) && varied(x)) ?? judged.reduce((b, x) => (b === null || near(x) > near(b) ? x : b), null);
    for (const x of reads) {
        measured[`transmit.tiles.t${x.t}`] = x.n;
        if (x.s)
            Object.assign(measured, { [`transmit.tileWhite.t${x.t}`]: x.s.white, [`transmit.tileSpread.t${x.t}`]: x.s.spread });
    }
    measured["transmit.tiles"] = decide ? decide.n : Math.max(0, ...reads.map((x) => x.n));
    if (decide)
        Object.assign(measured, { "transmit.tileT": decide.t, "transmit.tileWhite": decide.white, "transmit.tileTop": decide.top, "transmit.tileLow": decide.low, "transmit.tileSpread": decide.spread });
    for (const m of r.moves) {
        if (m.overlap !== null)
            measured[`transmit.overlap.${m.light}`] = m.overlap;
        measured[`transmit.level.${m.light}`] = m.level;
    }
    const many = r.moves.length > 1;
    const who = (m) => (many ? ` ${m.light}` : "");
    const problems = [];
    if (r.share !== null && r.share < minShare)
        problems.push(`the light${many ? "s" : ""} behind give${many ? "" : "s"} ${round(r.share, 3)} of the brightest glass pixels' light, under ${minShare}: the glass is lit mainly from the front`);
    for (const m of r.moves) {
        if (m.gain[0] <= 0 || m.gain[1] <= 0)
            problems.push(`the light behind${who(m)} changes nothing on the glass at test position ${m.gain[0] <= 0 ? 0 : 1}`);
        else if (m.overlap !== null && m.overlap >= maxOverlap)
            problems.push(`the same glass pixels glow with the light behind${who(m)} at both test positions: overlap ${round(m.overlap, 3)}, at or over ${maxOverlap}`);
    }
    if (outside > band)
        problems.push(`the light${many ? "s" : ""} behind change${many ? "" : "s"} pixels outside the glass by ${round(outside, 5)} within ${many ? `light ${ground.light}'s radius` : "its radius"}, over ${band}: ${many ? "they light" : "it lights"} the ground`);
    const at = (ts) => `t ${ts.join(", ")}`;
    if (judged.length && !judged.some((x) => blown(x) && varied(x))) {
        const ts = at(judged.map((x) => x.t));
        if (!judged.some(blown)) {
            const w = judged.reduce((b, x) => (x.white > b.white ? x : b));
            problems.push(`no glass tile is blown to white at ${ts}: the whitest tile face reads ${round(w.white, 3)} at t ${w.t} (its dimmest channel), under ${round(TILE_WHITE, 3)}`);
        }
        if (!judged.some(varied)) {
            const v = judged.reduce((b, x) => (x.spread > b.spread ? x : b));
            problems.push(`the glass tiles are flat at ${ts}: the brightest tile face ${round(v.top, 3)} is within ${round(v.spread, 3)} of the lower quartile ${round(v.low, 3)} at t ${v.t}, under ${minSpread}`);
        }
        if (judged.some(blown) && judged.some(varied))
            problems.push(`no moment has a tile blown to white and a quarter of the tiles clearly dimmer together: a tile is blown to white at ${at(judged.filter(blown).map((x) => x.t))}, the tiles vary at ${at(judged.filter(varied).map((x) => x.t))}`);
    }
    const glows = r.moves
        .map((m) => `${many ? `light ${m.light}: ` : ""}${m.overlap === null ? "?" : round(m.overlap, 3)} (read at ${round(m.level, 4)} x its level${m.clear ? "" : ", still at the knee"})`)
        .join(", ");
    const facts = `the light${many ? "s" : ""} behind give${many ? "" : "s"} ${r.share === null ? "?" : round(r.share, 3)} of the brightest glass pixels' light; ${many ? "" : "its "}glowing pixels at the two test positions overlap ${glows}` +
        `; outside the glass ${many ? "they change" : "it changes"} the frame by ${round(outside, 5)}${many ? ` at most (${r.grounds.map((g) => `within light ${g.light}'s radius ${round(g.outside, 5)}`).join(", ")})` : ""}; brightest glass pixel ${round(r.peak, 3)}` +
        `; tiles ${reads
            .map((x) => x.s
            ? `at t ${x.t}: ${x.s.n}, whitest face ${round(x.s.white, 3)}, brightest ${round(x.s.top, 3)}, lower quartile ${round(x.s.low, 3)}, spread ${round(x.s.spread, 3)}`
            : `at t ${x.t}: ${x.n}, under ${MIN_TILES}`)
            .join("; ")}`;
    if (problems.length)
        return { status: "fail", line: `transmit FAIL (${problems.join("; ")}; ${facts})`, measured };
    if (r.share === null)
        return { status: "partial", line: `transmit PARTIAL (no glass pixel on the frame is fully covered; ${facts})`, measured };
    if (!clear)
        return { status: "partial", line: `transmit PARTIAL (the glass reaches the finish's knee even at ${round(level, 4)} x a light's level, so where it glows cannot be read; ${facts})`, measured };
    if (!judged.length)
        return { status: "partial", line: `transmit PARTIAL (too few tiles to judge variation: at most ${measured["transmit.tiles"]} read at a moment, under ${MIN_TILES}; ${facts})`, measured };
    return { status: "pass", line: `transmit pass (${facts})`, measured };
}
async function transmit(c) {
    const behind = [...c.lights.keys()].filter((i) => c.lights[i].props.behind === true);
    if (!behind.length)
        return { status: "fail", line: "transmit FAIL (no light sits behind the sheet: the glass that declares the law is lit from the front only)", measured: {} };
    const mats = await c.h.hook("__paint.materials()");
    const slots = new Set(mats.flatMap((m, k) => (m.laws.includes("transmit") ? [k] : [])));
    const readGrid = () => c.h.hook("(() => { const s = __paint.stats(); return { ...__paint.sheetRegion(0, 0, innerWidth, innerHeight), w: s.sheetW, h: s.sheetH }; })()");
    const grid = await readGrid();
    const full = c.th("relight.fullCoverage");
    const props = (i) => c.lights[i].props;
    const declared = (i) => props(i).level ?? 1;
    const setLevel = (i, level) => c.h.hook(`__paint.setLight(${i}, { level: ${json(level)} })`);
    // (a) and (c): every light as declared, then every light behind off together.
    const all = await shot(c);
    for (const i of behind)
        await setLevel(i, 0);
    const noBack = await shot(c);
    for (const i of behind)
        await setLevel(i, declared(i));
    const W = all.w;
    const H = all.h;
    // The glass (coverage above 0 in a declaring slot) and its fully covered pixels, on the frame, from a sheet reading.
    const glassOf = (g) => {
        const glass = new Uint8Array(W * H);
        const whole = new Uint8Array(W * H);
        for (let p = 0; p < W * H; p++) {
            const t = Math.floor((Math.floor(p / W) * g.h) / H) * g.w + Math.floor(((p % W) * g.w) / W);
            const cov = g.coverage[t];
            const isGlass = cov > 0 && slots.has(Math.round(g.slot[t]));
            glass[p] = isGlass ? 1 : 0;
            whole[p] = isGlass && cov >= full ? 1 : 0;
        }
        return { glass, whole };
    };
    const { glass: glassPx, whole: fullPx } = glassOf(grid);
    const la = linear(all);
    const lb = linear(noBack);
    const brightest = topMask(la, fullPx, TRANSMIT_SHARE);
    let s = 0;
    let n = 0;
    let peak = 0;
    const enc = encLum(all);
    for (let p = 0; p < W * H; p++) {
        if (fullPx[p])
            peak = Math.max(peak, enc(p * 4));
        if (!brightest[p])
            continue;
        s += la[p] > 0 ? Math.max(0, la[p] - lb[p]) / la[p] : 0;
        n++;
    }
    const share = n ? s / n : null;
    // (c) per light behind, inside its own radius of its centre (the whole frame when it has no `at` and `radius`).
    const grounds = transmitGrounds(all, noBack, glassPx, behind.map((i) => ({ light: i, at: props(i).at, radius: props(i).radius })));
    // (d) the tiles vary: at each moment, the frame at the declared lights and the glass read at that time.
    const tiles = [];
    try {
        for (const t of TILE_MOMENTS) {
            if (t === T) {
                tiles.push({ t, faces: tileFaces(all, fullPx) });
                continue;
            }
            await c.h.hook(`__paint.setTime(${t})`);
            const g = await readGrid();
            tiles.push({ t, faces: tileFaces(await shot(c), glassOf(g).whole) });
        }
    }
    finally {
        await c.h.hook(`__paint.setTime(${T})`);
    }
    // Fully covered glass only: an edge pixel mixes the ground in, and a light ground sits above the knee unlit.
    const kneeOnGlass = (fr) => {
        for (let p = 0; p < W * H; p++)
            if (fullPx[p] && Math.max(fr.data[p * 4], fr.data[p * 4 + 1], fr.data[p * 4 + 2]) >= KNEE_8BIT)
                return true;
        return false;
    };
    const gainOn = (v) => {
        let g = 0;
        for (let p = 0; p < v.length; p++)
            if (glassPx[p])
                g = Math.max(g, v[p]);
        return g;
    };
    // (b): each light behind in turn, alone, at both test positions, dimmed below the knee.
    const moves = [];
    for (const i of behind) {
        for (const j of c.lights.keys())
            await setLevel(j, j === i ? declared(j) : 0);
        let level = 1;
        let on = [all, all];
        let clear = false;
        for (let k = 0; k <= TRANSMIT_DIMS; k++) {
            await setLevel(i, declared(i) * level);
            await c.h.hook(`__paint.moveLight(${i}, 0)`);
            const a = await shot(c);
            await c.h.hook(`__paint.moveLight(${i}, 1)`);
            const b = await shot(c);
            on = [a, b];
            if (!kneeOnGlass(a) && !kneeOnGlass(b)) {
                clear = true;
                break;
            }
            if (k < TRANSMIT_DIMS)
                level /= 2;
        }
        await setLevel(i, 0);
        const off = linear(await shot(c));
        const gains = on.map((fr) => {
            const v = linear(fr);
            for (let p = 0; p < v.length; p++)
                v[p] = v[p] - off[p];
            return v;
        });
        const gain = [gainOn(gains[0]), gainOn(gains[1])];
        const ov = gain[0] > 0 && gain[1] > 0 ? overlap(topMask(gains[0], glassPx, TRANSMIT_SHARE), topMask(gains[1], glassPx, TRANSMIT_SHARE)) : null;
        moves.push({ light: i, overlap: ov, gain, level, clear });
        // Put the light back where it was declared before the next one is read.
        await c.h.hook(`__paint.setLight(${i}, ${json(c.lights[i].props)})`);
    }
    return transmitVerdict({ share, grounds, peak, moves, tiles }, c.th("relight.transmitShare"), c.th("relight.transmitOverlap"), c.th("relight.ambientBand"), c.th("relight.tileSpread"));
}
/**
 * The shadow law's mask from the frames with the shadow on and off: its share of the frame, its centroid in px, and
 * the deepest relative darkening on the frame (`depth`, with or without a mask). A pixel black in the off frame cannot
 * be read as a share of its light and is left out; a pixel the shadow lightens is not darker and is not kept.
 */
export function shadowMask(on, off, dark) {
    const a = linLum(on);
    const b = linLum(off);
    let n = 0;
    let sx = 0;
    let sy = 0;
    let depth = 0;
    for (let y = 0; y < on.h; y++)
        for (let x = 0; x < on.w; x++) {
            const o = (y * on.w + x) * 4;
            const lb = b(o);
            if (lb <= 0)
                continue;
            const d = (lb - a(o)) / lb;
            if (d > depth)
                depth = d;
            if (d > dark) {
                n++;
                sx += x + 0.5;
                sy += y + 0.5;
            }
        }
    return { share: n / (on.w * on.h), centroid: n ? [sx / n, sy / n] : null, depth };
}
/**
 * The geometric shadow the sheet's height casts, as the shading pass's march (shade.ts SHADOW_MARCH) finds it with a
 * hard edge: from each texel, `march.steps` samples toward the light, evenly from `march.start` texels out to where
 * the ray has risen to `march.top` (or, for a lamp, to its foot), the texel in shadow when a sample's height stands
 * above the ray. `light` is a key's `dir` (x right, y up, z toward the viewer) or a lamp's `at` (the page frame:
 * x, y fractions with y down, z height in short-side units). Gives the share of texels in shadow and their centroid,
 * and the raised region's centroid: the texels above the middle of the height range (null on a sheet of one height).
 * `grid` is the sheet at its own resolution, rows top down, as `__paint.sheetRegion` reads it. A texel with coverage
 * 0 (the bare ground) receives no shadow unless `light.ground` is on (the light's `shadow.ground`), as the shading
 * pass draws it: the ground there is drawn unlit and unshadowed. It still blocks by its height. Without `coverage`
 * every texel receives. Self-contained (no imports), because the law runs its source in the page so the whole sheet
 * is not copied out to node.
 */
export function shadowOracle(grid, light, march) {
    const w = grid.w;
    const h = grid.h;
    const side = Math.min(w, h);
    const sx = w / side;
    const sy = h / side;
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k < w * h; k++) {
        const v = grid.height[k];
        if (v < lo)
            lo = v;
        if (v > hi)
            hi = v;
    }
    const mid = lo + (hi - lo) / 2;
    let rx = 0;
    let ry = 0;
    let rn = 0;
    if (hi > lo)
        for (let ty = 0; ty < h; ty++)
            for (let tx = 0; tx < w; tx++)
                if (grid.height[ty * w + tx] > mid) {
                    rx += tx + 0.5;
                    ry += ty + 0.5;
                    rn++;
                }
    const heightAt = (qx, qy) => {
        const tx = Math.floor((qx / sx + 0.5) * w);
        const ty = Math.floor((0.5 - qy / sy) * h);
        return tx < 0 || ty < 0 || tx >= w || ty >= h ? NaN : grid.height[ty * w + tx];
    };
    const bulb = light.at ? [(light.at[0] - 0.5) * sx, (0.5 - light.at[1]) * sy, light.at[2]] : null;
    const dir = light.dir ?? [0, 0, 1];
    const start = march.start / side;
    let hit = 0;
    let cx = 0;
    let cy = 0;
    for (let ty = 0; ty < h; ty++)
        for (let tx = 0; tx < w; tx++) {
            if (!light.ground && grid.coverage && !(grid.coverage[ty * w + tx] > 0))
                continue;
            const h0 = grid.height[ty * w + tx];
            const qx = ((tx + 0.5) / w - 0.5) * sx;
            const qy = (0.5 - (ty + 0.5) / h) * sy;
            const lx = bulb ? bulb[0] - qx : dir[0];
            const ly = bulb ? bulb[1] - qy : dir[1];
            const lz = bulb ? bulb[2] - h0 : dir[2];
            const across = Math.hypot(lx, ly);
            if (across < 1e-5 || lz <= 0)
                continue;
            const rise = lz / across;
            const run = Math.min((march.top - h0) / rise, bulb ? across : 1e3);
            if (run <= start)
                continue;
            for (let k = 0; k < march.steps; k++) {
                const t = start + ((run - start) * k) / (march.steps - 1);
                const hh = heightAt(qx + (lx / across) * t, qy + (ly / across) * t);
                if (Number.isNaN(hh))
                    break;
                if (h0 + t * rise - hh < 0) {
                    hit++;
                    cx += tx + 0.5;
                    cy += ty + 0.5;
                    break;
                }
            }
        }
    return {
        share: hit / (w * h),
        centroid: hit ? [cx / hit / w, cy / hit / h] : null,
        raised: rn ? [rx / rn / w, ry / rn / h] : null,
    };
}
/** The shadow law's verdict (header, shadow): the floor, then (a) and (b) at both test positions. */
export function shadowVerdict(r, lim) {
    const measured = { "shadow.heightRange": r.range };
    const shares = r.frames.map((f) => f.mask.share);
    const share = Math.max(...shares);
    measured["shadow.share"] = share;
    measured["shadow.depth"] = Math.min(...r.frames.map((f) => f.mask.depth));
    r.frames.forEach((f, k) => {
        measured[`shadow.share.${k}`] = f.mask.share;
        measured[`shadow.depth.${k}`] = f.mask.depth;
        measured[`shadow.predicted.${k}`] = f.predicted;
    });
    const pct = (v) => `${round(100 * v, 2)}%`;
    const darkens = `the light's shadow darkens ${pct(share)} of the frame by more than ${lim.dark}`;
    const fail = (why) => ({ status: "fail", line: `shadow FAIL (${why})`, measured });
    const partial = (why) => ({ status: "partial", line: `shadow PARTIAL (${why})`, measured });
    if (r.range <= lim.minRelief) {
        if (share >= lim.none)
            return fail(`the sheet is flat (height range ${round(r.range, 5)}, at or under ${lim.minRelief}), yet ${darkens}, at or over ${lim.none}: a shadow where nothing is raised`);
        return partial(`the sheet is flat (height range ${round(r.range, 5)}, at or under ${lim.minRelief}): nothing is raised to cast a shadow, so there is none to judge; ${darkens}, under ${lim.none}`);
    }
    const blocks = r.frames.map((f) => f.predicted >= lim.none);
    const blocked = r.frames.map((f) => pct(f.predicted)).join(" and ");
    if (!blocks.some(Boolean)) {
        if (share >= lim.none)
            return fail(`nothing on the sheet blocks the light (its height shades ${blocked} of the frame at the two test positions, under ${lim.none}), yet ${darkens}: a shadow where nothing is raised enough to cast one`);
        return partial(`nothing on the sheet blocks the light at either test position (its height shades ${blocked} of the frame, under ${lim.none}), so there is no shadow to judge; ${darkens}`);
    }
    if (!blocks.every(Boolean))
        return partial(`the sheet's height blocks the light at test position ${blocks[0] ? 0 : 1} only (it shades ${blocked} of the frame), so the shadow's move cannot be read`);
    const problems = [];
    const unread = [];
    const sides = [];
    r.frames.forEach((f, k) => {
        if (f.mask.share < lim.none) {
            problems.push(`at test position ${k} the light casts no shadow: it darkens ${pct(f.mask.share)} of the frame by more than ${lim.dark} (its deepest darkening ${round(f.mask.depth, 3)}), where the sheet's height blocks it over ${pct(f.predicted)}`);
            return;
        }
        const c = f.mask.centroid;
        if (!c || !f.raised || !f.away) {
            unread.push(`at test position ${k} the light gives no direction away from it at the raised region, so the shadow's side cannot be read`);
            return;
        }
        const side = (c[0] - f.raised[0]) * f.away[0] + (c[1] - f.raised[1]) * f.away[1];
        measured[`shadow.side.${k}`] = side;
        sides.push(`${round(side, 1)}`);
        if (side <= 0)
            problems.push(`at test position ${k} the shadow's centroid sits ${round(-side, 1)} px toward the light from the raised region's centroid: it falls on the light's side, not the far side`);
    });
    const [c0, c1] = r.frames.map((f) => (f.mask.share >= lim.none ? f.mask.centroid : null));
    const ml = Math.hypot(r.move[0], r.move[1]);
    let moved = "";
    if (c0 && c1) {
        if (ml < 1e-9)
            unread.push("the light's test positions do not move it across the frame, so the shadow's move cannot be read");
        else {
            const shift = -((c1[0] - c0[0]) * r.move[0] + (c1[1] - c0[1]) * r.move[1]) / ml;
            measured["shadow.shift"] = shift;
            moved = `moves ${round(shift, 1)} px against the light's move`;
            if (shift < lim.shift)
                problems.push(`between the test positions the shadow's centroid moves ${round(shift, 1)} px against the light's move, under ${lim.shift}: it does not move the other way as the light moves`);
        }
    }
    if (problems.length)
        return fail(problems.join("; "));
    if (unread.length)
        return partial(unread.join("; "));
    // A pass needs both sides and the move read; a mask under relight.shadowNone has already failed above.
    if (sides.length < 2 || measured["shadow.shift"] === undefined)
        return partial("the shadow's side and its move could not both be read");
    return {
        status: "pass",
        line: `shadow pass (the shadow falls on the far side of the raised region (${sides.join(" and ")} px) and ${moved}; it covers ${shares.map(pct).join(" and ")} of the frame, its deepest darkening ${round(measured["shadow.depth"], 3)})`,
        measured,
    };
}
async function shadow(c) {
    const i = c.lights.findIndex((l) => typeof l.props.shadow === "object" && l.props.shadow !== null);
    if (i < 0)
        return { status: "partial", line: "shadow PARTIAL (no light casts a shadow: none has a shadow option, so there is no shadow to read)", measured: {} };
    const declared = c.lights[i].props.shadow;
    // The bare ground receives the shadow only with `shadow.ground` on (shade.ts PK_SHADOW_GROUND).
    const groundOn = declared.ground === true;
    const sheet = await c.h.hook("__paint.sheet()");
    const range = Math.max(...sheet.height) - Math.min(...sheet.height);
    const dark = c.th("relight.shadowDark");
    const frames = [];
    const at = [];
    const dirs = [];
    let size = [0, 0];
    for (const step of [0, 1]) {
        await c.h.hook(`__paint.moveLight(${i}, ${step})`);
        const on = await shot(c);
        size = [on.w, on.h];
        await c.h.hook(`__paint.setLight(${i}, { shadow: null })`);
        const off = await shot(c);
        await c.h.hook(`__paint.setLight(${i}, { shadow: ${json(declared)} })`);
        const props = (await c.h.hook("__paint.lights()"))[i].props;
        // A key gives a direction (`dir`); a lamp a bulb (`at`).
        const dir = Array.isArray(props.dir) ? props.dir : null;
        const bulb = dir ? null : props.at;
        if (dir)
            dirs.push(dir);
        else
            at.push(bulb);
        const geo = await c.h.hook(`(() => { const s = __paint.stats(); const g = { ...__paint.sheetRegion(0, 0, innerWidth, innerHeight), w: s.sheetW, h: s.sheetH }; return (${shadowOracle.toString()})(g, ${json({ ...(dir ? { dir } : { at: bulb }), ground: groundOn })}, ${json(SHADOW_MARCH)}); })()`);
        const raised = geo.raised ? [geo.raised[0] * on.w, geo.raised[1] * on.h] : null;
        let away = null;
        if (dir)
            away = [-dir[0], dir[1]];
        else if (raised)
            away = [raised[0] - bulb[0] * on.w, raised[1] - bulb[1] * on.h];
        const al = away ? Math.hypot(away[0], away[1]) : 0;
        frames.push({ mask: shadowMask(on, off, dark), predicted: geo.share, raised, away: al > 1e-9 ? [away[0] / al, away[1] / al] : null });
    }
    const move = dirs.length === 2 ? [dirs[1][0] - dirs[0][0], -(dirs[1][1] - dirs[0][1])] : [(at[1][0] - at[0][0]) * size[0], (at[1][1] - at[0][1]) * size[1]];
    return shadowVerdict({ range, frames, move }, { dark, shift: c.th("relight.shadowShift"), none: c.th("relight.shadowNone"), minRelief: c.th("relight.minRelief") });
}
/** Degrees per groove-direction bin of the iridescence law's groups: the spec's "same groove" is within 5 degrees. */
export const GROOVE_BIN = 5;
/** Degrees per normal bin (the normal's tilt about each sheet axis): the spec's "same normal" is within 2 degrees. */
export const NORMAL_BIN = 2;
/** Groove-share bin (the direction's length, the grating's share of the highlight): a graded groove is another groove. */
export const GROOVE_SHARE_BIN = 0.1;
/**
 * (b)'s grating bin: u = |X.(l + v)| in steps of 0.0025. The first order shows lambda = d u, so at the widest spacing
 * the spec allows (2.0 um, materials.foil FOIL_SPACING) one step moves it 2000 x 0.0025 = 5 nm, one step of the CIE
 * 1931 table (5 nm). Task 14 fix round 2: the plan's 2-degree normal bin was too coarse for a grating, as 2 degrees of
 * normal moves the first order about 50 nm.
 */
export const GRATING_U_BIN = 0.0025;
/**
 * (d): two groups' grooves are apart when their directions differ by at least this many degrees. Plan: the plan's
 * Task 14 sets 30 (the spec says only "different groove directions"). The comparison runs on the 5-degree bin
 * centres (GROOVE_BIN), so two pixels' true grooves at the cut differ by about 25 to 35 degrees; "at least" because on
 * bin centres "more than 30" would mean 35 or more, a boundary the plan never set.
 */
export const GROOVE_APART = 30;
/**
 * The fewest frame pixels a group needs to be judged in (b) and (d). Builder: 400 px puts at least about 200 in each
 * half (b) compares, so the film grain and the finish's grain (zero-mean, a few pixels across) average out of a half's
 * mean; a smaller group (a rim's slope ring, a corner) is left out of (b) and (d), never failed by them.
 */
export const GROOVE_MIN_PX = 400;
/**
 * The distance of two OKLab colours in the chroma plane alone (a, b; lightness left out). The iridescence law reads
 * (a), (b) and (d) here: a grating's colour is hue and chroma, and a groove-aware white highlight (a band flattened to
 * its luminance, or an anisotropic metal) moves and differs in lightness alone (test/faults/iridescence-white).
 */
export const chromaDistance = (p, q) => Math.hypot(p[1] - q[1], p[2] - q[2]);
/**
 * (a) per point (Task 14 round 4, the owner: "Per-point change"): the mean, over the pixels `keep` holds, of each pixel's
 * own chroma distance (`chromaDistance`) between frames `a` and `b`. Not the change of the mean: two frames whose pixels
 * trade colours keep their mean and still read their whole change here. On the same frames it is never under the
 * change of the mean (the norm of a mean is at most the mean of the norms). 0 when no pixel is kept.
 */
export function pointChromaShift(a, b, keep) {
    let s = 0;
    let n = 0;
    for (let p = 0; p < a.w * a.h; p++) {
        if (!keep(p))
            continue;
        const pa = srgbToOklab(a.data[p * 4], a.data[p * 4 + 1], a.data[p * 4 + 2]);
        const pb = srgbToOklab(b.data[p * 4], b.data[p * 4 + 1], b.data[p * 4 + 2]);
        s += Math.hypot(pa[1] - pb[1], pa[2] - pb[2]);
        n++;
    }
    return n ? s / n : 0;
}
/**
 * The iridescence law's foil texels and their groups. A texel is foil when its slot is in `slots` (a material that
 * declares the law), its coverage is at least `full` and it holds no ink (ink covers the foil: materials.foil). Its
 * group is its groove direction (the direction image's angle, 0..180 degrees, binned by `bin.groove`; a sheet with no
 * direction image runs every groove along +x at share 1, as the shade pass does), its groove share (the direction's
 * length, capped at 1, binned by `bin.share`; share 0 has no grooves and groove 0) and its normal's tilt about each
 * sheet axis (atan of the height's central-difference slope in short-side units, as the shade pass's normal, binned
 * by `bin.normal`). `grid` is the sheet at its own resolution, rows top down, as `__paint.sheetRegion` reads it.
 *
 * With `light` (`l` the unit direction to the key in the sheet's frame: x right, y up, z toward the viewer; the eye v
 * is +z; `turn`, the tilt's rotation as rows, `turnOfTilt`, turns the surface's normal and grooves, none the identity),
 * each texel also gets its grating bin for (b): from the grating equation for a
 * reflection grating, d (sin theta_i + sin theta_m) = m lambda (Stam, "Diffraction Shaders", GPU Gems chapter 8), the
 * two sines across the grooves are X.l and X.v, so the order m shows lambda = d |X.(l + v)| / m, and every point with
 * the same groove spacing and the same u = |X.(l + v)| shows the same wavelengths. X is the unit direction across the
 * grooves in the surface's tangent plane: the normal n from the height's central difference, the groove G from the
 * direction image laid into that plane (G - n (G.n), normalised), and X = n x G, n and G first turned by `turn` (the
 * card turned under a fixed eye and light). u is binned by `bin.u`. Written here
 * from the equation and the frame's own geometry, never from the engine's grating code: a bug in the engine must not
 * also live in its judge. Self-contained (no imports): the law runs its source in the page.
 */
export function foilTexels(grid, slots, full, bin, light) {
    const w = grid.w;
    const h = grid.h;
    const side = Math.min(w, h);
    const deg = 180 / Math.PI;
    const id = new Array(w * h).fill(-1);
    const uid = new Array(w * h).fill(-1);
    const groups = [];
    const ugroups = [];
    const keys = new Map();
    const ukeys = new Map();
    const at = (x, y) => grid.height[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
    const grooveBins = Math.round(180 / bin.groove);
    // l + v with the eye at +z.
    const lv = light ? [light.l[0], light.l[1], light.l[2] + 1] : [0, 0, 0];
    const R = light?.turn ?? [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const turned = (v) => R.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const k = y * w + x;
            if (!slots.includes(Math.round(grid.slot[k])) || !(grid.coverage[k] >= full) || grid.ink[k] > 0)
                continue;
            const d = grid.dir ? grid.dir[k] : [1, 0];
            const share = Math.round(Math.min(1, Math.hypot(d[0], d[1])) / bin.share);
            let a = (Math.atan2(d[1], d[0]) * deg) % 180;
            if (a < 0)
                a += 180;
            const groove = share > 0 ? Math.round(a / bin.groove) % grooveBins : 0;
            // Slopes in short-side units, x right and y up (rows run top down here, so up the sheet is the row above).
            const sx = (at(x + 1, y) - at(x - 1, y)) * side * 0.5;
            const sy = (at(x, y - 1) - at(x, y + 1)) * side * 0.5;
            const nx = Math.round((Math.atan(sx) * deg) / bin.normal);
            const ny = Math.round((Math.atan(sy) * deg) / bin.normal);
            const key = `${groove}|${share}|${nx}|${ny}`;
            let g = keys.get(key);
            if (g === undefined) {
                g = groups.length;
                keys.set(key, g);
                groups.push({ groove: groove * bin.groove, share: share * bin.share, normal: [nx * bin.normal, ny * bin.normal] });
            }
            id[k] = g;
            if (!light)
                continue;
            // The grating's u = |X.(l + v)| at this texel (see above); 0 where there are no grooves.
            let ub = 0;
            if (share > 0) {
                const nl = Math.hypot(sx, sy, 1);
                const n = turned([-sx / nl, -sy / nl, 1 / nl]);
                const gl = Math.hypot(d[0], d[1]);
                const G = turned([d[0] / gl, d[1] / gl, 0]);
                const gn = G[0] * n[0] + G[1] * n[1] + G[2] * n[2];
                const t = [G[0] - n[0] * gn, G[1] - n[1] * gn, G[2] - n[2] * gn];
                const tl = Math.hypot(t[0], t[1], t[2]);
                const along = [t[0] / tl, t[1] / tl, t[2] / tl];
                const X = [n[1] * along[2] - n[2] * along[1], n[2] * along[0] - n[0] * along[2], n[0] * along[1] - n[1] * along[0]];
                ub = Math.round(Math.abs(X[0] * lv[0] + X[1] * lv[1] + X[2] * lv[2]) / bin.u);
            }
            const ukey = `${groove}|${share}|${ub}`;
            let q = ukeys.get(ukey);
            if (q === undefined) {
                q = ugroups.length;
                ukeys.set(ukey, q);
                ugroups.push({ groove: groove * bin.groove, share: share * bin.share, u: ub * bin.u });
            }
            uid[k] = q;
        }
    return light ? { id, groups, uid, ugroups, w, h } : { id, groups, w, h };
}
/** The sheet texel under frame pixel `p` of a `fw` x `fh` frame, as the highlight law maps them. */
const texelOf = (t, p, fw, fh) => Math.floor((Math.floor(p / fw) * t.h) / fh) * t.w + Math.floor(((p % fw) * t.w) / fw);
/**
 * Each frame pixel's foil group (-1: not foil), frame pixels mapped to sheet texels as the highlight law maps them.
 * `ids` is the per-texel group list to map (`t.id` unless given: `t.uid` for (b)).
 */
export function pixelGroups(t, fw, fh, ids = t.id) {
    const out = new Int32Array(fw * fh);
    for (let p = 0; p < out.length; p++)
        out[p] = ids[texelOf(t, p, fw, fh)];
    return out;
}
/**
 * Per texel, 1 where two reads of the sheet (`__paint.sheetRegion`, same region, `w` x `h`, rows top down) agree
 * exactly in height, coverage, slot, ink, direction and param (a film's thickness) at that texel and at every texel within `reach` of it (a
 * square), else 0: the surface held there between them. The neighbours count because a pixel's colour reads them: the
 * shade pass's normal is a central difference over +-1 texel (+-3 on the 8-bit sheet) and the sheet is sampled
 * bilinearly, so a texel whose own height held by chance while the ground around it moved still turns. A still field
 * draws the same values again, so exact equality; a drifting one changes them. Self-contained (no imports): the law
 * runs its source in the page.
 */
export function sheetHeld(a, b, w, h, reach) {
    const n = w * h;
    const same = new Array(n).fill(0);
    for (let k = 0; k < n; k++) {
        let eq = a.height[k] === b.height[k] && a.coverage[k] === b.coverage[k] && a.slot[k] === b.slot[k] && a.ink[k] === b.ink[k];
        if (eq && (a.dir || b.dir))
            eq = !!a.dir && !!b.dir && a.dir[k][0] === b.dir[k][0] && a.dir[k][1] === b.dir[k][1];
        if (eq && (a.param || b.param))
            eq = !!a.param && !!b.param && a.param[k] === b.param[k];
        same[k] = eq ? 1 : 0;
    }
    // Held only where the whole square of side 2 reach + 1 held: a row pass, then a column pass (texels past the edge
    // do not count against it).
    const rows = new Array(n).fill(0);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            let all = 1;
            for (let d = -reach; d <= reach && all; d++) {
                const xx = x + d;
                if (xx >= 0 && xx < w && same[y * w + xx] === 0)
                    all = 0;
            }
            rows[y * w + x] = all;
        }
    const out = new Array(n).fill(0);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            let all = 1;
            for (let d = -reach; d <= reach && all; d++) {
                const yy = y + d;
                if (yy >= 0 && yy < h && rows[yy * w + x] === 0)
                    all = 0;
            }
            out[y * w + x] = all;
        }
    return out;
}
/** Texels around a foil texel that must hold for (c): the 8-bit sheet's normal stencil, +-3 (shade.ts K), covers the float sheet's +-1 and the bilinear sample. */
export const HELD_REACH = 3;
/** The difference in degrees of two groove directions, which are lines (0 and 180 are one direction): 0..90. */
export const grooveApart = (a, b) => {
    const d = Math.abs(a - b) % 180;
    return Math.min(d, 180 - d);
};
export function groupColours(f, ids, count) {
    const n = new Float64Array(count);
    const xs = Array.from({ length: count }, () => new Float64Array(f.w));
    const ys = Array.from({ length: count }, () => new Float64Array(f.h));
    for (let p = 0; p < ids.length; p++) {
        const g = ids[p];
        if (g < 0)
            continue;
        n[g]++;
        xs[g][p % f.w]++;
        ys[g][Math.floor(p / f.w)]++;
    }
    // The median column and row: the first whose running count reaches half the group.
    const median = (hist, total) => {
        let seen = 0;
        for (let i = 0; i < hist.length; i++)
            if ((seen += hist[i]) >= total / 2)
                return i;
        return hist.length - 1;
    };
    const mx = Array.from(n, (total, g) => median(xs[g], total));
    const my = Array.from(n, (total, g) => median(ys[g], total));
    // Per group: sums of L, a, b and counts for the whole, and the halves left / right (x <= median or not) and top /
    // bottom (y <= median or not).
    const sum = new Float64Array(count * 5 * 4);
    for (let p = 0; p < ids.length; p++) {
        const g = ids[p];
        if (g < 0)
            continue;
        const lab = srgbToOklab(f.data[p * 4], f.data[p * 4 + 1], f.data[p * 4 + 2]);
        const x = p % f.w;
        const y = Math.floor(p / f.w);
        for (const part of [0, x <= mx[g] ? 1 : 2, y <= my[g] ? 3 : 4]) {
            const o = (g * 5 + part) * 4;
            sum[o] += lab[0];
            sum[o + 1] += lab[1];
            sum[o + 2] += lab[2];
            sum[o + 3]++;
        }
    }
    const meanOf = (g, part) => {
        const o = (g * 5 + part) * 4;
        const k = sum[o + 3];
        return k > 0 ? [sum[o] / k, sum[o + 1] / k, sum[o + 2] / k] : null;
    };
    const halfMin = GROOVE_MIN_PX / 4;
    return Array.from({ length: count }, (_, g) => {
        const splits = [];
        for (const [a, b] of [[1, 2], [3, 4]]) {
            const pa = meanOf(g, a);
            const pb = meanOf(g, b);
            if (pa && pb && sum[(g * 5 + a) * 4 + 3] >= halfMin && sum[(g * 5 + b) * 4 + 3] >= halfMin)
                splits.push(chromaDistance(pa, pb));
        }
        return { n: n[g], mean: meanOf(g, 0) ?? [0, 0, 0], spread: splits.length ? Math.max(...splits) : null };
    });
}
/** (b): the group that differs most within itself, of the groups of at least `GROOVE_MIN_PX` pixels; null when none can be read. */
export function grooveMatch(colours) {
    let best = null;
    colours.forEach((c, g) => {
        if (c.n < GROOVE_MIN_PX || c.spread === null)
            return;
        if (!best || c.spread > best.spread)
            best = { spread: c.spread, group: g };
    });
    return best;
}
/**
 * (d): the largest grooved group (share above 0) of at least `GROOVE_MIN_PX` pixels, and the largest grooved group of
 * that size with the same normal and groove share whose groove direction is at least `GROOVE_APART` degrees from it,
 * so only the groove differs between them; the chroma distance (`chromaDistance`) of their mean colours. Null when no such pair exists.
 */
export function grooveApartPair(groups, colours) {
    const order = groups
        .map((g, k) => ({ g, k, n: colours[k].n }))
        .filter((e) => e.g.share > 0 && e.n >= GROOVE_MIN_PX)
        .sort((p, q) => q.n - p.n || p.k - q.k);
    const first = order[0];
    if (!first)
        return null;
    const same = (p, q) => p.share === q.share && p.normal[0] === q.normal[0] && p.normal[1] === q.normal[1];
    const second = order.find((e) => e !== first && same(e.g, first.g) && grooveApart(e.g.groove, first.g.groove) >= GROOVE_APART - 1e-9);
    if (!second)
        return null;
    return { dist: chromaDistance(colours[first.k].mean, colours[second.k].mean), first: first.k, second: second.k, angle: grooveApart(first.g.groove, second.g.groove) };
}
/**
 * (e)'s span in u: two grating bins of one groove region must be at least this far apart to be compared. Task 14 fix
 * round 3: at the narrowest spacing the spec allows (1.0 um, materials.foil FOIL_SPACING) the first order moves
 * 1000 x 0.02 = 20 nm, four steps of the CIE 1931 table (5 nm): a shift a grating's colour shows.
 */
export const U_SPAN = 0.02;
/**
 * (e): in each groove region (groove bin and share above 0), the most-populated grating bin of at least
 * `GROOVE_MIN_PX` pixels, and the most-populated such bin at least `U_SPAN` from it in u; the chroma distance of their
 * mean colours. The smallest over the regions that have such a pair decides; null when no region spans `U_SPAN`
 * (a flat foil under a directional key has one u per groove, so there is nothing to compare).
 */
export function uSpread(ugroups, colours) {
    const regions = new Map();
    ugroups.forEach((g, k) => {
        if (g.share <= 0 || colours[k].n < GROOVE_MIN_PX)
            return;
        const key = `${g.groove}|${g.share}`;
        regions.set(key, [...(regions.get(key) ?? []), k]);
    });
    let worst = null;
    for (const ks of regions.values()) {
        const order = [...ks].sort((p, q) => colours[q].n - colours[p].n || p - q);
        const first = order[0];
        const second = order.find((k) => Math.abs(ugroups[k].u - ugroups[first].u) >= U_SPAN - 1e-9);
        if (second === undefined)
            continue;
        const dist = chromaDistance(colours[first].mean, colours[second].mean);
        if (!worst || dist < worst.dist)
            worst = { dist, du: Math.abs(ugroups[second].u - ugroups[first].u), groove: ugroups[first].groove };
    }
    return worst;
}
/** The line (e) gives when no groove spans `U_SPAN` in u: not read, the verdict comes from (a) to (d). */
export const E_NOT_READ = `(e) not read: no groove spans ${U_SPAN} in u`;
/**
 * The iridescence law's verdict (header, iridescence): (a) to (e) on the reading. A fail line lists only the
 * conditions that fail, each with its reading; (e) unread is said in a pass or partial line and decides nothing.
 */
export function iridescenceVerdict(r, lim, mover = "the key light") {
    const measured = { "iridescence.foil": r.foil };
    const partial = (why) => ({ status: "partial", line: `iridescence PARTIAL (${why})`, measured });
    if (r.foil === 0)
        return partial("no pixel on the frame is a fully covered, uninked texel of a material that declares the iridescence law, so there is no foil to read");
    measured["iridescence.light"] = r.light;
    if (r.tilt !== null)
        measured["iridescence.tilt"] = r.tilt;
    if (r.time !== null)
        measured["iridescence.time"] = r.time;
    measured["iridescence.still"] = r.still;
    if (r.match) {
        measured["iridescence.match"] = r.match.spread;
        measured["iridescence.match.groove"] = r.match.groove;
        measured["iridescence.match.px"] = r.match.n;
        measured["iridescence.match.u"] = r.match.u;
    }
    if (r.apart) {
        measured["iridescence.apart"] = r.apart.dist;
        measured["iridescence.apart.angle"] = r.apart.angle;
    }
    if (r.spread) {
        measured["iridescence.spread"] = r.spread.dist;
        measured["iridescence.spread.du"] = r.spread.du;
    }
    const problems = [];
    if (r.light <= lim.shift)
        problems.push(`(a) moving ${mover} between its test positions moves the foil's colour ${round(r.light, 4)} per point in OKLab chroma, at or under ${lim.shift}: its colour does not come from the light`);
    if (r.tilt !== null && r.tilt <= lim.shift)
        problems.push(`(a) tilting the surface by half its max moves the foil's colour ${round(r.tilt, 4)} per point in OKLab chroma, at or under ${lim.shift}: its colour does not come from the view`);
    if (r.time !== null && r.time >= lim.band)
        problems.push(`(c) with nothing moved (the surface still under ${round(100 * r.still, 1)}% of the foil), the foil changes ${round(r.time, 4)} (mean absolute 8-bit difference) from t to t + 1, at or over ${lim.band}: its colour moves with the clock`);
    if (r.match && r.match.spread >= lim.match)
        problems.push(`(b) foil of one groove (${r.match.groove} degrees), share and grating u (${round(r.match.u, 4)}) differs ${round(r.match.spread, 4)} in OKLab chroma between its halves, at or over ${lim.match}: under one key its colour is not a function of its groove and u`);
    if (r.apart && r.apart.dist <= lim.apart)
        problems.push(`(d) the two largest foil groups whose grooves run ${round(r.apart.angle, 1)} degrees apart (${r.apart.grooves[0]} and ${r.apart.grooves[1]}) differ ${round(r.apart.dist, 4)} in OKLab chroma, at or under ${lim.apart}: its colour ignores the groove direction`);
    if (r.spread && r.spread.dist <= lim.spread)
        problems.push(`(e) two grating bins of one groove (${r.spread.groove} degrees) ${round(r.spread.du, 4)} apart in u differ ${round(r.spread.dist, 4)} in OKLab chroma, at or under ${lim.spread}: its colour does not follow the grating's u across the surface`);
    if (problems.length)
        return { status: "fail", line: `iridescence FAIL (${problems.join("; ")})`, measured };
    const eLine = r.spread ? `(e) two bins ${round(r.spread.du, 4)} apart in u differ ${round(r.spread.dist, 4)}` : E_NOT_READ;
    const tilt = r.tilt === null ? "the page does not tilt" : `tilting it ${round(r.tilt, 4)}`;
    const time = r.time === null ? "the surface moves with the clock" : `time ${round(r.time, 4)}`;
    const facts = `moving ${mover} moves the foil's colour ${round(r.light, 4)} per point, ${tilt}, ${time}; ${eLine}`;
    if (r.time === null)
        return partial(`no foil texel keeps its height, direction, coverage, slot and ink from t to t + 1: the surface moves with the clock, so (c) cannot be read; ${facts}`);
    if (!r.match)
        return partial(`no foil group of one groove, share and grating u holds ${GROOVE_MIN_PX} pixels in two readable halves, so (b) cannot be read; ${facts}`);
    if (!r.apart)
        return partial(`the foil has no two groups of at least ${GROOVE_MIN_PX} pixels, one normal and one groove share, whose grooves run ${GROOVE_APART} degrees or more apart, so (d) cannot be read; ${facts}`);
    return {
        status: "pass",
        line: `iridescence pass (${facts}; one groove's halves differ at most ${round(r.match.spread, 4)}, two grooves ${round(r.apart.angle, 1)} degrees apart ${round(r.apart.dist, 4)})`,
        measured,
    };
}
/**
 * The rotation that turns the surface for a tilt [a, b] in degrees, as REFERENCE.md documents the tilt (Task 16): b
 * about the horizontal axis (the top goes away), then a about the vertical one (the right side goes away), so the flat
 * card's normal +z turns to (sin a cos b, sin b, cos a cos b); the eye stays at +z. Rows of the 3 x 3 matrix, in the
 * sheet's frame (x right, y up, z toward the viewer). Written here from that contract, not imported from the engine.
 */
export function turnOfTilt([a, b]) {
    const ra = (a * Math.PI) / 180;
    const rb = (b * Math.PI) / 180;
    const [ca, sa, cb, sb] = [Math.cos(ra), Math.sin(ra), Math.cos(rb), Math.sin(rb)];
    // About the vertical axis by a (z toward +x) after about the horizontal axis by b (z toward +y).
    const ry = [[ca, 0, sa], [0, 1, 0], [-sa, 0, ca]];
    const rx = [[1, 0, 0], [0, cb, sb], [0, -sb, cb]];
    return ry.map((row) => [0, 1, 2].map((j) => row[0] * rx[0][j] + row[1] * rx[1][j] + row[2] * rx[2][j]));
}
/** The foil's mean absolute 8-bit RGB difference between two frames (0..1), over the pixels `keep` holds. */
function meanAbsDiffIn(a, b, keep) {
    let s = 0;
    let n = 0;
    for (let p = 0; p < a.w * a.h; p++) {
        if (!keep(p))
            continue;
        for (let k = 0; k < 3; k++)
            s += Math.abs(a.data[p * 4 + k] - b.data[p * 4 + k]);
        n++;
    }
    return n ? s / (n * 3 * 255) : 0;
}
/** The iridescence law on the page's foil slots (header, iridescence). */
async function iridescenceFoil(c, i, slots) {
    const bin = { groove: GROOVE_BIN, share: GROOVE_SHARE_BIN, normal: NORMAL_BIN, u: GRATING_U_BIN };
    const tex = await c.h.hook(`(() => { const s = __paint.stats(); const g = { ...__paint.sheetRegion(0, 0, innerWidth, innerHeight), w: s.sheetW, h: s.sheetH }; return (${foilTexels.toString()})(g, ${json(slots)}, ${c.th("relight.fullCoverage")}, ${json(bin)}); })()`);
    const opts = await c.h.hook("__paint.tiltOptions()");
    const tilts = opts !== null && opts.max > 0;
    if (tilts)
        await c.h.hook("__paint.setTilt([0, 0])");
    try {
        // (a) the light: the key between its test positions, every other light as declared, no tilt.
        await c.h.hook(`__paint.moveLight(${i}, 0)`);
        const a0 = await shot(c);
        const ids = pixelGroups(tex, a0.w, a0.h);
        const foil = (p) => ids[p] >= 0;
        let count = 0;
        for (let p = 0; p < ids.length; p++)
            if (ids[p] >= 0)
                count++;
        await c.h.hook(`__paint.moveLight(${i}, 1)`);
        const a1 = await shot(c);
        await restore(c);
        const base = await shot(c);
        // (a) the tilt: the view turned by half the page's max about the vertical axis, nothing else moved.
        let tilt = null;
        if (tilts) {
            await c.h.hook(`__paint.setTilt([${opts.max / 2}, 0])`);
            const tipped = await shot(c);
            await c.h.hook("__paint.setTilt([0, 0])");
            tilt = pointChromaShift(base, tipped, foil);
        }
        // (c) the clock: one second on, nothing moved. The lights are held at their place at t (restore() sets the props
        // `__paint.lights()` read at t, so a light whose place is a function of time stands still); a light through water
        // draws its caustic from the clock in its own shader, so it is read through still water (caustic 0). The sheet is
        // read at t and again at t + 1, and (c) is judged only where the surface held.
        for (const [j, l] of c.lights.entries())
            if (l.id === "throughWater")
                await c.h.hook(`__paint.setLight(${j}, { caustic: 0 })`);
        const now = await shot(c);
        await c.h.hook("window.__pkIridSheet = __paint.sheetRegion(0, 0, innerWidth, innerHeight)");
        await c.h.hook(`__paint.setTime(${T + 1})`);
        const later = await shot(c);
        const held = await c.h.hook(`(${sheetHeld.toString()})(window.__pkIridSheet, __paint.sheetRegion(0, 0, innerWidth, innerHeight), ${tex.w}, ${tex.h}, ${HELD_REACH})`);
        await c.h.hook("delete window.__pkIridSheet");
        await c.h.hook(`__paint.setTime(${T})`);
        await restore(c);
        const stillFoil = (p) => foil(p) && held[texelOf(tex, p, a0.w, a0.h)] === 1;
        let still = 0;
        for (let p = 0; p < ids.length; p++)
            if (stillFoil(p))
                still++;
        // (b) and (d): under the key alone, at detail 0 (the film grain tilts the engine's normal at detail above 0 and is
        // not in the sheet's height, so the law's u could not see it). The sheet is read again there, with each foil
        // texel's grating bin u from the key's direction and the view as drawn.
        for (const j of c.lights.keys())
            if (j !== i)
                await c.h.hook(`__paint.setLight(${j}, { level: 0 })`);
        const detail = await c.h.hook("__paint.detail()");
        await c.h.hook("__paint.setDetail(0)");
        let m;
        let d;
        let e;
        let geo;
        let mColours;
        try {
            const dir = (await c.h.hook("__paint.lights()"))[i].props.dir;
            const dl = Math.hypot(dir[0], dir[1], dir[2]);
            const light = { l: [dir[0] / dl, dir[1] / dl, dir[2] / dl], turn: turnOfTilt(await c.h.hook("__paint.tilt()")) };
            const ubin = { groove: GROOVE_BIN, share: GROOVE_SHARE_BIN, normal: NORMAL_BIN, u: GRATING_U_BIN };
            geo = await c.h.hook(`(() => { const s = __paint.stats(); const g = { ...__paint.sheetRegion(0, 0, innerWidth, innerHeight), w: s.sheetW, h: s.sheetH }; return (${foilTexels.toString()})(g, ${json(slots)}, ${c.th("relight.fullCoverage")}, ${json(ubin)}, ${json(light)}); })()`);
            const keyed = await shot(c);
            mColours = groupColours(keyed, pixelGroups(geo, keyed.w, keyed.h, geo.uid), geo.ugroups.length);
            m = grooveMatch(mColours);
            e = uSpread(geo.ugroups, mColours);
            const dColours = groupColours(keyed, pixelGroups(geo, keyed.w, keyed.h), geo.groups.length);
            d = grooveApartPair(geo.groups, dColours);
        }
        finally {
            await c.h.hook(`__paint.setDetail(${json(detail)})`);
        }
        return iridescenceVerdict({
            foil: count,
            light: pointChromaShift(a0, a1, foil),
            tilt,
            time: still > 0 ? meanAbsDiffIn(now, later, stillFoil) : null,
            still: count ? still / count : 0,
            match: m ? { spread: m.spread, groove: geo.ugroups[m.group].groove, u: geo.ugroups[m.group].u, n: mColours[m.group].n } : null,
            apart: d ? { dist: d.dist, grooves: [geo.groups[d.first].groove, geo.groups[d.second].groove], angle: d.angle } : null,
            spread: e,
        }, { shift: c.th("relight.iridescenceShift"), match: c.th("relight.iridescenceMatch"), apart: c.th("relight.iridescenceApart"), band: c.th("relight.ambientBand"), spread: c.th("relight.iridescenceSpread") }, `${c.lights[i].id} ${i}`);
    }
    finally {
        if (tilts)
            await c.h.hook("__paint.setTilt(null)");
    }
}
/**
 * The film branch of the iridescence law (Phase 2 Task 18, task-18-law-design.md). A film's colour is set by its
 * optical path difference (OPD), so the law bins the film by OPD and reads the highlight alone. Every number here is
 * geometry, a citation or a builder value named as one. The limits are `FilmLimits`: this file holds none of their
 * values.
 */
/** OPD per bin, nm: 5 nm of first-order bright wavelength at phase 0, one step of the CIE 1931 table. */
export const FILM_OPD_BIN = 5;
/** Degrees position B turns the key from position A in the x-z plane. Builder: it sets no limit, as (e) is a ratio. */
export const FILM_KEY_TURN = 30;
/**
 * The dimmest mean highlight a bin or a half is read at, linear light. Builder: under it, rounding decides the tint.
 */
export const FILM_SPEC_MIN = 1 / 255;
/** The finish's shoulder starts here (finish.ts `_shoulder`): over it a frame is no longer linear. */
const FILM_KNEE = 0.8;
/** (d)'s distance along the ramp, nm of OPD: half a wave at 550 nm, the research file's coating example. Builder. */
export const FILM_APART = 275;
/** (d) reads a slot whose OPD spans at least this, nm: four bins. */
export const FILM_MIN_SPAN = 20;
/** The line (e) gives when it is not read: the verdict then comes from (a) to (d). */
export const FILM_E_NOT_READ = "(e) not read: the key's turn moves the film along its own ramp too little to tell from the page's own noise";
/**
 * The film's optical path difference in nm, at thickness `d` nm and index `ior` under a key at direction `l` (outside
 * index 1): OPD = 2 ior d cos(theta_t). The eye is at +z and a rough film shows the facets whose normal is the half
 * vector, so cos^2(theta_i) = (v.h)^2 = (1 + l.z) / 2 for a unit l, and Snell's law gives theta_t. Only the key's angle
 * off the eye enters. Written from the equation, never from the engine's film code.
 */
export function filmOpd(d, ior, l) {
    const cos2 = (1 + l[2] / Math.hypot(l[0], l[1], l[2])) / 2;
    return 2 * ior * d * Math.sqrt(Math.max(0, 1 - (1 - cos2) / (ior * ior)));
}
/**
 * The iridescence law's film texels: a texel is film when its slot is in `slots`, its coverage is at least `full` and
 * it holds no ink (foil's rule). The normal comes from the height's central difference in short-side units, as
 * `foilTexels`. Self-contained (no imports): the law runs its source in the page.
 */
export function filmTexels(grid, slots, full) {
    const w = grid.w;
    const h = grid.h;
    const side = Math.min(w, h);
    const at = (x, y) => grid.height[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
    const out = { k: [], slot: [], param: [], nv: [], w, h };
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const k = y * w + x;
            const slot = Math.round(grid.slot[k]);
            if (!slots.includes(slot) || !(grid.coverage[k] >= full) || grid.ink[k] > 0)
                continue;
            const sx = (at(x + 1, y) - at(x - 1, y)) * side * 0.5;
            const sy = (at(x, y - 1) - at(x, y + 1)) * side * 0.5;
            out.k.push(k);
            out.slot.push(slot);
            out.param.push(grid.param[k]);
            out.nv.push(1 / Math.hypot(sx, sy, 1));
        }
    return out;
}
/**
 * The key's two positions: A the declared direction (unit), B that direction rotated `turn` degrees in the x-z plane,
 * toward the side of its x (+x when x is 0), or back toward the eye when the key is over 45 degrees off it.
 */
export function filmKeyTurn(dir, turn = FILM_KEY_TURN) {
    const len = Math.hypot(dir[0], dir[1], dir[2]);
    const a = [dir[0] / len, dir[1] / len, dir[2] / len];
    const side = a[0] < 0 ? -1 : 1;
    const off = (Math.acos(Math.min(1, a[2])) * 180) / Math.PI;
    const t = ((off > 45 ? -side : side) * turn * Math.PI) / 180;
    const [c, s] = [Math.cos(t), Math.sin(t)];
    return { a, b: [a[0] * c + a[2] * s, a[1], a[2] * c - a[0] * s] };
}
/**
 * The tint of a linear colour: (a / L, b / L) in OKLab. OKLab is a cube root, so a scale moves L, a and b alike and the
 * tint holds: the lobe's brightness across a bin does not read as colour.
 */
export function filmTint(c) {
    const [L, a, b] = linearToOklab([c[0], c[1], c[2]]);
    return L > 0 ? [a / L, b / L] : [0, 0];
}
const tintDistance = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const srgbEncode = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
/**
 * One 8-bit tint step of a bin: the largest tint change that one encoded level on one channel of the on-frame makes on
 * the bin's mean highlight `h`. `on` is the bin's mean on-frame colour, linear.
 */
export function filmTintStep(h, on) {
    const tint = filmTint(h);
    let worst = 0;
    for (let k = 0; k < 3; k++) {
        const e = srgbEncode(Math.max(0, on[k]));
        for (const to of [Math.min(255, e + 1), Math.max(0, e - 1)]) {
            const moved = [h[0], h[1], h[2]];
            moved[k] = moved[k] + srgbToLinear(to) - srgbToLinear(e);
            worst = Math.max(worst, tintDistance(tint, filmTint(moved)));
        }
    }
    return worst;
}
/**
 * Adds pixel `p`'s highlight (on minus off, linear) and on-frame colour to `sum`. False, adding nothing, over the
 * knee.
 */
function filmAdd(sum, on, off, p) {
    const o = p * 4;
    for (let k = 0; k < 3; k++)
        if (srgbToLinear(on.data[o + k]) > FILM_KNEE || srgbToLinear(off.data[o + k]) > FILM_KNEE)
            return false;
    for (let k = 0; k < 3; k++) {
        const v = srgbToLinear(on.data[o + k]);
        sum[k] = sum[k] + v - srgbToLinear(off.data[o + k]);
        sum[k + 3] = sum[k + 3] + v;
    }
    sum[6] = sum[6] + 1;
    return true;
}
function filmPlace(sum) {
    const n = sum[6];
    const d = n || 1;
    const h = [sum[0] / d, sum[1] / d, sum[2] / d];
    return { h, on: [sum[3] / d, sum[4] / d, sum[5] / d], n, lum: 0.2126 * h[0] + 0.7152 * h[1] + 0.0722 * h[2] };
}
/** The value at or under which half the sorted list lies, as `groupColours` takes its median column. */
const lowMedian = (v) => [...v].sort((p, q) => p - q)[Math.ceil(v.length / 2) - 1];
/**
 * A bin counts at a position with at least `GROOVE_MIN_PX` readable pixels and a mean highlight of at least
 * `FILM_SPEC_MIN`.
 */
const filmCounts = (h) => h.n >= GROOVE_MIN_PX && h.lum >= FILM_SPEC_MIN;
/**
 * The film's bins, by slot and round(OPD at A / `FILM_OPD_BIN`), sorted by slot and OPD: what (b), (d) and (e) read.
 * A pixel over the knee at A is left out of its bin. A bin counts at a position as `filmCounts`. Each bin at A is
 * split at its median column, its median row (as `groupColours`) and its median n.v; a half reads with a quarter of
 * `GROOVE_MIN_PX` pixels and a mean highlight of at least `FILM_SPEC_MIN`, and keeps its own mean OPD at A.
 */
export function filmBins(f, pix) {
    const w = f.onA.w;
    const groups = new Map();
    const probe = new Float64Array(7);
    for (let i = 0; i < pix.px.length; i++) {
        if (!filmAdd(probe, f.onA, f.offA, pix.px[i]))
            continue;
        const k = pix.slot[i] * 1e6 + Math.round(pix.opdA[i] / FILM_OPD_BIN);
        const list = groups.get(k);
        if (list)
            list.push(i);
        else
            groups.set(k, [i]);
    }
    const bins = [];
    for (const idx of groups.values()) {
        const a = new Float64Array(7);
        const b = new Float64Array(7);
        let opd = 0;
        let opdB = 0;
        const xs = [];
        const ys = [];
        const nvs = [];
        for (const i of idx) {
            const p = pix.px[i];
            filmAdd(a, f.onA, f.offA, p);
            filmAdd(b, f.onB, f.offB, p);
            opd += pix.opdA[i];
            opdB += pix.opdB[i];
            xs.push(p % w);
            ys.push(Math.floor(p / w));
            nvs.push(pix.nv[i]);
        }
        const [mx, my, mn] = [lowMedian(xs), lowMedian(ys), lowMedian(nvs)];
        const parts = Array.from({ length: 6 }, () => new Float64Array(7));
        const partOpd = new Float64Array(6);
        idx.forEach((i, j) => {
            for (const u of [xs[j] <= mx ? 0 : 1, ys[j] <= my ? 2 : 3, nvs[j] <= mn ? 4 : 5]) {
                filmAdd(parts[u], f.onA, f.offA, pix.px[i]);
                partOpd[u] = partOpd[u] + pix.opdA[i];
            }
        });
        const half = (u) => {
            const h = filmPlace(parts[u]);
            return h.n >= GROOVE_MIN_PX / 4 && h.lum >= FILM_SPEC_MIN ? { opd: partOpd[u] / h.n, tint: filmTint(h.h) } : null;
        };
        const split = (u, v) => {
            const [p, q] = [half(u), half(v)];
            return p && q ? [p, q] : null;
        };
        const [pa, pb] = [filmPlace(a), filmPlace(b)];
        bins.push({
            slot: pix.slot[idx[0]],
            opd: opd / idx.length,
            opdB: opdB / idx.length,
            n: pa.n,
            counted: filmCounts(pa),
            countedB: filmCounts(pb),
            a: pa,
            b: pb,
            tint: filmTint(pa.h),
            splits: { column: split(0, 1), row: split(2, 3), nv: split(4, 5) },
        });
    }
    return bins.sort((p, q) => p.slot - q.slot || p.opd - q.opd);
}
/**
 * (b)'s curve for a counted bin: the parabola, per tint component, through the mean OPD and tint of three neighbouring
 * counted bins of its slot, itself included. Neighbours are bins one apart in round(OPD / `FILM_OPD_BIN`), (e)'s test,
 * so no curve spans a gap of uncounted bins. It takes the bin and both its neighbours when both count, else the bin and
 * the two next to it on the one side that has them. Null when neither holds: that bin is not read. A parabola, not a
 * one-sided straight slope: beside a gap the secant is off by the ramp's curvature (task-18e-design-review.md, B1).
 */
export function filmCurve(ramp, bin) {
    const key = (b) => Math.round(b.opd / FILM_OPD_BIN);
    const byKey = new Map(ramp.filter((o) => o.slot === bin.slot && o.counted).map((o) => [key(o), o]));
    const k = key(bin);
    const at = (d) => byKey.get(k + d);
    const [p1, p2, n1, n2] = [at(-1), at(-2), at(1), at(2)];
    const nodes = p1 && n1 ? [p1, bin, n1] : n1 && n2 ? [bin, n1, n2] : p1 && p2 ? [p2, p1, bin] : null;
    if (!nodes)
        return null;
    return (o) => {
        const out = [0, 0];
        nodes.forEach((ni, i) => {
            let w = 1;
            nodes.forEach((nj, j) => {
                if (j !== i)
                    w *= (o - nj.opd) / (ni.opd - nj.opd);
            });
            out[0] += w * ni.tint[0];
            out[1] += w * ni.tint[1];
        });
        return out;
    };
}
/**
 * (b): equal thickness and equal angle give equal colour. For each split of each counted bin with a curve
 * (`filmCurve`): | (tint(h1) - tint(h2)) - (f(OPD(h1)) - f(OPD(h2))) |, the part of the halves' colour difference
 * that their thickness difference does not explain. The worst decides. Null when no bin with a curve has two readable
 * halves.
 */
export function filmMatch(bins) {
    let best = null;
    for (const b of bins) {
        if (!b.counted)
            continue;
        const curve = filmCurve(bins, b);
        if (!curve)
            continue;
        for (const split of ["column", "row", "nv"]) {
            const halves = b.splits[split];
            if (!halves)
                continue;
            const [p, q] = halves;
            const [fp, fq] = [curve(p.opd), curve(q.opd)];
            const spread = Math.hypot(p.tint[0] - q.tint[0] - (fp[0] - fq[0]), p.tint[1] - q.tint[1] - (fp[1] - fq[1]));
            if (!best || spread > best.spread)
                best = { spread, raw: tintDistance(p.tint, q.tint), split, slot: b.slot, opd: b.opd, n: b.n };
        }
    }
    return best;
}
/**
 * (d): the mean tint distance at A from each counted bin to the bin of its slot nearest D nm further along in OPD,
 * with D = min(`FILM_APART`, half the slot's OPD span). A mean, as interference colours repeat and one pair may match
 * by chance. A bin whose target lies past the ramp's end has no pair. Null when no slot spans `FILM_MIN_SPAN` or no
 * pair exists.
 */
export function filmApart(bins) {
    let sum = 0;
    let pairs = 0;
    let span = 0;
    let d = 0;
    for (const slot of new Set(bins.map((b) => b.slot))) {
        const ramp = bins.filter((b) => b.slot === slot && b.counted);
        if (ramp.length < 2)
            continue;
        const reach = ramp[ramp.length - 1].opd - ramp[0].opd;
        if (reach < FILM_MIN_SPAN)
            continue;
        const D = Math.min(FILM_APART, reach / 2);
        if (reach > span)
            [span, d] = [reach, D];
        for (const b of ramp) {
            const target = b.opd + D;
            if (target > ramp[ramp.length - 1].opd + FILM_OPD_BIN / 2)
                continue;
            let near = null;
            for (const o of ramp)
                if (o.opd > b.opd && (!near || Math.abs(o.opd - target) < Math.abs(near.opd - target)))
                    near = o;
            if (!near)
                continue;
            sum += tintDistance(filmTint(b.a.h), filmTint(near.a.h));
            pairs++;
        }
    }
    return pairs ? { dist: sum / pairs, pairs, span, d } : null;
}
/**
 * (e)'s ratio on one slot's ramp. Turning the key acts as a move along the thickness ramp: for each bin read at B, o'
 * is its OPD at B and tint_A(o') position A's tint there, interpolated along the ramp. Only bins whose o' lies inside
 * the ramp, between two neighbouring counted bins, are read: colour across a gap of uncounted bins was never
 * measured, so a bin whose o' falls in a gap is left out. ratio = sum |tint_B(bin) - tint_A(o')| / sum |tint_A(bin) -
 * tint_A(o')|: near 0 for an honest film, 1 for a film that ignores the angle. `denom` is the denominator as a mean
 * per bin read. Null when no bin is read.
 */
export function filmSpreadRatio(bins) {
    const ramp = [...bins].sort((p, q) => p.opd - q.opd);
    if (ramp.length < 2)
        return null;
    const at = (o) => {
        if (o < ramp[0].opd || o > ramp[ramp.length - 1].opd)
            return null;
        let j = 1;
        while (j < ramp.length - 1 && ramp[j].opd < o)
            j++;
        const [p, q] = [ramp[j - 1], ramp[j]];
        const t = q.opd > p.opd ? (o - p.opd) / (q.opd - p.opd) : 0;
        if (t > 0 && t < 1 && Math.round(q.opd / FILM_OPD_BIN) - Math.round(p.opd / FILM_OPD_BIN) > 1)
            return null;
        return [p.tintA[0] + (q.tintA[0] - p.tintA[0]) * t, p.tintA[1] + (q.tintA[1] - p.tintA[1]) * t];
    };
    let num = 0;
    let den = 0;
    let n = 0;
    for (const b of bins) {
        if (!b.tintB)
            continue;
        const there = at(b.opdB);
        if (!there)
            continue;
        num += tintDistance(b.tintB, there);
        den += tintDistance(b.tintA, there);
        n++;
    }
    return n ? { ratio: den > 0 ? num / den : 0, denom: den / n, bins: n } : null;
}
/**
 * (e): the largest ratio over the slots that are read; with none read, the slot nearest to being read, marked unread.
 * `noise` is null when the page has no (b) reading, and then no slot is read. `limit` is `relight.filmSpread`.
 */
export function filmSpread(bins, step, noise, limit) {
    let read = null;
    let unread = null;
    for (const slot of new Set(bins.map((b) => b.slot))) {
        const ramp = bins
            .filter((b) => b.slot === slot && b.counted)
            .map((b) => ({ opd: b.opd, opdB: b.opdB, tintA: filmTint(b.a.h), tintB: b.countedB ? filmTint(b.b.h) : null }));
        const r = filmSpreadRatio(ramp);
        if (!r)
            continue;
        const entry = { ...r, step, noise, slot, read: noise !== null && r.denom > 0 && noise / r.denom < limit };
        if (entry.read && (!read || entry.ratio > read.ratio))
            read = entry;
        if (!entry.read && (!unread || entry.denom > unread.denom))
            unread = entry;
    }
    return read ?? unread;
}
/** One 8-bit tint step of the frames: `a` over the bins counted at A, `ab` over those counted at A or at B. */
export function filmSteps(bins) {
    let a = 0;
    let ab = 0;
    for (const b of bins) {
        if (b.counted)
            a = Math.max(a, filmTintStep(b.a.h, b.a.on));
        if (b.countedB)
            ab = Math.max(ab, filmTintStep(b.b.h, b.b.on));
    }
    return { a, ab: Math.max(a, ab) };
}
/** The film's limits from src/checks/thresholds.json, through the caller's threshold reader. */
export function filmLimits(th) {
    return { shift: th("relight.filmShift"), match: th("relight.filmMatch"), band: th("relight.ambientBand"), apart: th("relight.filmApart"), spread: th("relight.filmSpread") };
}
/** The reading as the law's measured keys, all under `iridescence.film`. (e)'s ratio is written only when it is read. */
function filmMeasured(r) {
    const m = { "iridescence.film.px": r.film, "iridescence.film.turn": r.turn, "iridescence.film.bins.a": r.bins.a, "iridescence.film.bins.b": r.bins.b, "iridescence.film.step": r.step };
    if (r.film === 0)
        return m;
    m["iridescence.film.key"] = r.key;
    m["iridescence.film.still"] = r.still;
    if (r.tilt !== null)
        m["iridescence.film.tilt"] = r.tilt;
    if (r.time !== null)
        m["iridescence.film.time"] = r.time;
    if (r.match) {
        m["iridescence.film.match"] = r.match.spread;
        m["iridescence.film.match.opd"] = r.match.opd;
        m["iridescence.film.match.px"] = r.match.n;
    }
    if (r.apart) {
        m["iridescence.film.apart"] = r.apart.dist;
        m["iridescence.film.apart.pairs"] = r.apart.pairs;
        m["iridescence.film.apart.d"] = r.apart.d;
    }
    if (r.spread) {
        if (r.spread.read)
            m["iridescence.film.spread"] = r.spread.ratio;
        m["iridescence.film.spread.denom"] = r.spread.denom;
        m["iridescence.film.spread.step"] = r.spread.step;
        if (r.spread.noise !== null)
            m["iridescence.film.spread.noise"] = r.spread.noise;
        m["iridescence.film.spread.bins"] = r.spread.bins;
    }
    return m;
}
/** The reading in words, for a pass or partial line. */
function filmFacts(r, mover) {
    const tilt = r.tilt === null ? "the page does not tilt" : `tilting it ${round(r.tilt, 4)}`;
    const time = r.time === null ? "the surface moves with the clock" : `time ${round(r.time, 4)}`;
    const e = r.spread?.read ? `(e) the key's turn leaves ${round(r.spread.ratio, 4)} of the ramp's move` : FILM_E_NOT_READ;
    return `turning ${mover} ${r.turn} degrees moves the film's colour ${round(r.key, 4)} per point, ${tilt}, ${time}; ${e}`;
}
/**
 * The film's verdict on (a) to (e). A fail line lists only the conditions that fail, each with its reading. (e) unread
 * decides nothing, and every line says it. `lim` is the caller's: this function holds no limit.
 */
export function filmVerdict(r, lim, mover = "the key light") {
    const measured = filmMeasured(r);
    const partial = (why) => ({ status: "partial", line: `iridescence PARTIAL (${why})`, measured });
    if (r.film === 0)
        return partial("no pixel on the frame is a fully covered, uninked texel of a film material, so there is no film to read");
    const problems = [];
    if (r.key <= lim.shift)
        problems.push(`(a) turning ${mover} ${r.turn} degrees moves the film's colour ${round(r.key, 4)} per point in OKLab chroma, at or under ${lim.shift}: its colour does not come from the light`);
    if (r.tilt !== null && r.tilt <= lim.shift)
        problems.push(`(a) tilting the surface by half its max moves the film's colour ${round(r.tilt, 4)} per point in OKLab chroma, at or under ${lim.shift}: the surface does not turn`);
    if (r.match && r.match.spread >= lim.match)
        problems.push(`(b) film of one thickness and angle (OPD ${round(r.match.opd, 1)} nm, slot ${r.match.slot}) differs ${round(r.match.spread, 4)} in tint between its halves by ${r.match.split}, beyond what their thickness difference explains, at or over ${lim.match}: its colour is not a function of its thickness and angle`);
    if (r.time !== null && r.time >= lim.band)
        problems.push(`(c) with nothing moved (the surface still under ${round(100 * r.still, 1)}% of the film), the film changes ${round(r.time, 4)} (mean absolute 8-bit difference) from t to t + 1, at or over ${lim.band}: its colour moves with the clock`);
    if (r.apart && r.apart.dist <= lim.apart)
        problems.push(`(d) film ${round(r.apart.d, 1)} nm apart in OPD differs ${round(r.apart.dist, 4)} in tint, the mean of ${r.apart.pairs} pairs, at or under ${lim.apart}: its colour ignores its thickness`);
    if (r.spread?.read && r.spread.ratio >= lim.spread)
        problems.push(`(e) turning ${mover} leaves ${round(r.spread.ratio, 4)} of the move along the film's own ramp undone, at or over ${lim.spread}: its colour ignores the angle`);
    if (problems.length)
        return { status: "fail", line: `iridescence FAIL (${problems.join("; ")}${r.spread?.read ? "" : `; ${FILM_E_NOT_READ}`})`, measured };
    const facts = filmFacts(r, mover);
    if (r.time === null)
        return partial(`no film texel keeps its height, coverage, slot, ink and param from t to t + 1: the surface moves with the clock, so (c) cannot be read; ${facts}`);
    if (!r.match)
        return partial(`no film bin of ${GROOVE_MIN_PX} pixels on a thickness curve (three neighbouring counted bins of its slot) has two readable halves, so (b) cannot be read; ${facts}`);
    if (!r.apart)
        return partial(`the film's OPD spans under ${FILM_MIN_SPAN} nm or gives no pair of bins, so (d) cannot be read; ${facts}`);
    return {
        status: "pass",
        line: `iridescence pass (${facts}; one thickness and angle differs at most ${round(r.match.spread, 4)} in tint, film ${round(r.apart.d, 1)} nm apart in OPD ${round(r.apart.dist, 4)})`,
        measured,
    };
}
/**
 * The law's result on a page's foil and film. A page with one of them keeps that result exactly. With both, the worse
 * status (fail, partial, pass), each part's text after `foil:` or `film:`, and both parts' readings.
 */
export function iridescenceJoin(foil, film) {
    if (!film)
        return foil;
    if (!foil)
        return film;
    const parts = [foil, film];
    const status = parts.some((r) => r.status === "fail") ? "fail" : parts.some((r) => r.status === "partial") ? "partial" : "pass";
    const word = status === "fail" ? "FAIL" : status === "partial" ? "PARTIAL" : "pass";
    const inner = (r) => r.line.replace(/^iridescence \S+ \(/, "").replace(/\)$/, "");
    return { status, line: `iridescence ${word} (foil: ${inner(foil)}; film: ${inner(film)})`, measured: { ...foil.measured, ...film.measured } };
}
/** The film's frame pixels, each with its OPD at the key's two positions. */
function filmPixelsOf(tex, fw, fh, mats, a, b) {
    const at = new Int32Array(tex.w * tex.h).fill(-1);
    tex.k.forEach((k, i) => (at[k] = i));
    const out = { px: [], slot: [], param: [], opdA: [], opdB: [], nv: [] };
    for (let p = 0; p < fw * fh; p++) {
        const i = at[texelOf(tex, p, fw, fh)];
        if (i < 0)
            continue;
        const f = mats[tex.slot[i]].film;
        const d = f.range[0] + tex.param[i] * (f.range[1] - f.range[0]);
        out.px.push(p);
        out.slot.push(tex.slot[i]);
        out.param.push(tex.param[i]);
        out.opdA.push(filmOpd(d, f.ior, a));
        out.opdB.push(filmOpd(d, f.ior, b));
        out.nv.push(tex.nv[i]);
    }
    return out;
}
/** Every reading of the film branch, on the page as `c` holds it. Lights, detail, grain and tilt are put back after. */
async function filmReading(c, i, slots, mats, turn = FILM_KEY_TURN, limit = c.th("relight.filmSpread")) {
    const opts = await c.h.hook("__paint.tiltOptions()");
    const tilts = opts !== null && opts.max > 0;
    if (tilts)
        await c.h.hook("__paint.setTilt([0, 0])");
    try {
        const tex = await c.h.hook(`(() => { const s = __paint.stats(); const g = { ...__paint.sheetRegion(0, 0, innerWidth, innerHeight), w: s.sheetW, h: s.sheetH }; return (${filmTexels.toString()})(g, ${json(slots)}, ${c.th("relight.fullCoverage")}); })()`);
        const key = (await c.h.hook("__paint.lights()"))[i];
        const { a, b } = filmKeyTurn(key.props.dir, turn);
        // (a) the key: positions A and B, every other light as declared, the page's detail, no tilt.
        await c.h.hook(`__paint.setLight(${i}, { dir: ${json(a)} })`);
        const keyA = await shot(c);
        await c.h.hook(`__paint.setLight(${i}, { dir: ${json(b)} })`);
        const keyB = await shot(c);
        await restore(c);
        const pix = filmPixelsOf(tex, keyA.w, keyA.h, mats, a, b);
        const isFilm = new Uint8Array(keyA.w * keyA.h);
        for (let n = 0; n < pix.px.length; n++)
            isFilm[pix.px[n]] = 1;
        const film = (p) => isFilm[p] === 1;
        // (a) the tilt: the surface turned by half the page's max about the vertical axis, nothing else moved.
        let tilt = null;
        if (tilts) {
            const flat = await shot(c);
            await c.h.hook(`__paint.setTilt([${opts.max / 2}, 0])`);
            const tipped = await shot(c);
            await c.h.hook("__paint.setTilt([0, 0])");
            tilt = pointChromaShift(flat, tipped, film);
        }
        // (c) the clock: one second on, nothing moved, read only where the sheet held (`param` included).
        for (const [j, l] of c.lights.entries())
            if (l.id === "throughWater")
                await c.h.hook(`__paint.setLight(${j}, { caustic: 0 })`);
        const now = await shot(c);
        await c.h.hook("window.__pkFilmSheet = __paint.sheetRegion(0, 0, innerWidth, innerHeight)");
        await c.h.hook(`__paint.setTime(${T + 1})`);
        const later = await shot(c);
        const held = await c.h.hook(`(${sheetHeld.toString()})(window.__pkFilmSheet, __paint.sheetRegion(0, 0, innerWidth, innerHeight), ${tex.w}, ${tex.h}, ${HELD_REACH})`);
        await c.h.hook("delete window.__pkFilmSheet");
        await c.h.hook(`__paint.setTime(${T})`);
        await restore(c);
        const stillFilm = (p) => film(p) && held[texelOf(tex, p, keyA.w, keyA.h)] === 1;
        let still = 0;
        for (let n = 0; n < pix.px.length; n++)
            if (stillFilm(pix.px[n]))
                still++;
        // (b), (d) and (e): the highlight alone, under the key alone, at detail 0 and grain 0.
        for (const j of c.lights.keys())
            if (j !== i)
                await c.h.hook(`__paint.setLight(${j}, { level: 0 })`);
        const detail = await c.h.hook("__paint.detail()");
        const grain = await c.h.hook("__paint.grain()");
        await c.h.hook("__paint.setDetail(0)");
        await c.h.hook("__paint.setGrain(0)");
        let frames;
        try {
            await c.h.hook(`__paint.setLight(${i}, { dir: ${json(a)} })`);
            const onA = await shot(c);
            await c.h.hook(`__paint.setLight(${i}, { dir: ${json(b)} })`);
            const onB = await shot(c);
            await c.h.hook(`__paint.setLight(${i}, { dir: ${json(a)}, specular: 0 })`);
            const offA = await shot(c);
            await c.h.hook(`__paint.setLight(${i}, { dir: ${json(b)}, specular: 0 })`);
            const offB = await shot(c);
            frames = { onA, offA, onB, offB };
        }
        finally {
            // restore() resets the declared props, which may not name `specular`, so it is put back here.
            await c.h.hook(`__paint.setLight(${i}, { specular: ${json(key.props.specular ?? 1)} })`);
            await restore(c);
            await c.h.hook(`__paint.setDetail(${json(detail)})`);
            await c.h.hook(`__paint.setGrain(${json(grain)})`);
        }
        const bins = filmBins(frames, pix);
        const steps = filmSteps(bins);
        const match = filmMatch(bins);
        return {
            film: pix.px.length,
            turn,
            key: pointChromaShift(keyA, keyB, film),
            tilt,
            time: still > 0 ? meanAbsDiffIn(now, later, stillFilm) : null,
            still: pix.px.length ? still / pix.px.length : 0,
            match,
            apart: filmApart(bins),
            spread: filmSpread(bins, steps.ab, match?.spread ?? null, limit),
            bins: { a: bins.filter((b) => b.counted).length, b: bins.filter((b) => b.countedB).length },
            step: steps.a,
        };
    }
    finally {
        if (tilts)
            await c.h.hook("__paint.setTilt(null)");
    }
}
/**
 * The film branch's reading on one page in one scheme. `limit` is the (e) limit its read floor uses: by default
 * `relight.filmSpread`, and Infinity to print (e) on every page with no limit in use (scripts/film-readings.mjs).
 */
export async function filmSchemeReading(target, opts, scheme, turn = FILM_KEY_TURN, limit) {
    const h = await open(target, opts, { t: T, dark: scheme === "dark" });
    try {
        await hideText(h);
        const lights = await h.hook("__paint.lights()");
        const ctx = { h, target, lights, th: (n) => threshold(n, target.bar) };
        const mats = await h.hook("__paint.materials()");
        const slots = [...mats.keys()].filter((k) => mats[k].film);
        return await filmReading(ctx, firstOf(ctx, ["key"]), slots, mats, turn, limit ?? ctx.th("relight.filmSpread"));
    }
    finally {
        await h.close();
    }
}
async function iridescence(c) {
    const i = firstOf(c, ["key"]);
    if (i < 0)
        return { status: "partial", line: "iridescence PARTIAL (no key light: the law reads foil under one directional key, as a lamp gives each point its own light direction)", measured: {} };
    const mats = await c.h.hook("__paint.materials()");
    const slots = [...mats.keys()].filter((k) => mats[k].laws.includes("iridescence"));
    if (!slots.length)
        return { status: "partial", line: "iridescence PARTIAL (no material on the page declares the iridescence law)", measured: {} };
    const filmSlots = slots.filter((k) => mats[k].film);
    const foilSlots = slots.filter((k) => !mats[k].film);
    const foil = foilSlots.length ? await iridescenceFoil(c, i, foilSlots) : null;
    if (foil && filmSlots.length)
        await restore(c);
    const film = filmSlots.length ? filmVerdict(await filmReading(c, i, filmSlots, mats), filmLimits(c.th), `${c.lights[i].id} ${i}`) : null;
    return iridescenceJoin(foil, film);
}
/** Pixels each burn reading needs (scorch pixels, near and beyond the front): GROOVE_MIN_PX's floor, about a 20 x 20 px patch. */
export const BURN_MIN_PX = GROOVE_MIN_PX;
/** The tint law's inner and outer fractions of a light's reach: near is within 0.6 x, beyond is past 1.2 x. */
export const EMBER_NEAR = 0.6;
export const EMBER_BEYOND = 1.2;
/**
 * The fade's two bands, as fractions of reach: the inner quarter [0, 0.25) and the outer quarter [0.75, 1). A light that
 * falls to 0 at reach differs most there (the ember's (1 - k^2)^2 is 0.97 at k 0.125 and 0.055 at k 0.875); a glow
 * flat to reach reads about 1 whatever the knee does. Chosen before any reading (Task 21 fix round 1, I2).
 */
export const EMBER_FADE_INNER = 0.25;
export const EMBER_FADE_OUTER = 0.75;
/** The burn law's five frozen times: across the bar's `alive` window, else t 1 to 5. */
export function burnTimes(alive) {
    if (alive && "t0" in alive)
        return [0, 1, 2, 3, 4].map((k) => alive.t0 + (k * (alive.t1 - alive.t0)) / 4);
    return [1, 2, 3, 4, 5];
}
/** Share of the sheet grid where the paper is gone: coverage under a half, the blend's own cut. */
export const burnedShare = (coverage) => {
    let n = 0;
    for (let k = 0; k < coverage.length; k++)
        if (coverage[k] < 0.5)
            n++;
    return coverage.length ? n / coverage.length : 0;
};
/** Runs in the page (stringified): the sheet region's codes. Self-contained. */
export function burnTexels(g, full) {
    const code = new Array(g.w * g.h);
    for (let k = 0; k < g.w * g.h; k++)
        code[k] = g.coverage[k] < full ? -1 : Math.round(g.param[k] * 1e4) / 1e4;
    return { w: g.w, h: g.h, code };
}
/** The largest drop of the burned share between neighbouring times (0 when it never drops). */
export function shareDrop(shares) {
    let d = 0;
    for (let k = 1; k < shares.length; k++)
        d = Math.max(d, shares[k - 1] - shares[k]);
    return d;
}
/**
 * Per texel, the Euclidean distance in short-side units to the nearest texel the burn has reached (code above 0: param
 * above 0 at full coverage); 0 on those texels, Infinity everywhere when the burn has reached none. The exact
 * squared distance transform of Felzenszwalb and Huttenlocher (2012), by columns then rows.
 */
export function frontDistance(code, w, h) {
    const BIG = 1e20;
    const g = new Float64Array(w * h);
    // Reached means param above 0. Ground and holes (coverage under full, code -1) are not the front: a card's edges
    // on the page's ground are paper the burn has not reached, and behind a front the scorch band (param 0 to 1) always
    // lies between the paper and the hole (Task 21 fix round 1, I1).
    for (let k = 0; k < w * h; k++)
        g[k] = code[k] > 0 ? 0 : BIG;
    const n = Math.max(w, h);
    const f = new Float64Array(n);
    const d = new Float64Array(n);
    const v = new Int32Array(n);
    const z = new Float64Array(n + 1);
    const pass = (len) => {
        let k = 0;
        v[0] = 0;
        z[0] = -Infinity;
        z[1] = Infinity;
        const cut = (q) => (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        for (let q = 1; q < len; q++) {
            let s = cut(q);
            while (s <= z[k]) {
                k--;
                s = cut(q);
            }
            k++;
            v[k] = q;
            z[k] = s;
            z[k + 1] = Infinity;
        }
        k = 0;
        for (let q = 0; q < len; q++) {
            while (z[k + 1] < q)
                k++;
            d[q] = (q - v[k]) ** 2 + f[v[k]];
        }
    };
    for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++)
            f[y] = g[y * w + x];
        pass(h);
        for (let y = 0; y < h; y++)
            g[y * w + x] = d[y];
    }
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++)
            f[x] = g[y * w + x];
        pass(w);
        for (let x = 0; x < w; x++)
            g[y * w + x] = d[x];
    }
    const side = Math.min(w, h);
    for (let k = 0; k < w * h; k++)
        g[k] = g[k] >= BIG / 2 ? Infinity : Math.sqrt(g[k]) / side;
    return g;
}
/** (b): the mean drop of relative luminance of the same pixels, from param 0 at one time to param in (0, 0.5) at the next. */
export function scorchReading(frames) {
    let s = 0;
    let n = 0;
    for (let k = 1; k < frames.length; k++) {
        const a = frames[k - 1];
        const b = frames[k];
        const ya = linLum(a.off);
        const yb = linLum(b.off);
        for (let p = 0; p < a.off.w * a.off.h; p++) {
            if (a.tex.code[texelOf(a.tex, p, a.off.w, a.off.h)] !== 0)
                continue;
            const after = b.tex.code[texelOf(b.tex, p, b.off.w, b.off.h)];
            if (!(after > 0 && after < 0.5))
                continue;
            s += ya(p * 4) - yb(p * 4);
            n++;
        }
    }
    return { drop: n ? s / n : 0, n };
}
/** (c): warmth near the front, change beyond it and the fade of the added light out to reach, ahead of the front only. */
export function emberReading(frames, ab, reach) {
    const len = Math.hypot(ab[0], ab[1]);
    const u = len > 0 ? [ab[0] / len, ab[1] / len] : [0, 0];
    let warm = 0;
    let near = 0;
    let diff = 0;
    let beyond = 0;
    let inner = 0;
    let innerN = 0;
    let outer = 0;
    let outerN = 0;
    for (const f of frames) {
        const on = f.on;
        if (!on)
            continue;
        const off = f.off;
        const yOn = linLum(on);
        const yOff = linLum(off);
        const dist = frontDistance(f.tex.code, f.tex.w, f.tex.h);
        for (let p = 0; p < on.w * on.h; p++) {
            const ti = texelOf(f.tex, p, on.w, on.h);
            if (f.tex.code[ti] !== 0)
                continue;
            const d = dist[ti];
            if (!Number.isFinite(d))
                continue;
            const o = p * 4;
            if (d > EMBER_BEYOND * reach) {
                diff += (Math.abs(on.data[o] - off.data[o]) + Math.abs(on.data[o + 1] - off.data[o + 1]) + Math.abs(on.data[o + 2] - off.data[o + 2])) / (3 * 255);
                beyond++;
                continue;
            }
            if (d >= reach)
                continue;
            const [, a1, b1] = srgbToOklab(on.data[o], on.data[o + 1], on.data[o + 2]);
            const [, a0, b0] = srgbToOklab(off.data[o], off.data[o + 1], off.data[o + 2]);
            const gain = (a1 - a0) * u[0] + (b1 - b0) * u[1];
            // The fade is read on the light the ember adds, not on its warmth. Two things make warmth rise away from the
            // front: the paper reaching the finish's knee (burn.html light: 94-97% of paper pixels at 8-bit 231 with the
            // ember off, warmth peaking at 0.6 to 0.8 x reach), and the ember's own colour cooling from core to the more
            // saturated edge (dark: warmth per unit of added light 1.7 at 0 to 0.2 x reach, 3.5 at 0.8 to 1). The added
            // light stays monotone under the clamp.
            const added = yOn(o) - yOff(o);
            if (d < EMBER_FADE_INNER * reach) {
                inner += added;
                innerN++;
            }
            else if (d >= EMBER_FADE_OUTER * reach) {
                outer += added;
                outerN++;
            }
            if (d < EMBER_NEAR * reach) {
                warm += gain;
                near++;
            }
        }
    }
    const innerMean = innerN ? inner / innerN : 0;
    const outerMean = outerN ? outer / outerN : 0;
    return {
        warmth: near ? warm / near : 0,
        near,
        diff: beyond ? diff / beyond : 0,
        beyond,
        inner: innerMean,
        innerN,
        outer: outerMean,
        outerN,
        fade: innerN && outerN && innerMean > 0 ? outerMean / innerMean : null,
    };
}
/** The burn law's verdict: (a), (b) and (c), each named in the line; a fail outranks a partial. */
export function burnVerdict(r, lim) {
    const parts = [];
    const measured = {};
    // (a)
    const drop = shareDrop(r.shares);
    measured["burn.jitter"] = drop;
    const shares = `burned share at t ${r.times.map((t) => round(t, 2)).join(", ")}: ${r.shares.map((s) => round(s, 4)).join(", ")}`;
    if (Math.max(...r.shares) === Math.min(...r.shares))
        parts.push({ tag: "a", status: "partial", text: `${shares}; the share never changes, so the front's motion cannot be judged` });
    else if (drop > lim.jitter)
        parts.push({ tag: "a", status: "fail", text: `the front moves back: ${shares}; the share drops by ${round(drop, 4)}, over ${lim.jitter}` });
    else
        parts.push({ tag: "a", status: "pass", text: `${shares}; largest drop ${round(drop, 4)}, within ${lim.jitter}` });
    // (b)
    measured["burn.scorchPx"] = r.scorch.n;
    if (r.scorch.n < BURN_MIN_PX)
        parts.push({ tag: "b", status: "partial", text: `${r.scorch.n} px pass from unburned paper into the scorch band's first half between two times, under ${BURN_MIN_PX}` });
    else {
        measured["burn.scorchDrop"] = r.scorch.drop;
        const facts = `the same ${r.scorch.n} px, ember off, drop by ${round(r.scorch.drop, 5)} relative luminance once the front passes`;
        parts.push(r.scorch.drop > lim.scorch ? { tag: "b", status: "pass", text: `${facts}, over ${lim.scorch}` } : { tag: "b", status: "fail", text: `paper behind the front is not darker: ${facts}, not over ${lim.scorch}` });
    }
    // (c)
    const e = r.ember;
    if ("why" in e)
        parts.push({ tag: "c", status: "partial", text: e.why });
    else {
        measured["burn.ember.warmth"] = e.warmth;
        measured["burn.ember.near"] = e.near;
        measured["burn.ember.beyond"] = e.beyond;
        if (e.beyond)
            measured["burn.ember.beyondDiff"] = e.diff;
        measured["burn.ember.innerPx"] = e.innerN;
        measured["burn.ember.outerPx"] = e.outerN;
        if (e.fade !== null)
            measured["burn.ember.fade"] = e.fade;
        const fadeText = `added light ${round(e.outer, 5)} at ${EMBER_FADE_OUTER} to 1 x reach (${e.outerN} px) over ${round(e.inner, 5)} under ${EMBER_FADE_INNER} x reach (${e.innerN} px)${e.fade === null ? "" : `, fade ${round(e.fade, 4)}`}`;
        const facts = `ahead of the front, within ${EMBER_NEAR} x reach warmth ${round(e.warmth, 5)} over ${e.near} px; beyond ${EMBER_BEYOND} x reach the frames differ by ${round(e.diff, 5)} over ${e.beyond} px; ${fadeText}`;
        const bands = e.innerN >= BURN_MIN_PX && e.outerN >= BURN_MIN_PX;
        const problems = [];
        if (e.near >= BURN_MIN_PX && !(e.warmth > 0))
            problems.push("the ember does not warm the paper near the front");
        if (e.beyond >= BURN_MIN_PX && e.diff > lim.band)
            problems.push(`beyond its reach the ember still changes the frame by ${round(e.diff, 5)}, over ${lim.band}`);
        if (bands && !(e.inner > 0))
            problems.push("the ember adds no light near the front");
        else if (bands && e.fade !== null && !(e.fade < lim.fade))
            problems.push(`the light the ember adds does not fade toward its reach: outer over inner quarter ${round(e.fade, 4)}, not under ${lim.fade}`);
        const thin = [e.near < BURN_MIN_PX && `within ${EMBER_NEAR} x reach`, e.beyond < BURN_MIN_PX && `beyond ${EMBER_BEYOND} x reach`, !bands && `in the inner or outer quarter of reach`].filter(Boolean);
        if (problems.length)
            parts.push({ tag: "c", status: "fail", text: `${problems.join("; ")}; ${facts}` });
        else if (thin.length)
            parts.push({ tag: "c", status: "partial", text: `under ${BURN_MIN_PX} px ${thin.join(", ")} of the front, so the ember cannot be judged; ${facts}` });
        else
            parts.push({ tag: "c", status: "pass", text: facts });
    }
    const status = parts.some((p) => p.status === "fail") ? "fail" : parts.some((p) => p.status === "partial") ? "partial" : "pass";
    const word = { pass: "pass", fail: "FAIL", partial: "PARTIAL" };
    const line = `burn ${word[status]} (${parts.map((p) => `(${p.tag}) ${p.status === "pass" ? "" : `${word[p.status]}: `}${p.text}`).join("; ")})`;
    return { status, line, measured };
}
/** The burn law's reading on an open page: five frozen times, the ember as declared and at level 0. */
async function readBurn(c) {
    const times = burnTimes(c.target.bar?.alive);
    const e = c.lights.findIndex((l) => l.id === "ember");
    let hue = { why: "no ember light on the page" };
    if (e >= 0) {
        const h = await lightAb(c, c.lights[e]);
        hue = "unset" in h ? { why: `${unsetLine(h.unset)}, so the ember's hue is unknown` } : h;
    }
    const full = c.th("relight.fullCoverage");
    const texels = `(() => { const s = __paint.stats(); return (${burnTexels.toString()})({ ...__paint.sheetRegion(0, 0, innerWidth, innerHeight), w: s.sheetW, h: s.sheetH }, ${full}); })()`;
    const shares = [];
    const frames = [];
    try {
        for (const t of times) {
            await c.h.hook(`__paint.setTime(${t})`);
            shares.push(burnedShare((await c.h.hook("__paint.sheet()")).coverage));
            const tex = await c.h.hook(texels);
            const on = e >= 0 ? await shot(c) : null;
            frames.push({ t, tex, on, off: on });
        }
        if (e >= 0) {
            await c.h.hook(`__paint.setLight(${e}, { level: 0 })`);
            for (const f of frames) {
                await c.h.hook(`__paint.setTime(${f.t})`);
                f.off = await shot(c);
            }
        }
        else
            for (const f of frames)
                f.off = (await c.h.hook(`__paint.setTime(${f.t})`), await shot(c));
    }
    finally {
        await restore(c);
        await c.h.hook(`__paint.setTime(${T})`);
    }
    const reach = e >= 0 ? c.lights[e].props.reach : 0;
    const ember = "ab" in hue ? emberReading(frames, hue.ab, reach) : hue;
    return { times, shares, scorch: scorchReading(frames), ember };
}
async function burn(c) {
    return burnVerdict(await readBurn(c), { jitter: c.th("relight.burnJitter"), scorch: c.th("relight.scorchDrop"), band: c.th("relight.ambientBand"), fade: c.th("relight.emberFade") });
}
/** The burn law's reading on one page in one scheme, with no limit in use (the gap rule's readings). */
export async function burnSchemeReading(target, opts, scheme) {
    const h = await open(target, opts, { t: T, dark: scheme === "dark" });
    try {
        await hideText(h);
        const lights = await h.hook("__paint.lights()");
        return await readBurn({ h, target, lights, th: (n) => threshold(n, target.bar) });
    }
    finally {
        await h.close();
    }
}
const LAWS = { relief, falloff, highlight, tint, caustic, transmit, shadow, iridescence, burn };
const NO_HOOK = "the page has no window.__paint hook, so its lights cannot be moved";
/**
 * relight in one colour scheme: every declared law on the page opened in `scheme`. `noHook` when it has no hook.
 * `only` reads just those laws instead (a page test of one law); the gate never passes it.
 */
export async function checkScheme(target, opts, scheme, only) {
    const h = await open(target, opts, { t: T, dark: scheme === "dark" });
    try {
        if (!(await hasHook(h)))
            return { scheme, status: "partial", line: NO_HOOK, measured: {}, noHook: true };
        await hideText(h);
        const laws = only ?? target.bar?.laws ?? (await h.hook("__paint.laws()"));
        const lights = await h.hook("__paint.lights()");
        const ctx = { h, target, lights, th: (n) => threshold(n, target.bar) };
        const results = [];
        for (const law of laws) {
            results.push(await LAWS[law](ctx));
            await restore(ctx);
        }
        if (!results.length)
            return { scheme, status: "partial", line: "the page declares no laws", measured: {} };
        const tested = results.filter((r) => r.status !== "skip");
        const status = tested.length === 0 ? "skip" : tested.some((r) => r.status === "fail") ? "fail" : tested.some((r) => r.status === "partial") ? "partial" : "pass";
        const measured = Object.assign({}, ...results.map((r) => r.measured));
        return { scheme, status, line: results.map((r) => r.line).join("; "), measured };
    }
    finally {
        await h.close();
    }
}
export const check = async (target, opts) => {
    const parts = [];
    for (const scheme of SCHEMES) {
        const part = await checkScheme(target, opts, scheme);
        // No hook is a fact about the page, not a scheme: say it once.
        if (part.noHook)
            return { name: NAME, status: "partial", line: `${NAME}: ${NO_HOOK}`, measured: {} };
        parts.push(part);
    }
    return joinSchemes(NAME, parts);
};
