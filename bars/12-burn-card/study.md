# 12 Burn card: study

Reference: How We Feel, "Story Burn Fire Animation", on 60fps.design.
https://60fps.design/shots/how-we-feel-story-burn-fire-animation (kept 2026-11-13).
Studied 2026-11-18. Two sources:

- **Shelf frames**, under the taste shelf folder
  `media/drive/60fps-design-shots-how-we-feel-story-burn-fire-animation/`:
  - `clip-0-10-overview.jpg`: 40 frames, 5 rows of 8, the whole phone. Cited as "overview rRcC".
  - `clip-0-4-burn-dense.jpg`: 32 frames, 4 rows of 8, the top of the phone down to the card's
    last line. Cited as "dense rRcC".
  - Frame spacing is not written in either file. It is inferred from the file names and the
    video length: about 0.25 s per overview frame and 0.125 s per dense frame. Three dense
    frames agree with the video within one frame (card area at dense r2c1, r3c1 and r4c8 against
    the video at 1.0 s, 2.0 s and 3.9 s). Treat a time read from a shelf frame as inferred.
- **The live page.** It opened with no sign-in. Its video is 9.88 s, 2160 x 2160. The page
  unmounted its video once, so I loaded the same mp4 into a new video element in the browser
  pane. I seeked it and drew each frame to a canvas, then counted pixels. Cited as "video t s".
  "Video px" means pixels of the 2160 px video. Every time below is a video time unless it says
  inferred.

## What it shows

A phone on a black screen. At the top: a back arrow, the title "Let go", two lines of intro text.
In the middle: a purple card with rounded corners. It holds a heading, a small cloud icon, and
four lines of serif text in two weights. Below the card: a round white button with a flame icon.
Source: overview r1c1, dense r1c1.

After the press, a flame rises from below the card. The card burns from the bottom edge to the
top. A ragged front climbs through it and eats the text with the paper. A thin orange rim glows
on the burned edge. Behind it, the card is gone and the black ground shows, full of small orange
specks. When the card is gone the screen stays black a moment. Then a success screen fades in:
a heading, a line of small text, a white button and a text link. Source: overview r1 to r3,
dense r2 to r4, video 0.9 s, 2.2 s, 3.4 s.

## Input

One tap on the round button below the card. The burn is not started by the card itself. The
button region darkens at video 0.20 s and 0.25 s (mean luma 59.6 to 26.8) and is back at 0.30 s
(58.1). I read this as the press. Source: video, button region mean luma, sampled every 0.05 s;
overview r1c2 shows the greyed button. The site caption calls it the "let-go action". Nothing
else in the clip takes input.

## What moves, in order

1. **Press** (0.20 to 0.25 s). The button darkens, then returns. Source: video.
2. **Title, intro text and button fade out** (about 0.35 to 0.6 s). The button region dims from
   0.35 s. The title is dim at dense r1c4 and gone at dense r1c6 (inferred 0.375 to 0.625 s).
   Source: video (button only), dense r1c4 to r1c6.
3. **Flame tongue** (0.5 to 1.3 s). A yellow-white flame stands below the card's bottom edge and
   reaches into the card. Bright yellow pixels exist from 0.5 s to 1.3 s and none from 1.4 s on.
   Its top reaches about 19% of the card's height above the card's bottom edge. Source: video
   (yellow pixel count at 270 px scale, 158 to 332 pixels, top row 175 to 192 against a card
   from row 84 to 196); overview r1c3 to r1c6; video 0.9 s.
4. **The front** (0.5 to 3.9 s). It starts at the bottom edge. It is ragged: pockets run ahead
   and leave islands, and the text burns with the paper ("insignificant" is cut to "ificant").
   The last strip to burn is along the top edge, near the heading. Source: dense r2c1 to r4c8,
   video 2.2 s.
5. **Embers in the burned area** (0.6 to about 4.2 s). Small orange specks fill the black area
   behind the front. They fade out after the card is gone: orange pixels in the screen drop to 2
   at 4.0 s, 1 at 4.2 s, 0 at 4.4 s. Source: video; dense r3c5 to r4c8.
