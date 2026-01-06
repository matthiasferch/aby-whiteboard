import { useEffect, useRef } from "react";
import type { PointerEvent } from "react";
import {
  getLength,
  clampValue,
  calculateTransformedVertices,
  calculateInitialTransform
} from "../utilities";
import { vertexShader, fragmentShader } from "../shaders";
import { createProgram, getUniformLocation, createTexture, updateTexture } from "../renderer";
import { WebGLContextState } from "../types/context";
import { MediaRequest, MediaItem, MediaState } from "../types/media";
import { ActiveTransform, TransformMode, RenderTransform } from "../types/transform";
import { Vector } from "../types/vector";
import { Resolution } from "../types/resolution";

type WhiteboardProps = {
  mediaRequests: MediaRequest[];
};

export default function Whiteboard({
  mediaRequests,
}: WhiteboardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mediaCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const frameRef = useRef<number | null>(null);
  const glStateRef = useRef<WebGLContextState | null>(null);
  const resolutionRef = useRef<Resolution>({ width: 0, height: 0, dpr: 1 });

  const mediaItemsRef = useRef<MediaItem[]>([]);
  const completedRequestsRef = useRef<Set<string>>(new Set());

  const selectedItemRef = useRef<string | null>(null);
  const activeTransformRef = useRef<ActiveTransform | null>(null);

  // canvas resize effect

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const observer = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();

      const resolution = {
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),

        dpr: window.devicePixelRatio || 1
      }

      resolutionRef.current = resolution;

      resizeMediaCanvas(resolution, glStateRef.current, mediaCanvasRef.current);
      resizeOverlayCanvas(resolution, overlayCanvasRef.current);
    });

    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  // WebGL setup effect

  useEffect(() => {
    const canvas = mediaCanvasRef.current;

    if (!canvas) {
      return;
    }

    const gl = canvas.getContext("webgl", {
      antialias: true,
      premultipliedAlpha: false
    });

    if (!gl) {
      return;
    }

    const program = createProgram(gl, vertexShader, fragmentShader);

    const positionLocation = gl.getAttribLocation(program, "a_position");
    const textureCoordsLocation = gl.getAttribLocation(program, "a_textureCoords");

    const resolutionLocation = getUniformLocation(gl, program, "u_resolution");

    const scaleLocation = getUniformLocation(gl, program, "u_scale");
    const rotationLocation = getUniformLocation(gl, program, "u_rotation");
    const translationLocation = getUniformLocation(gl, program, "u_translation");

    const opacityLocation = getUniformLocation(gl, program, "u_opacity");
    const textureLocation = getUniformLocation(gl, program, "u_texture");

    const state: WebGLContextState = {
      gl,
      program,

      attributes: {
        position: positionLocation,
        textureCoords: textureCoordsLocation,
      },

      uniforms: {
        resolution: resolutionLocation,

        scale: scaleLocation,
        rotation: rotationLocation,
        translation: translationLocation,

        opacity: opacityLocation,
        texture: textureLocation,
      },
    };

    glStateRef.current = state;

    const resolution = resolutionRef.current;

    if (resolution.width > 0 && resolution.height > 0) {
      resizeMediaCanvas(resolution, state, canvas);
    }

    const positionBuffer = gl.createBuffer();
    const texCoordBuffer = gl.createBuffer();

    if (!positionBuffer || !texCoordBuffer) {
      return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quad), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quad), gl.STATIC_DRAW);

    gl.useProgram(program);

    gl.enableVertexAttribArray(positionLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.enableVertexAttribArray(textureCoordsLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.vertexAttribPointer(textureCoordsLocation, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1i(textureLocation, 0);

    gl.clearColor(0, 0, 0, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);

    mediaItemsRef.current = [];

    const update = () => {
      renderMediaItems(
        state,
        mediaItemsRef.current,
        resolutionRef.current
      );

      renderOverlay(
        overlayCanvasRef.current,
        mediaItemsRef.current,
        selectedItemRef.current,
        resolutionRef.current
      );

      frameRef.current = requestAnimationFrame(update);
    };

    frameRef.current = requestAnimationFrame(update);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }

      mediaItemsRef.current.forEach((item) => {
        gl.deleteTexture(item.texture)
      });

      gl.deleteProgram(program);

      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(texCoordBuffer);
    };
  }, []);

  // media requests effect

  useEffect(() => {
    if (!glStateRef.current) {
      return;
    }

    const { gl } = glStateRef.current;

    mediaRequests.forEach((request) => {
      if (completedRequestsRef.current.has(request.id)) {
        return; // already processed
      }

      const item =
        request.type === "image"
          ? createImageItemFromUrl(
            gl,
            request.url,
            request.id,
            mediaItemsRef.current
          )
          : createVideoItemFromUrl(
            gl,
            request.url,
            request.id,
            mediaItemsRef.current
          );

      mediaItemsRef.current.push(item);

      selectedItemRef.current = item.id;

      completedRequestsRef.current.add(request.id);
    });
  }, [mediaRequests]);

  // window event listener effect

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }

      const selectedItem = selectedItemRef.current;

      if (!selectedItem) {
        return;
      }

      const index = mediaItemsRef.current.findIndex(
        (item) => item.id === selectedItem
      );

      if (index === -1) {
        selectedItemRef.current = null;
        return;
      }

      const [removedItem] = mediaItemsRef.current.splice(index, 1);

      selectedItemRef.current = null;
      activeTransformRef.current = null;

      const glState = glStateRef.current;

      if (glState?.gl) {
        glState.gl.deleteTexture(removedItem.texture);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // pointer event handlers

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) {
      return;
    }

    const overlay = overlayCanvasRef.current;

    if (!overlay) {
      return;
    }

    const startPoint = calculateCanvasPoint(event, overlay);
    const selectedItem = getSelectedItem(startPoint, mediaItemsRef.current, resolutionRef.current);

    if (selectedItem?.transform) {
      const mode: TransformMode = event.altKey
        ? "rotate"
        : event.shiftKey
          ? "scale"
          : "move";

      const startTransform = {
        ...selectedItem.transform,
        position: { ...selectedItem.transform.translation },
      };

      const center = {
        x: startTransform.position.x * resolutionRef.current.width,
        y: startTransform.position.y * resolutionRef.current.height,
      };

      const startVector = {
        x: startPoint.x - center.x,
        y: startPoint.y - center.y,
      };

      activeTransformRef.current = {
        id: selectedItem.id,
        mode,
        startPoint,
        startTransform,
        startDistance: Math.max(1, getLength(startVector)),
        startAngle: Math.atan2(startVector.y, startVector.x),
      };

      selectedItemRef.current = selectedItem.id;

      overlay.setPointerCapture(event.pointerId);

      return;
    }

    selectedItemRef.current = null;
    activeTransformRef.current = null;
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const overlay = overlayCanvasRef.current;

    if (!overlay) {
      return;
    }

    const activeTransform = activeTransformRef.current;

    if (activeTransform) {
      const startPoint = calculateCanvasPoint(event, overlay);

      const resolution = resolutionRef.current;

      if (resolution.width === 0 || resolution.height === 0) {
        return;
      }

      const activeItem = mediaItemsRef.current.find(
        (item) => item.id === activeTransform.id
      );

      if (!activeItem || !activeItem.transform) {
        activeTransformRef.current = null;
        return;
      }

      if (activeTransform.mode === "move") {
        const x = startPoint.x - activeTransform.startPoint.x;
        const y = startPoint.y - activeTransform.startPoint.y;

        activeItem.transform = {
          ...activeTransform.startTransform,
          translation: {
            x: clampValue(
              activeTransform.startTransform.translation.x + x / resolution.width,
              0,
              1
            ),
            y: clampValue(
              activeTransform.startTransform.translation.y + y / resolution.height,
              0,
              1
            ),
          },
        };

        return;
      }

      const center = {
        x: activeTransform.startTransform.translation.x * resolution.width,
        y: activeTransform.startTransform.translation.y * resolution.height,
      };

      const vector = {
        x: startPoint.x - center.x,
        y: startPoint.y - center.y,
      };

      if (activeTransform.mode === "scale") {
        const scaleFactor = getLength(vector) / activeTransform.startDistance;

        activeItem.transform = {
          ...activeTransform.startTransform,
          scale: clampValue(
            activeTransform.startTransform.scale * scaleFactor,
            0.08,
            1.4
          ),
        };

        return;
      }

      const angle = Math.atan2(vector.y, vector.x);

      activeItem.transform = {
        ...activeTransform.startTransform,
        rotation: activeTransform.startTransform.rotation +
          (angle - activeTransform.startAngle),
      };
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const overlay = overlayCanvasRef.current;

    if (overlay && overlay.hasPointerCapture(event.pointerId)) {
      overlay.releasePointerCapture(event.pointerId);
    }

    activeTransformRef.current = null;
  };

  return (
    <div className="whiteboard" ref={containerRef}>
      <canvas ref={mediaCanvasRef} />

      <canvas
        className="overlay"
        ref={overlayCanvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </div>
  );
}

