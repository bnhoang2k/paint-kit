// WebGL2 plumbing: programs, the full-screen triangle, render targets and uniform setting.
// Ported from lab/2026-11-wild-sampler/lib.js (program, quad, target).

export const HEADER = "#version 300 es\nprecision highp float;\nprecision highp int;\n";

/** Full-screen triangle with no buffers. Gives `vUv` in 0..1 (y up). Pair with `quad(gl)`. */
export const VS_FULLSCREEN = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const numbered = (src: string) =>
  src
    .split("\n")
    .map((l, i) => `${String(i + 1).padStart(4)}| ${l}`)
    .join("\n");

/** Compiles and links. On failure throws an Error carrying the info log and the numbered source. */
export function program(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const compile = (type: number, src: string, label: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(`paint-kit: ${label} shader failed to compile:\n${log}\n${numbered(src)}`);
    }
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, vertexSource, "vertex");
  const fs = compile(gl.FRAGMENT_SHADER, fragmentSource, "fragment");
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(`paint-kit: program failed to link:\n${log}\n--- fragment ---\n${numbered(fragmentSource)}`);
  }
  return p;
}

const vaos = new WeakMap<WebGL2RenderingContext, WebGLVertexArrayObject>();
/** Draws one full-screen triangle with the current program. */
export function quad(gl: WebGL2RenderingContext): void {
  let vao = vaos.get(gl);
  if (!vao) {
    vao = gl.createVertexArray()!;
    vaos.set(gl, vao);
  }
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/** Uniform locations by name, looked up once per program. */
export function locations(gl: WebGL2RenderingContext, prog: WebGLProgram): (name: string) => WebGLUniformLocation | null {
  const cache = new Map<string, WebGLUniformLocation | null>();
  return (name) => {
    if (!cache.has(name)) cache.set(name, gl.getUniformLocation(prog, name));
    return cache.get(name)!;
  };
}

/** Sets a float uniform: a number is a float, an array of 2..4 a vector, any other length a float array. */
export function setUniform(gl: WebGL2RenderingContext, loc: WebGLUniformLocation | null, v: number | number[]): void {
  if (!loc) return;
  if (typeof v === "number") gl.uniform1f(loc, v);
  else if (v.length === 2) gl.uniform2fv(loc, v);
  else if (v.length === 3) gl.uniform3fv(loc, v);
  else if (v.length === 4) gl.uniform4fv(loc, v);
  else gl.uniform1fv(loc, v);
}

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
export function target(gl: WebGL2RenderingContext, w: number, h: number, float: boolean, rg = false): Target {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if (float && rg) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, w, h, 0, gl.RG, gl.HALF_FLOAT, null);
  else if (float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE && !gl.isContextLost()) {
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex);
    throw new Error(`paint-kit: render target ${w}x${h} is incomplete (status 0x${status.toString(16)})`);
  }
  return {
    tex,
    fbo,
    w,
    h,
    float,
    bind() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, w, h);
    },
    dispose() {
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(tex);
    },
  };
}

/** Binds `tex` to texture unit `unit` and points the sampler uniform at it. */
export function bindTexture(gl: WebGL2RenderingContext, loc: WebGLUniformLocation | null, unit: number, tex: WebGLTexture): void {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if (loc) gl.uniform1i(loc, unit);
}