6. **The card tilts a little as it burns.** The unburned part shifts at fixed rows: its top edge
   moves down 7 px of 223 (about 3%) and its right edge moves right 7 px of 130 (about 5%),
   between 0.5 s and 3.0 s. Source: video at 540 px scale; dense r3c1 to r4c4 show the card's
   outline leaning.
7. **Black gap** (about 4.4 to 4.7 s). Nothing on the screen but the status bar. Source: video;
   overview r3c1 to r3c3.
8. **Success screen fades in** (4.8 to 5.3 s). Button region mean luma: 10.4 at 4.8 s, 59.5 at
   5.0 s, 131.1 at 5.2 s, 141.2 at 5.3 s, then flat. Source: video; overview r3c4 (faint) and
   r3c5.
9. **Pale specks on the success screen** (from 5.0 s). Small white dots, in a different place in
   each frame. Weak reading: a dim-pixel count in the lower middle is 0 from 4.4 to 4.9 s and
   104 to 191 from 5.0 s on, but that region may catch the edge of the small text. Source:
   video; overview r4c1 to r5c8.
10. **Save button greys** at 9.4 s (luma 141.6 to 75.5), near the clip's end. Not part of the
    burn. Source: video; overview r5c6 to r5c8.

## Timing read from frames

| Moment | Value | How it was read |
|---|---|---|
| Video length | 9.88 s | video element duration |
| Press | 0.20 to 0.25 s | button region mean luma, 0.05 s steps |
| Flame tongue visible | 0.5 to 1.3 s | yellow pixel count, 0.1 s steps |
| Burn start | 0.5 s | first drop in purple pixel count (6699 at rest, 6593 at 0.5 s) |
| 75% of card left | about 1.35 s | purple count 5281 at 1.3 s, 4921 at 1.4 s |
| 50% left | about 2.0 s | 3295 at 2.0 s |
| 25% left | about 2.6 s | 1682 at 2.6 s |
| Card gone | 3.9 s | purple count 10 at 3.8 s, 0 at 3.9 s |
| Burn length | about 3.4 s | 0.5 s to 3.9 s |
| Embers gone | 4.4 s | orange pixel count 0 |
| Black gap | about 4.4 to 4.7 s | all counts 0 |
| Success fade-in | 4.8 to 5.3 s | button region luma |

The front's pace is uneven. The lowest purple row climbs 11% of the card's height from 0.5 to
1.3 s, 47% from 1.3 to 2.5 s, 5% from 2.5 to 3.0 s, then the top strip goes by 3.8 s. Source:
video, lowest purple row at 270 px scale (196, 184, 131, 125, 87). The area lost per 0.1 s is
largest from 1.2 to 2.5 s (about 200 to 390 pixels per step).

Front speed, derived: the card is about 1.7 times as tall as it is wide (223 by 130 px at 540
px scale). The front crosses it in about 3.4 s, so it moves about 0.5 card widths per second on
average. This is in card widths. The plan's `speed` is in short-side units; the conversion
depends on the bar's layout.

Unread: the glow's flicker rate (0.05 s steps are too coarse to judge `flash`), any easing curve,
and the exact frame the title starts to fade.

## Material law

The burn law has three parts (spec, "New law: burn"). What the reference shows of each:

- **The front only advances. Shown.** The purple count falls at every 0.1 s step from 0.5 s to
  3.9 s and never rises (6593, 6516, 6482, 6341, ... 10, 0). Islands left by pockets burn away;
  none grows back. Source: video.
- **A band behind the front is darker than unburned paper. Shown, but as a rim, not as brown
  paper.** I found the lowest run of purple in each column of the card (236 columns), then read
  the colour at set distances from it. Averaged, at video 2.2 s:
  - Ahead of the front (on the paper), 2 to 128 video px: RGB about 103-112 / 84-93 / 152-166.
    This is the same as paper far from the front. No darkening ahead of the front.
  - Behind the front, 4 to 8 video px: orange-brown (121/93/52, 130/85/37, 123/72/30). Mean luma
    about 84 against paper about 117.
  - 12 to 16 px: brown (98/54/23, 73/38/17). 24 px: near black (55/30/14).
  So the burned edge is an orange rim that fades to char over about 24 video px, about 5% of
  the card's width (512 video px). Then the hole shows black. Video 1.6 s gives the same shape.
  Caveat: averaging across a ragged front blurs a sharp edge into a softer one. Source: video
  1.6 s and 2.2 s; dense r2c5 and r3c3 show it by eye.
