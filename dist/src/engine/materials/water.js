export function water(opts) {
    return {
        id: "water",
        laws: [],
        uniforms: {},
        textures: { under: opts.under },
        glsl: /* glsl */ `
uniform sampler2D u_$_under;
MatOut mat_$(Surf s) {
  MatOut m = matBase(s);
  Water w = waterAt(s.q, uTime);
  vec2 seen = waterSeen(s.q, w.g);
  m.albedo = ramp(texture(u_$_under, waterFloorUv(seen)).r);
  if (uWaterHasLayer > 0.5) {
    // The field's lifted layer, seen at its own depth, over the floor where it covers and lies above the floor.
    vec2 l = waterLayerOver(waterLayerSeen(s.q, w.g), seen);
    m.albedo = mix(m.albedo, ramp(l.x), l.y);
  }
  m.n = normalize(vec3(-w.g, 1.0)); // not-colour: the water's normal
  m.spec = 0.3;
  m.rough = 0.12;
  return printInk(m, s, 0.0, s.dir);
}
`,
    };
}
