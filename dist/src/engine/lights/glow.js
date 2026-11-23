const ACCENTS = [0.25, 0.5, 0.75];
/**
 * The time a moving glow's test positions read its `at` at: 2 s, the time the checks freeze a page at
 * (src/checks/relight.ts). Both test positions hold still there, so moveLight gives the same light at any t.
 */
export const GLOW_TEST_TIME = 2;
const atOf = (at, t) => {
    const a = typeof at === "function" ? at(t) : at;
    return [a[0], a[1]];
};
/**
 * A glow; see the file header for its frame. Test positions: the declared glow, and the glow moved by its radius
 * along y toward the middle. y is used because on a landscape canvas a y fraction is exactly short-side units.
 * A moving `at` is read at GLOW_TEST_TIME for both. `follow` is kept by both, as by `with`.
 */
export function glow(opts, declared = opts) {
    const hues = opts.hues === "accents" ? ACCENTS : opts.hues;
    if (hues.length < 1 || hues.length > 4)
        throw new RangeError(`paint-kit: glow takes 1 to 4 hues, got ${hues.length}`);
    const packed = [0, 1, 2, 3].map((i) => Math.min(1, Math.max(0, hues[Math.min(i, hues.length - 1)])));
    const uniforms = {
        at: atOf(opts.at, 0),
        radius: Math.max(opts.radius, 1e-4),
        level: opts.level,
        tint: Math.min(1, Math.max(0, opts.tint ?? 1)),
        hues: packed,
        count: hues.length,
    };
    return {
        id: "glow",
        laws: opts.behind ? ["transmit"] : ["tint"],
        ...(opts.behind ? { behind: true } : {}),
        props: { ...opts },
        uniforms,
        with: (p) => glow({ ...opts, ...p }, declared),
        // The one place a glow's centre is made per draw: at(t) + follow x (pointer - 0.5).
        ...(typeof opts.at === "function" || opts.follow
            ? {
                frame: (t, [px, py]) => {
                    const [x, y] = atOf(opts.at, t);
                    const f = opts.follow ?? 0;
                    return { at: [x + f * (px - 0.5), y + f * (py - 0.5)] };
                },
            }
            : {}),
        testPositions: (step) => {
            const [x, y] = atOf(declared.at, GLOW_TEST_TIME);
            const dy = step === 0 ? 0 : y > 0.5 ? -declared.radius : declared.radius;
            return { at: [x, y + dy] };
        },
        glsl: /* glsl */ `
uniform vec2 u_$_at;
uniform float u_$_radius, u_$_level, u_$_tint, u_$_count;
uniform vec4 u_$_hues;
LightSum light_$(Surf s, MatOut m) {
  vec2 sc = uSheetSize / min(uSheetSize.x, uSheetSize.y);
  vec2 c = vec2((u_$_at.x - 0.5) * sc.x, (0.5 - u_$_at.y) * sc.y);
  vec2 rel = (s.q - c) / u_$_radius;
  float r2 = dot(rel, rel);
  // Smooth to exactly 0 at the radius, with no slope there.
  float f = r2 < 1.0 ? (1.0 - r2) * (1.0 - r2) : 0.0;
  // Across the glow the colour drifts through the hue list, by a slow noise seeded per page.
  int n = int(u_$_count + 0.5);
  float k = clamp(snoise(rel * 0.9 + uSeed * 0.13) * 0.5 + 0.5, 0.0, 1.0) * float(n - 1);
  int i = int(min(floor(k), float(max(n - 2, 0))));
  vec3 col = n <= 1 ? ramp(u_$_hues[0]) : mixOklab(ramp(u_$_hues[i]), ramp(u_$_hues[i + 1]), k - float(i));
  // Light of the ramp colour's hue and chroma (times tint) at a fixed lightness, scaled to luminance about 1.
  vec3 lab = _toOklab(col);
  lab.yz *= u_$_tint;
  lab.x = 0.8;
  col = max(_fromOklab(lab), 0.0) / 0.512;
  LightSum r;
  r.diffuse = col * (u_$_level * f);
  r.spec = vec3(0.0); // not-colour: a glow has no highlight
  return r;
}
`,
    };
}
