import { FOIL_GRAIN, FOIL_ROUGHNESS } from "./foil.js";
import { TONE_GLSL, resolveTone, tonePosition } from "./tone.js";
/** The default `roughness`. Builder: foil's default, the same satin lobe, chosen before any film was read. */
export const FILM_ROUGHNESS = FOIL_ROUGHNESS;
const bad = (what, v) => {
    throw new RangeError(`paint-kit: materials.film ${what}, got ${String(v)}`);
};
export function film(opts) {
    const r = opts.range;
    if (!(Array.isArray(r) && r.length === 2 && r.every((v) => Number.isFinite(v) && v >= 0)))
        bad("range is [thickness at param 0, thickness at param 1] in nm, each 0 or more", JSON.stringify(r));
    const range = [opts.range[0], opts.range[1]];
    if (!(Number.isFinite(opts.ior) && opts.ior >= 1))
        bad("ior is an index of refraction, 1 or more", opts.ior);
    if (opts.base !== "metal" && opts.base !== "dielectric")
        bad('base is "metal" or "dielectric"', JSON.stringify(opts.base));
    if (!(Number.isFinite(opts.pull) && opts.pull >= 0 && opts.pull <= 1))
        bad("pull is an amount 0..1", opts.pull);
    if (opts.pullTarget !== "nearest" && opts.pullTarget !== "ground")
        bad('pullTarget is "nearest" or "ground"', JSON.stringify(opts.pullTarget));
    const rough = opts.roughness ?? FILM_ROUGHNESS;
    if (!(Number.isFinite(rough) && rough >= 0 && rough <= 1))
        bad("roughness is 0..1", rough);
    return {
        id: "film",
        laws: ["iridescence", "highlight"],
        film: { range, ior: opts.ior, base: opts.base },
        uniforms: {
            range,
            ior: opts.ior,
            base: opts.base === "metal" ? 1 : 0,
            pull: opts.pull,
            target: opts.pullTarget === "ground" ? 1 : 0,
            rough: Math.max(0.03, rough),
        },
        resolve: resolveTone(tonePosition(opts)),
        // The film itself (and GLSL_SPECTRUM) is the shade pass's, compiled in because `film` is set: the colour depends on
        // each light's direction, which a material does not see.
        glsl: TONE_GLSL +
            /* glsl */ `
uniform vec2 u_$_range;
uniform float u_$_ior, u_$_base, u_$_pull, u_$_target, u_$_rough;
MatOut mat_$(Surf s) {
  MatOut m = matBase(s, u_$_tone);
  // The fine structure the detail dial draws, foil's grain (FOIL_GRAIN, builder), at the rest position. Off at detail 0.
  if (uDetail > 0.0) {
    float side = min(uSheetSize.x, uSheetSize.y);
    vec2 p = s.rest * side * ${FOIL_GRAIN.cycles.toFixed(6)};
    vec2 grain = vec2(snoise(p + uSeed * 0.37), snoise(p.yx + vec2(17.3, -9.1) + uSeed * 0.53)); // not-colour: noise offsets
    m.n = normalize(s.n + vec3(grain * ${FOIL_GRAIN.slope.toFixed(4)} * uDetail, 0.0)); // not-colour: a normal vector
  }
  // Foil's dim body (builder): the key's diffuse is lit / ref, so a brighter body would push the slopes that hold the
  // lobe's peak over the finish's knee.
  bool inkDark = dot(uInk, vec3(0.2126, 0.7152, 0.0722)) < dot(u_$_tone, vec3(0.2126, 0.7152, 0.0722)); // not-colour: Rec. 709 luminance weights
  m.albedo = 0.6 * mixOklab(inkDark ? uInk : u_$_tone, inkDark ? u_$_tone : uInk, 0.3);
  m.spec = 0.9;
  m.rough = u_$_rough;
  m.aniso = 0.0;
#ifdef PK_FAULT_FILM_NO_THICKNESS
  // The planted fault film-no-thickness (paint.ts TEST_FAULTS): the thickness is the range's middle, and param is ignored.
  m.film = vec4(0.5 * (u_$_range.x + u_$_range.y), u_$_ior, u_$_pull, u_$_target); // not-colour: thickness nm, index, pull, target
#else
  m.film = vec4(mix(u_$_range.x, u_$_range.y, s.param), u_$_ior, u_$_pull, u_$_target); // not-colour: thickness nm, index, pull, target
#endif
  m.filmBase = u_$_base;
  m.filmShare = 1.0;
  m = printInk(m, s, 0.0, s.dir);
  // Ink over film: the ink covers the film by its amount.
  m.filmShare *= 1.0 - clamp(s.ink, 0.0, 1.0);
  return m;
}
`,
    };
}