const quad = [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1];

function resizeOverlayCanvas(
  resolution: Resolution,
  canvas: HTMLCanvasElement | null
) {
  if (!canvas) {
    return;
  }

  const { width, height, dpr } = resolution;

  const scaledWidth = Math.max(1, Math.floor(width * dpr));
  const scaledHeight = Math.max(1, Math.floor(height * dpr));

  if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
  }

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const context = canvas.getContext("2d");

  if (context) {
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

function resizeMediaCanvas(
  resolution: Resolution,
  state: WebGLContextState | null,
  canvas: HTMLCanvasElement | null
) {
  if (!state || !canvas) {
    return;
  }

  const { width, height, dpr } = resolution;

  const scaledWidth = Math.max(1, Math.floor(width * dpr));
  const scaledHeight = Math.max(1, Math.floor(height * dpr));

  if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;

    state.gl.viewport(0, 0, scaledWidth, scaledHeight);
  }

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}

function calculateCanvasPoint(
  event: PointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement
): Vector {
  const rect = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function renderMediaItems(
  state: WebGLContextState,
  items: MediaItem[],
  resolution: Resolution
) {
  const { gl } = state;

  if (resolution.width === 0 || resolution.height === 0) {
    return;
  }

  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(state.program);

  gl.uniform2f(
    state.uniforms.resolution,
    resolution.width * resolution.dpr,
    resolution.height * resolution.dpr
  );

  items.forEach((item) => {
    const textureUpdated = updateTexture(gl, item);

    if (!textureUpdated) {
      return;
    }

    const transform = calculateRenderTransform(item, resolution);

    gl.bindTexture(gl.TEXTURE_2D, item.texture);

    gl.uniform2f(
      state.uniforms.translation,
      transform.translation.x * resolution.dpr,
      transform.translation.y * resolution.dpr
    );

    gl.uniform2f(
      state.uniforms.scale,
      transform.scale.x * resolution.dpr,
      transform.scale.y * resolution.dpr
    );

    gl.uniform2f(
      state.uniforms.rotation,
      Math.cos(transform.rotation),
      Math.sin(transform.rotation)
    );

    gl.uniform1f(state.uniforms.opacity, item.opacity);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  });
}

function calculateRenderTransform(
  item: MediaItem,
  resolution: Resolution
) {
  if (!item.transform) {
    const translation = {
      x: item.anchor.x * resolution.width,
      y: item.anchor.y * resolution.height,
    };

    const width = item.baseSize * resolution.width;
    const height = width / item.aspect;

    const center = {
      x: translation.x + width * 0.5,
      y: translation.y + height * 0.5,
    };

    return {
      center,
      scale: { x: width, y: height },
      rotation: 0,
      translation,
    } as RenderTransform;
  }

  const width = item.transform.scale * resolution.width;
  const height = width / item.aspect;

  const center = {
    x: item.transform.translation.x * resolution.width,
    y: item.transform.translation.y * resolution.height,
  };

  return {
    center,
    scale: { x: width, y: height },
    rotation: item.transform.rotation,
    translation: {
      x: center.x - width * 0.5,
      y: center.y - height * 0.5,
    }
  } as RenderTransform;
}

function getSelectedItem(
  point: Vector,
  items: MediaItem[],
  resolution: Resolution
) {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];

    const transform = calculateRenderTransform(item, resolution);

    if (isPointWithinTransform(point, transform)) {
      return item;
    }
  }

  return null;
}

