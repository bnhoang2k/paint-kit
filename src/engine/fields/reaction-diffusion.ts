// `reactionDiffusion`: a grown relief, kind `grown`. Two chemicals A and B react and spread on a 512 x 512 plate
// (the Gray-Scott model): B feeds on A and decays, and the balance of feed f and kill k grows coral, splitting
// cells, worms or spots. The plate is a float ping-pong pair (R = A, G = B), wrapped at its edges, stepped with
// dA = 1.0, dB = 0.5, dt = 1.0 and the 3 x 3 Laplacian (0.2 sides, 0.05 corners, -1 centre). f and k drift
// gently across the plate (two low waves each, whose phases drift with time), so one plate holds a range of
// the family. The first state is A = 1, B = 0 with seeded discs and squares of B.
//
// It writes height (B) and coverage 1. The plate covers the sheet (cover fit: the long side spans the plate) and
// is read with bilinear filtering by hand. Height is B times `depth` plate texels (default RELIEF_TEXELS), in
// short-side units, so the relief has the same slope at any sheet size.
//
// Time: steps are counted in fixed 1/60 s ticks of 12 simulation steps, never per rendered frame (the engine's
// `tickClock`), so a live page and `setTime(t)` reach the same state at the same t, on any machine. A draw with
// dt 0 steps nothing. The field declares `settleTicks` (SETTLE_TICKS) and is `settled()` from then on; under
// reduced motion the engine replays it there once, so the page rests on the frame `?t=` SETTLE_TICKS / 60 shows.
//
// Without float render targets (`ctx.float` false: no EXT_color_buffer_float, or `?nofloat=1`) the plate cannot be
// stepped: the field draws nothing (the "no effect" layer). It logs nothing itself: the engine's one console
// warning says so, and the field would otherwise warn again on every replay (each replay re-inits it).
import { HEADER, VS_FULLSCREEN, locations, program, quad } from "../gl.ts";
import { STEP, tickClock } from "../loop.ts";
import { GLSL_SHEET, sheetDefines } from "../sheet.ts";
import type { Field } from "../types.ts";

export type ReactionDiffusionOptions = {
  /** The family. Unset, the seed picks one (seed mod 4, in this order). */
  preset?: "coral" | "cells" | "worms" | "spots";
  /**
   * Relief depth: plate texels of height per unit of B. Default RELIEF_TEXELS (18), chosen by eye from a sweep at
   * 4.5 / 9 / 18 / 27: the smallest depth that reads as raised cells in both schemes; picked before any gate run.
   */
  depth?: number;
};

/** Plate side, texels. A power of two: the wrap is a bit mask. */
const N = 512;
/** Simulation steps per 1/60 s tick. */
export const STEPS_PER_TICK = 12;
/** Ticks until the field is settled: 5 s, the state the wild sampler showed under reduced motion. */
export const SETTLE_TICKS = 300;
/**
 * Default height per unit of B, in plate texels. Chosen by eye from a sweep at 4.5 / 9 / 18 / 27 (seed 1, t 2 and
 * t 5, light and dark; out/grown-depth-*.png). 18 is the smallest depth that reads as raised cells in BOTH schemes.
 * 9 reads in light but only on a close look in dark. 27 turns to plastic pegs or bubble wrap. Picked before any
 * gate run. (4.5, the wild sampler's own normal slope, read as faint dots without its colour ramp.)
 */
export const RELIEF_TEXELS = 18;

/** Known-good (f, k) pairs. */
const PRESETS = {
  coral: { f: 0.0545, k: 0.062 },
  cells: { f: 0.0367, k: 0.0649 },
  worms: { f: 0.078, k: 0.061 },
  spots: { f: 0.03, k: 0.062 },
} as const;
const ORDER = ["coral", "cells", "worms", "spots"] as const;

