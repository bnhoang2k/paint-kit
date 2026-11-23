// `water`: a pool, seen from above. What lies under the surface (`under`, a picture) is refracted by the water's
// slope: the eye looks straight down, bends at the surface and meets the floor, so the floor wobbles as the waves
// pass. The pool's geometry (the floor's depth, the index of refraction, the pictures' shift and the per-pixel rise)
// is the water field's (`fields.water`), which `lights.throughWater` reads too, so the picture and its caustic lines
// bend at the same depth; `fields.water` must be on the paint. The surface itself is a sharp, faint mirror: its
// normal is the water's, its highlight small, so a light gives glints on the wave faces. Laws: none of its own;
// `lights.throughWater` carries the caustic.
//
// `under` is a tone map, not a colour picture: its red channel is a position on the page's ramp (0 the ground
// token, 1 the ink token, the accents between), so the floor follows the tokens in either scheme and the page never
// writes a colour. Draw it at the canvas's aspect; it is stretched over the canvas and uploaded once per material
// object (repainting the canvas does not reach the GPU: move the floor through the field's floor, shift and rise).
// When the field has a lifted layer (`fields.water({ layer })`), the material draws it over the floor where it
// covers, refracted at the layer's own depth.
import type { Material } from "../types.ts";

export type WaterMaterialOptions = {
  under: HTMLCanvasElement;
};

export function water(opts: WaterMaterialOptions): Material {
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