function isPointWithinTransform(point: Vector, transform: RenderTransform) {
  const x = point.x - transform.center.x;
  const y = point.y - transform.center.y;

  const cos = Math.cos(-transform.rotation);
  const sin = Math.sin(-transform.rotation);

  const localX = x * cos - y * sin;
  const localY = x * sin + y * cos;

  return (
    Math.abs(localX) <= transform.scale.x * 0.5 &&
    Math.abs(localY) <= transform.scale.y * 0.5
  );
}

function renderOverlay(
  canvas: HTMLCanvasElement | null,
  items: MediaItem[],
  selectedId: string | null,
  resolution: Resolution
) {
  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  context.clearRect(0, 0, resolution.width, resolution.height);

  renderMediaPlaceholders(context, items, resolution);

  if (!selectedId) {
    return;
  }

  const item = items.find((item) => item.id === selectedId);

  if (!item) {
    return;
  }

  const transform = calculateRenderTransform(item, resolution);
  const vertices = calculateTransformedVertices(transform);

  context.save();

  context.strokeStyle = "rgba(42, 149, 220, 0.7)";
  context.lineWidth = 2;

  context.beginPath();

  vertices.forEach((vertex, index) => {
    if (index === 0) {
      context.moveTo(vertex.x, vertex.y);
    } else {
      context.lineTo(vertex.x, vertex.y);
    }
  });

  context.closePath();
  context.stroke();

  context.restore();
}

