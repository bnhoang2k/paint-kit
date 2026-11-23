export declare const HEADER = "#version 300 es\nprecision highp float;\nprecision highp int;\n";
/** Full-screen triangle with no buffers. Gives `vUv` in 0..1 (y up). Pair with `quad(gl)`. */
export declare const VS_FULLSCREEN = "#version 300 es\nout vec2 vUv;\nvoid main() {\n  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));\n  vUv = p;\n  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);\n}";
/** Compiles and links. On failure throws an Error carrying the info log and the numbered source. */
export declare function program(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram;
/** Draws one full-screen triangle with the current program. */
export declare function quad(gl: WebGL2RenderingContext): void;
/** Uniform locations by name, looked up once per program. */
export declare function locations(gl: WebGL2RenderingContext, prog: WebGLProgram): (name: string) => WebGLUniformLocation | null;
/** Sets a float uniform: a number is a float, an array of 2..4 a vector, any other length a float array. */
export declare function setUniform(gl: WebGL2RenderingContext, loc: WebGLUniformLocation | null, v: number | number[]): void;
export type Target = {
    tex: WebGLTexture;
    fbo: WebGLFramebuffer;
    w: number;
    h: number;
    /** RGBA16F (RG16F for a two-channel target) when true, RGBA8 otherwise. */
    float: boolean;
    /** Binds the framebuffer and sets the viewport. */
    bind(): void;
    dispose(): void;
};
/**
 * An RGBA render target, nearest-sampled and clamped. `rg` makes the float form two channels (RG16F, half the
 * memory; renderable under the same EXT_color_buffer_float); the 8-bit form stays RGBA8.
 */
export declare function target(gl: WebGL2RenderingContext, w: number, h: number, float: boolean, rg?: boolean): Target;
/** Binds `tex` to texture unit `unit` and points the sampler uniform at it. */
export declare function bindTexture(gl: WebGL2RenderingContext, loc: WebGLUniformLocation | null, unit: number, tex: WebGLTexture): void;