const SIM = /* glsl */ `
uniform sampler2D uState;
uniform vec2 uFK;    // base f, k
uniform vec2 uAmp;   // drift amplitude of f, k across the plate
uniform vec4 uFreqF; // two integer wave vectors for f
uniform vec4 uFreqK; // two integer wave vectors for k
uniform vec4 uPhase;
out vec4 o;
const int NN = ${N};
vec2 S(ivec2 p) { return texelFetch(uState, (p + NN) & (NN - 1), 0).xy; }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 c = S(p);
  vec2 lap = -c
    + 0.2 * (S(p + ivec2(1, 0)) + S(p - ivec2(1, 0)) + S(p + ivec2(0, 1)) + S(p - ivec2(0, 1)))
    + 0.05 * (S(p + ivec2(1, 1)) + S(p + ivec2(-1, 1)) + S(p + ivec2(1, -1)) + S(p + ivec2(-1, -1)));
  vec2 uv = (vec2(p) + 0.5) / float(NN);
  const float TAU = 6.28318531;
  float gf = 0.6 * sin(TAU * dot(uv, uFreqF.xy) + uPhase.x) + 0.4 * sin(TAU * dot(uv, uFreqF.zw) + uPhase.y);
  float gk = 0.6 * sin(TAU * dot(uv, uFreqK.xy) + uPhase.z) + 0.4 * sin(TAU * dot(uv, uFreqK.zw) + uPhase.w);
  float f = uFK.x + uAmp.x * gf;
  float k = uFK.y + uAmp.y * gk;
  float a = c.x, b = c.y;
  float r = a * b * b;
  a += 1.0 * lap.x - r + f * (1.0 - a);
  b += 0.5 * lap.y + r - (k + f) * b;
  o = vec4(clamp(a, 0.0, 1.0), clamp(b, 0.0, 1.0), 0.0, 1.0);
}
`;

const DRAW = /* glsl */ `
in vec2 vUv;
uniform sampler2D uState;
uniform vec2 uCover;  // sheet uv -> plate uv scale (cover fit)
uniform float uScale; // height per unit B, short-side units
out vec4 o;
const int NN = ${N};
float T(ivec2 p) { return texelFetch(uState, (p + NN) & (NN - 1), 0).y; }
float B(vec2 x) {
  x -= 0.5;
  vec2 i = floor(x), f = fract(x);
  ivec2 q = ivec2(i);
  return mix(mix(T(q), T(q + ivec2(1, 0)), f.x), mix(T(q + ivec2(0, 1)), T(q + ivec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 uv = (vUv - 0.5) * uCover + 0.5;
  o = sheetEncode(vec4(B(uv * float(NN)) * uScale, 1.0, 0.0, -1.0));
}
`;

type Plate = { tex: WebGLTexture; fbo: WebGLFramebuffer };

