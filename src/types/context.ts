
export type WebGLContextState = {
  gl: WebGLRenderingContext;
  program: WebGLProgram;

  attributes: {
    position: number;
    textureCoords: number;
  };

  uniforms: {
    resolution: WebGLUniformLocation;

    scale: WebGLUniformLocation;
    rotation: WebGLUniformLocation;
    translation: WebGLUniformLocation;

    opacity: WebGLUniformLocation;
    texture: WebGLUniformLocation;
  };
};