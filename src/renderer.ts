import { MediaItem } from "./media";
import { Resolution } from "./types/resolution";
import { RenderTransform } from "./transform";

type RendererAttributes = {
  position: number;
  textureCoords: number;
};

type RendererUniforms = {
  resolution: WebGLUniformLocation;

  scale: WebGLUniformLocation;
  rotation: WebGLUniformLocation;
  translation: WebGLUniformLocation;

  blur: WebGLUniformLocation;
  opacity: WebGLUniformLocation;
  contrast: WebGLUniformLocation;
  brightness: WebGLUniformLocation;

  texture: WebGLUniformLocation;
};

export class Renderer {
  private gl: WebGLRenderingContext;

  private program: WebGLProgram;

  private attributes: RendererAttributes;
  private uniforms: RendererUniforms;

  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    vertexShaderSource: string,
    fragmentShaderSource: string
  ) {
    const context = canvas.getContext("webgl", {
      antialias: true,
      premultipliedAlpha: false
    });

    if (!context) {
      throw new Error("Failed to create WebGL context");
    }

    this.gl = context;

    this.program = this.createProgram(vertexShaderSource, fragmentShaderSource);

    this.attributes = {
      position: context.getAttribLocation(this.program, "a_position"),
      textureCoords: context.getAttribLocation(this.program, "a_textureCoords"),
    };

    this.uniforms = {
      resolution: this.getUniformLocation("u_resolution"),

      scale: this.getUniformLocation("u_scale"),
      rotation: this.getUniformLocation("u_rotation"),
      translation: this.getUniformLocation("u_translation"),

      blur: this.getUniformLocation("u_blur"),
      opacity: this.getUniformLocation("u_opacity"),
      contrast: this.getUniformLocation("u_contrast"),
      brightness: this.getUniformLocation("u_brightness"),

      texture: this.getUniformLocation("u_texture"),
    };
  }

  setupQuad() {
    const quad = [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1];

    const positionBuffer = this.positionBuffer ?? this.gl.createBuffer();
    const texCoordBuffer = this.texCoordBuffer ?? this.gl.createBuffer();

    if (!positionBuffer || !texCoordBuffer) {
      throw new Error("Failed to create WebGL buffers");
    }

    this.positionBuffer = positionBuffer;
    this.texCoordBuffer = texCoordBuffer;

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(quad), this.gl.STATIC_DRAW);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, texCoordBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(quad), this.gl.STATIC_DRAW);

    this.gl.useProgram(this.program);

    this.gl.enableVertexAttribArray(this.attributes.position);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
    this.gl.vertexAttribPointer(this.attributes.position, 2, this.gl.FLOAT, false, 0, 0);

    this.gl.enableVertexAttribArray(this.attributes.textureCoords);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, texCoordBuffer);
    this.gl.vertexAttribPointer(this.attributes.textureCoords, 2, this.gl.FLOAT, false, 0, 0);

    this.gl.uniform1i(this.uniforms.texture, 0);
  }

  resetState() {
    this.gl.clearColor(0, 0, 0, 0);

    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, 0);
  }

  setViewport(resolution: Resolution, canvas: HTMLCanvasElement | null) {
    if (!canvas) {
      return;
    }

    const { width, height, dpr } = resolution;

    const scaledWidth = Math.max(1, Math.floor(width * dpr));
    const scaledHeight = Math.max(1, Math.floor(height * dpr));

    if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;

      this.gl.viewport(0, 0, scaledWidth, scaledHeight);
    }

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  renderItems(
    items: MediaItem[],
    resolution: Resolution,
    getTransform: (item: MediaItem, resolution: Resolution) => RenderTransform
  ) {
    if (resolution.width === 0 || resolution.height === 0) {
      return;
    }

    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.useProgram(this.program);

    this.gl.uniform2f(
      this.uniforms.resolution,
      resolution.width * resolution.dpr,
      resolution.height * resolution.dpr
    );

    items.forEach((item) => {
      const textureUpdated = this.updateTexture(item);

      if (!textureUpdated) {
        return;
      }

      const transform = getTransform(item, resolution);

      this.gl.bindTexture(this.gl.TEXTURE_2D, item.texture);

      this.gl.uniform2f(
        this.uniforms.translation,
        transform.translation.x * resolution.dpr,
        transform.translation.y * resolution.dpr
      );

      this.gl.uniform2f(
        this.uniforms.scale,
        transform.scale.x * resolution.dpr,
        transform.scale.y * resolution.dpr
      );

      this.gl.uniform2f(
        this.uniforms.rotation,
        Math.cos(transform.rotation),
        Math.sin(transform.rotation)
      );

      this.gl.uniform1f(this.uniforms.opacity, item.opacity);
      this.gl.uniform1f(this.uniforms.blur, item.blur * resolution.dpr);
      this.gl.uniform1f(this.uniforms.brightness, item.brightness);
      this.gl.uniform1f(this.uniforms.contrast, item.contrast);

      this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    });
  }

  deleteBuffers() {
    if (this.positionBuffer) {
      this.gl.deleteBuffer(this.positionBuffer);
      this.positionBuffer = null;
    }

    if (this.texCoordBuffer) {
      this.gl.deleteBuffer(this.texCoordBuffer);
      this.texCoordBuffer = null;
    }

    this.gl.deleteProgram(this.program);
  }

  createTexture(): WebGLTexture {
    const texture = this.gl.createTexture();

    if (!texture) {
      throw new Error("Failed to create WebGL texture");
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      1,
      1,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );

    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);

    return texture;
  }

  updateTexture(item: MediaItem): boolean {
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

        this.gl.bindTexture(this.gl.TEXTURE_2D, item.texture);

        try {
          this.gl.texImage2D(
            this.gl.TEXTURE_2D,
            0,
            this.gl.RGBA,
            this.gl.RGBA,
            this.gl.UNSIGNED_BYTE,
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

      this.gl.bindTexture(this.gl.TEXTURE_2D, item.texture);

      try {
        this.gl.texImage2D(
          this.gl.TEXTURE_2D,
          0,
          this.gl.RGBA,
          this.gl.RGBA,
          this.gl.UNSIGNED_BYTE,
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

  deleteTexture(texture: WebGLTexture) {
    this.gl.deleteTexture(texture);
  }

  createShader(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type);

    if (!shader) {
      throw new Error("Failed to create WebGL shader");
    }

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      this.gl.deleteShader(shader);

      throw new Error("Failed to compile WebGL shader");
    }

    return shader;
  }

  createProgram(
    vertexShaderSource: string,
    fragmentShaderSource: string
  ): WebGLProgram {
    const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);

    const program = this.gl.createProgram();

    if (!program) {
      throw new Error("Failed to create WebGL program");
    }

    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);

    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const info = this.gl.getProgramInfoLog(program);

      this.gl.deleteProgram(program);

      throw new Error("Failed to link WebGL program:" + info);
    }

    this.gl.deleteShader(vertexShader);
    this.gl.deleteShader(fragmentShader);

    return program;
  }

  getUniformLocation(uniformName: string): WebGLUniformLocation {
    const location = this.gl.getUniformLocation(this.program, uniformName);

    if (!location) {
      throw new Error(`Missing WebGL shader uniform: ${uniformName}`);
    }

    return location;
  }
}
