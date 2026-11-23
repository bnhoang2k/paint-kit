// The engine's public entry, served to pages as `paint-kit` through an import map.
import { burn } from "./fields/burn.js";
import { halftone } from "./fields/halftone.js";
import { reactionDiffusion } from "./fields/reaction-diffusion.js";
import { shape, sheet } from "./fields/shape.js";
import { text } from "./fields/text.js";
import { twill } from "./fields/twill.js";
import { water } from "./fields/water.js";
import { ambient, key } from "./lights/basic.js";
import { ember } from "./lights/ember.js";
import { glow } from "./lights/glow.js";
import { lamp } from "./lights/lamp.js";
import { throughWater } from "./lights/through-water.js";
import { denim } from "./materials/denim.js";
import { film } from "./materials/film.js";
import { foil } from "./materials/foil.js";
import { glass } from "./materials/glass.js";
import { matte } from "./materials/matte.js";
import { paper } from "./materials/paper.js";
import { sheen } from "./materials/sheen.js";
import { water as waterMaterial } from "./materials/water.js";
export * from "./palette.js";
/** The twill weave as a GLSL chunk for a page's own shape field; see ./glsl/twill.ts. `fields.twill` builds from it. */
export { GLSL_TWILL, TWILL_RATIO } from "./glsl/twill.js";
/** The water surface and its optics as GLSL chunks; see ./glsl/water.ts. `fields.water` builds from them. */
export { GLSL_WATER, GLSL_WATER_OPTICS } from "./glsl/water.js";
/** Light that physics colours (a wavelength, a temperature) and its pull toward the page's ramp; see ./spectrum.ts. */
export { CIE_1931_2DEG, blackbodyXyz, pullToRamp, spectrumLut, wavelengthToLinear } from "./spectrum.js";
/** The spectrum and the pull as a GLSL chunk (`pk_spectrum`, `pk_pull`); see ./glsl/spectrum.ts. */
export { GLSL_SPECTRUM } from "./glsl/spectrum.js";
export { paint } from "./paint.js";
export { easeOfTau, pathAt } from "./pointer.js";
// Later tasks add their fields, materials and lights to these objects.
export const fields = { shape, sheet, text, twill, halftone, reactionDiffusion, water, burn };
export const materials = { matte, paper, denim, sheen, glass, water: waterMaterial, foil, film };
export const lights = { ambient, key, lamp, glow, throughWater, ember };
export { lampRingPoint, lampSheetPoint, pageToSheet, sheetToPage } from "./lights/lamp.js";