function renderMediaPlaceholders(
  context: CanvasRenderingContext2D,
  items: MediaItem[],
  resolution: Resolution
) {
  items.forEach((item) => {
    if (item.state === "ready" && item.uploaded) {
      return;
    }

    const transform = calculateRenderTransform(item, resolution);

    drawPlaceholder(context, transform, item.state);
  });
}

function drawPlaceholder(
  context: CanvasRenderingContext2D,
  transform: RenderTransform,
  state: MediaState
) {
  const isError = state === "error";

  const label = isError ? "Failed to load media" : "Loading media...";

  const halfWidth = transform.scale.x * 0.5;
  const halfHeight = transform.scale.y * 0.5;

  context.save();

  context.translate(transform.center.x, transform.center.y);
  context.rotate(transform.rotation);

  context.fillStyle = isError
    ? "rgba(248, 113, 113, 0.2)"
    : "rgba(148, 163, 184, 0.18)";

  context.strokeStyle = isError
    ? "rgba(220, 38, 38, 0.8)"
    : "rgba(100, 116, 139, 0.8)";

  context.lineWidth = 2;

  context.fillRect(-halfWidth, -halfHeight, transform.scale.x, transform.scale.y);
  context.strokeRect(-halfWidth, -halfHeight, transform.scale.x, transform.scale.y);

  context.fillStyle = isError
    ? "rgba(185, 28, 28, 0.95)"
    : "rgba(30, 41, 59, 0.85)";

  context.font = "12px Roboto, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";

  context.fillText(label, 0, 0);

  context.restore();
}

function createImageItemFromUrl(
  gl: WebGLRenderingContext,
  url: string,
  id: string,
  items: MediaItem[]
) {
  const baseSize = 0.25;

  const image = new Image();

  image.decoding = "async";
  image.crossOrigin = "anonymous";
  image.referrerPolicy = "no-referrer";

  const texture = createTexture(gl);
  const transform = calculateInitialTransform(items, baseSize);

  const item = {
    id,
    type: "image",
    source: image,
    texture,
    aspect: 1,
    baseSize,
    anchor: { x: 0.5, y: 0.5 },
    opacity: 1,
    uploaded: false,
    state: "loading",
    transform,
  } as MediaItem;

  image.onload = () => {
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      item.aspect = image.naturalWidth / image.naturalHeight;
      item.state = "ready";
    } else {
      item.state = "error";
    }
  };

  image.onerror = () => {
    item.state = "error";
  };

  image.src = url;

  return item;
}

function createVideoItemFromUrl(
  gl: WebGLRenderingContext,
  url: string,
  id: string,
  items: MediaItem[]
) {
  const baseSize = 0.25;

  const video = document.createElement("video");

  video.crossOrigin = "anonymous";
  video.playsInline = true;
  video.preload = "auto";
  video.muted = true;
  video.loop = true;

  const texture = createTexture(gl);
  const transform = calculateInitialTransform(items, baseSize);

  const item = {
    id,
    type: "video",
    source: video,
    texture,
    aspect: 16 / 9,
    baseSize,
    anchor: { x: 0.5, y: 0.5 },
    opacity: 1,
    uploaded: false,
    state: "loading",
    transform,
  } as MediaItem;

  video.addEventListener("loadedmetadata", () => {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      item.aspect = video.videoWidth / video.videoHeight;
    }
  });

  video.addEventListener("loadeddata", () => {
    item.state = "ready";
  });

  video.addEventListener("error", () => {
    item.state = "error";
  });

  video.src = url;
  video.play().catch(() => undefined);

  return item;
}