export function reactionDiffusion(opts: ReactionDiffusionOptions = {}): Field {
  return {
    kind: "grown",
    writes: ["height", "coverage"],
    init(gl, ctx) {
      const { rand } = ctx;
      const depth = Math.max(0, opts.depth ?? RELIEF_TEXELS);
      const name = opts.preset ?? ORDER[(ctx.seed >>> 0) % ORDER.length]!;
      const fam = PRESETS[name];
      // Jitter and drift, all from the field's seeded stream, in the sampler's order.
      const F0 = fam.f + (rand() - 0.5) * 0.002;
      const K0 = fam.k + (rand() - 0.5) * 0.001;
      const amp = [0.0035 + rand() * 0.002, 0.0008 + rand() * 0.0006];
      const iv = () => Math.round(rand() * 2) * (rand() < 0.5 ? -1 : 1);
      const wave = () => {
        let a = iv();
        const b = iv();
        if (!a && !b) a = 1;
        return [a, b];
      };
      const freqF = [...wave(), ...wave()];
      const freqK = [...wave(), ...wave()];
      const phase0 = [rand(), rand(), rand(), rand()].map((v) => v * Math.PI * 2);
      const drift = [rand(), rand(), rand(), rand()].map((v) => (v - 0.5) * 0.08);

      // Seeded first state: A = 1, B = 0, with many small seeds (so the plate fills within seconds) and a few big ones.
      const data = new Float32Array(N * N * 4);
      for (let i = 0; i < N * N; i++) {
        data[i * 4] = 1;
        data[i * 4 + 3] = 1;
      }
      const blobs = 110 + Math.floor(rand() * 70);
      for (let n = 0; n < blobs; n++) {
        const big = rand() < 0.12;
        const cx = rand() * N;
        const cy = rand() * N;
        const rad = big ? 6 + rand() * 6 : 2 + rand() * 3;
        const square = rand() < 0.5;
        const r = Math.ceil(rad);
        for (let y = -r; y <= r; y++) {
          for (let x = -r; x <= r; x++) {
            if (!square && x * x + y * y > rad * rad) continue;
            const o = (((Math.floor(cy + y) + N) % N) * N + ((Math.floor(cx + x) + N) % N)) * 4;
            data[o] = 0.5;
            data[o + 1] = 0.9 + rand() * 0.1;
          }
        }
      }

      // The engine enabled EXT_color_buffer_float when it is there, so `ctx.float` says whether RGBA32F can be drawn to.
      const canStep = ctx.float;
      const plate = (): Plate => {
        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, N, N, 0, gl.RGBA, gl.FLOAT, data);
        for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
        const fbo = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { tex, fbo };
      };
      let read: Plate | undefined;
      let write: Plate | undefined;
      let sim: { prog: WebGLProgram; loc: ReturnType<typeof locations> } | undefined;
      if (canStep) {
        read = plate();
        write = plate();
        const prog = program(gl, VS_FULLSCREEN, HEADER + SIM);
        sim = { prog, loc: locations(gl, prog) };
      }
      let draw: { float: boolean; prog: WebGLProgram; loc: ReturnType<typeof locations> } | undefined;
      const clock = tickClock();

      /** Runs `count` ticks after the first `from`. */
      const step = (from: number, count: number) => {
        if (!sim || !read || !write || count <= 0) return;
        const { prog, loc } = sim;
        gl.useProgram(prog);
        gl.uniform2f(loc("uFK"), F0, K0);
        gl.uniform2f(loc("uAmp"), amp[0]!, amp[1]!);
        gl.uniform4fv(loc("uFreqF"), freqF);
        gl.uniform4fv(loc("uFreqK"), freqK);
        gl.uniform1i(loc("uState"), 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.viewport(0, 0, N, N);
        for (let i = 0; i < count; i++) {
          // The drift reads the plate's own clock (ticks run), not the wall clock.
          const at = (from + i + 1) * STEP;
          gl.uniform4f(loc("uPhase"), phase0[0]! + drift[0]! * at, phase0[1]! + drift[1]! * at, phase0[2]! + drift[2]! * at, phase0[3]! + drift[3]! * at);
          for (let s = 0; s < STEPS_PER_TICK; s++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
            gl.bindTexture(gl.TEXTURE_2D, read.tex);
            quad(gl);
            [read, write] = [write, read];
          }
        }
      };

      return {
        // A plate that cannot step has nothing to settle: no settle ticks, so reduced motion replays no empty ticks.
        settleTicks: canStep ? SETTLE_TICKS : 0,
        settled: () => !canStep || clock.ticks >= SETTLE_TICKS,
        draw(sheet, t, dt) {
          const from = clock.ticks;
          step(from, clock.advance(t, dt));
          if (!read) return; // cannot step: leave the "no effect" layer the engine cleared
          if (!draw || draw.float !== sheet.float) {
            if (draw) gl.deleteProgram(draw.prog);
            const prog = program(gl, VS_FULLSCREEN, HEADER + sheetDefines(sheet.float) + GLSL_SHEET + DRAW);
            draw = { float: sheet.float, prog, loc: locations(gl, prog) };
          }
          const { prog, loc } = draw;
          // Cover fit: the long side spans the plate. One plate texel is long / N sheet px, short-side units below.
          const long = Math.max(sheet.w, sheet.h);
          const short = Math.min(sheet.w, sheet.h);
          const cover = sheet.w >= sheet.h ? [1, sheet.h / sheet.w] : [sheet.w / sheet.h, 1];
          sheet.out.bind();
          gl.useProgram(prog);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, read.tex);
          gl.uniform1i(loc("uState"), 0);
          gl.uniform2f(loc("uCover"), cover[0]!, cover[1]!);
          gl.uniform1f(loc("uScale"), (depth * long) / (N * short));
          quad(gl);
        },
        resize() {},
        dispose() {
          for (const p of [read, write]) {
            if (!p) continue;
            gl.deleteFramebuffer(p.fbo);
            gl.deleteTexture(p.tex);
          }
          if (sim) gl.deleteProgram(sim.prog);
          if (draw) gl.deleteProgram(draw.prog);
          read = write = undefined;
          sim = draw = undefined;
        },
      };
    },
  };
}