- **Ember light tints the paper near the front and fades. Not measurable.** The paper 2 to 24
  video px ahead of the front shows no warm shift in the average (red 103-105 against 105-112
  far away). The orange sits on the burned side only. Some single frames show a bright flare at
  one spot of the edge (dense r2c5, near "closed-minded"; dense r3c4). Means: the bar's required
  `tint` law adds light that the reference barely shows. The ember light's `reach` is a feel
  question for the owner.

Other things the reference does:

- **Holes show the black ground.** Every hole is black, and the next screen appears only after
  the card is gone. This matches the spec's opaque canvas. Source: overview r2c1 to r3c3.
- **The text burns with the paper.** Source: dense r3c1, video 2.2 s.
- **Heat colour.** The rim and specks are orange to yellow-orange. Their temperature is unread;
  a compressed video gives no kelvin.

What the kit cannot do (not in Task 20 or Task 23):

- **The card's tilt.** The unburned card leans a few percent as it burns. The planned engine
  pieces have no geometry warp. The bar does not copy it.
- **The flame tongue and the ember specks.** See the next section.

## Flame tongue and embers, plainly

- **Flame tongue: yes.** A tall yellow-white flame stands under the card from 0.5 to 1.3 s, then
  goes out. It is the brightest thing in the clip. Source: overview r1c3 to r1c6, video 0.9 s.
  The spec drops it. The bar has none.
- **Embers: yes, but they stay inside the card's footprint.** Orange specks fill the burned area
  from 0.6 s to about 4.2 s. At 0.5 s steps after 1.5 s, at most 9 orange pixels per frame lie
  outside the card's box. At 0.2 s steps, only 1 pixel rises above the card's top edge (3.6 s
  and 4.0 s). I compared the
  speck pattern 0.05 s and 0.1 s apart and found no common upward shift: only 5 to 22 of about
  200 speck pixels match at the best shift. By eye they read as twinkling glints in the char.
  The site caption says they are embers that "float upward and gradually fade"; my
  measurement did not confirm the upward motion. Source: video 2.0 s to 2.1 s; dense r3c5 to
  r4c8.
- **Pale specks on the success screen: yes, from 5.0 s.** Weak reading (see "What moves", 9).
- The spec says no flying embers. The reference's specks barely fly. A still, glowing speck
  pattern in the char would be a field, not particles. Whether the bar may have one is
  The owner's decision.

## Copy and do not copy

Copy the mechanism and the feel:

- A ragged front that starts at the bottom edge and climbs to the top, with pockets and islands.
- The text burns with the paper.
- A thin glowing rim on the burned edge that fades to char, then a hole that shows the ground.
- Pace: about 3.4 s from start to gone, slow at first, fastest in the middle third, the last
  strip along the top.
- After the card: a short black pause (about 0.4 s), then the next screen fades in over about
  0.5 s.
- The burn starts only on the user's action.

Do not copy (AGENTS.md, section 2): the purple, the card's size and corners, the phone frame,
the title, intro text and card text, the cloud icon, the flame button, the success screen's
words and button, and the How We Feel name. Colours come from the page through `fromPage`. Also
not copied: the flame tongue and the card's tilt (the owner's first look review brought the specks back) (spec, "Non-goals"; no
engine piece).

## Engine pieces this uses

From the plan's Task 20 and Task 23: `fields.burn` (`from: "bottom"`, seeded `rag`, `scorch`,
`startAt` set by the user's action), `materials.paper({ scorch: true })` for the rim and char,
`lights.ember` (heat colour from `kelvinToLinear`, `reach`) for the glow, `fields.text` for the
card's words, the Task 6 card tone, and `lights.ambient`. Laws: `burn`, `tint`. It must pass
`flash`.

Reference values the builder can cite: the burn length (about 3.4 s), the pace shape, the rim
width (about 5% of the card's width), the black pause and the fade-in. Values with no reading:
the kelvin range, the ember light's level and reach, the scorch curve's positions. Label those
"builder" in `notes.md`.
