import { MediaItem } from "./types/media";

export function createTexture(gl: WebGLRenderingContext): WebGLTexture {
  const texture = gl.createTexture();

  if (!texture) {
    throw new Error("Failed to create WebGL texture");
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);

  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 0])
  );

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  return texture;
}

export function updateTexture(gl: WebGLRenderingContext, item: MediaItem): boolean {
  if (item.state === "error") {
    return false;
  }

  if (item.type === "image") {
    const image = item.source as HTMLImageElement;

    if (!item.uploaded && image.complete) {
      if (image.naturalWidth === 0) {
        item.state = "error";
        return false;
      }

      gl.bindTexture(gl.TEXTURE_2D, item.texture);

      try {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          image
        );

        item.aspect = image.naturalWidth / image.naturalHeight;
        item.uploaded = true;
        item.state = "ready";
      } catch {
        item.state = "error";
        return false;
      }
    }

    return item.uploaded;
  }

  const video = item.source as HTMLVideoElement;

  if (video.error) {
    item.state = "error";
    return false;
  }

  if (video.readyState >= 2) {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      item.aspect = video.videoWidth / video.videoHeight;
    }

    gl.bindTexture(gl.TEXTURE_2D, item.texture);

    try {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        video
      );

      item.uploaded = true;
      item.state = "ready";

      return true;
    } catch {
      item.state = "error";

      return false;
    }
  }

  return false;
}

export function createShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error("Failed to create WebGL shader");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);

    throw new Error("Failed to compile WebGL shader");
  }
  return shader;
}

export function createProgram(
  gl: WebGLRenderingContext,
  vertexShaderSource: string,
  fragmentShaderSource: string
): WebGLProgram {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

  const program = gl.createProgram();

  if (!program) {
    throw new Error("Failed to create WebGL program");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);

  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);

    throw new Error("Failed to link WebGL program");
  }

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  return program;
}

export function getUniformLocation(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  uniformName: string
): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, uniformName);

  if (!location) {
    throw new Error(`Missing WebGL shader uniform: ${uniformName}`);
  }

  return location;
}