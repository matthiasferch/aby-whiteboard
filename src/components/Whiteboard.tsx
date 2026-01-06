import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import {
  getLength,
  clampValue,
  calculateTransformedVertices,
  calculateInitialTransform
} from "../utilities";
import { vertexShader, fragmentShader } from "../shaders";
import { Renderer } from "../renderer";
import { MediaRequest, MediaItem, MediaState } from "../types/media";
import { ActiveTransform, TransformMode, RenderTransform } from "../types/transform";
import { Vector } from "../types/vector";
import { Resolution } from "../types/resolution";

type WhiteboardProps = {
  mediaRequests: MediaRequest[];
};

export default function Whiteboard({ mediaRequests }: WhiteboardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mediaCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const frameRef = useRef<number | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const resolutionRef = useRef<Resolution>({ width: 0, height: 0, dpr: 1 });

  const mediaItemsRef = useRef<MediaItem[]>([]);
  const completedRequestsRef = useRef<Set<string>>(new Set());

  const selectedItemRef = useRef<string | null>(null);
  const activeTransformRef = useRef<ActiveTransform | null>(null);

  const [isRendererReady, setIsRendererReady] = useState(false);

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

      const renderer = rendererRef.current;

      if (renderer) {
        renderer.setViewport(resolution, mediaCanvasRef.current);
      }

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

    const renderer = new Renderer(canvas, vertexShader, fragmentShader);

    rendererRef.current = renderer;
    setIsRendererReady(true);

    const resolution = resolutionRef.current;

    if (resolution.width > 0 && resolution.height > 0) {
      renderer.setViewport(resolution, canvas);
    }

    renderer.setupQuad();
    renderer.resetState();

    mediaItemsRef.current = [];

    const update = () => {
      renderer.renderItems(
        mediaItemsRef.current,
        resolutionRef.current,
        calculateRenderTransform
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
        renderer.deleteTexture(item.texture);
      });

      renderer.deleteBuffers();
    };
  }, []);

  // media requests effect

  useEffect(() => {
    if (!rendererRef.current || !isRendererReady) {
      return;
    }

    const renderer = rendererRef.current;

    mediaRequests.forEach((request) => {
      if (completedRequestsRef.current.has(request.id)) {
        return; // already processed
      }

      const item =
        request.type === "image"
          ? createImageItemFromUrl(
            renderer,
            request.url,
            request.id,
            mediaItemsRef.current
          )
          : createVideoItemFromUrl(
            renderer,
            request.url,
            request.id,
            mediaItemsRef.current
          );

      mediaItemsRef.current.push(item);

      selectedItemRef.current = item.id;

      completedRequestsRef.current.add(request.id);
    });
  }, [isRendererReady, mediaRequests]);

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

      const renderer = rendererRef.current;

      if (renderer) {
        renderer.deleteTexture(removedItem.texture);
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

    renderMediaPlaceholder(context, transform, item.state);
  });
}

function renderMediaPlaceholder(
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
  renderer: Renderer,
  url: string,
  id: string,
  items: MediaItem[]
) {
  const baseSize = 0.25;

  const image = new Image();

  image.decoding = "async";
  image.crossOrigin = "anonymous";
  image.referrerPolicy = "no-referrer";

  const texture = renderer.createTexture();

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
  renderer: Renderer,
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

  const texture = renderer.createTexture();
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
