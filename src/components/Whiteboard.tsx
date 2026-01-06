import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import {
  getLength,
  clampValue,
  calculateTransformedVertices
} from "../utilities";
import { vertexShader, fragmentShader } from "../shaders";
import { Renderer } from "../renderer";
import { MediaRequest, MediaItem, MediaState, ImageItem, VideoItem } from "../media";
import { ActiveTransform, TransformMode, RenderTransform, MediaTransform } from "../transform";
import { Resolution, Vector } from "../types";

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

  const selectedItemIdRef = useRef<string | null>(null);
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

      resizeOverlay(resolution, overlayCanvasRef.current);
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
        selectedItemIdRef.current,
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
    const items = mediaItemsRef.current;

    const createTexture = () => renderer.createTexture();

    mediaRequests.forEach((request) => {
      if (completedRequestsRef.current.has(request.id)) {
        return; // already processed
      }

      const { id, url, opacity, blur, brightness, contrast } = request;

      const item =
        request.type === "image"
          ? ImageItem.fromUrl(
            {
              id,
              url,
              items,
              opacity,
              blur,
              brightness,
              contrast,
            },
            createTexture
          )
          : VideoItem.fromUrl(
            {
              id,
              url,
              items,
              opacity,
              blur,
              brightness,
              contrast,
            },
            createTexture
          )

      items.push(item);

      selectedItemIdRef.current = item.id;

      completedRequestsRef.current.add(request.id);
    });
  }, [isRendererReady, mediaRequests]);

  // window event listener effect

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }

      const selectedItem = selectedItemIdRef.current;

      if (!selectedItem) {
        return;
      }

      const index = mediaItemsRef.current.findIndex(
        (item) => item.id === selectedItem
      );

      if (index === -1) {
        selectedItemIdRef.current = null;
        return;
      }

      const [removedItem] = mediaItemsRef.current.splice(index, 1);

      selectedItemIdRef.current = null;
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

      const startTranslation = { ...selectedItem.transform.translation };
      const startTransform = new MediaTransform(
        startTranslation,
        selectedItem.transform.scale,
        selectedItem.transform.rotation
      );

      const center = {
        x: startTransform.translation.x * resolutionRef.current.width,
        y: startTransform.translation.y * resolutionRef.current.height,
      };

      const startVector = {
        x: startPoint.x - center.x,
        y: startPoint.y - center.y,
      };

      activeTransformRef.current = new ActiveTransform(
        selectedItem.id,
        mode,
        startTransform,
        startPoint,
        Math.max(1, getLength(startVector)),
        Math.atan2(startVector.y, startVector.x)
      );

      selectedItemIdRef.current = selectedItem.id;

      overlay.setPointerCapture(event.pointerId);

      return;
    }

    selectedItemIdRef.current = null;
    activeTransformRef.current = null;
  };

  const getTransformVector = (
    activeTransform: ActiveTransform,
    startPoint: Vector,
    resolution: Resolution
  ) => {
    const center = {
      x: activeTransform.startTransform.translation.x * resolution.width,
      y: activeTransform.startTransform.translation.y * resolution.height,
    };

    return {
      x: startPoint.x - center.x,
      y: startPoint.y - center.y,
    };
  };

  const applyMoveTransform = (
    activeTransform: ActiveTransform,
    activeItem: MediaItem,
    startPoint: Vector,
    resolution: Resolution
  ) => {
    const x = startPoint.x - activeTransform.startPoint.x;
    const y = startPoint.y - activeTransform.startPoint.y;

    activeItem.transform = new MediaTransform(
      {
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
      activeTransform.startTransform.scale,
      activeTransform.startTransform.rotation
    );
  };

  const applyScaleTransform = (
    activeTransform: ActiveTransform,
    activeItem: MediaItem,
    startPoint: Vector,
    resolution: Resolution
  ) => {
    const vector = getTransformVector(activeTransform, startPoint, resolution);
    const scaleFactor = getLength(vector) / activeTransform.startDistance;

    activeItem.transform = new MediaTransform(
      { ...activeTransform.startTransform.translation },
      clampValue(
        activeTransform.startTransform.scale * scaleFactor,
        0.08,
        1.4
      ),
      activeTransform.startTransform.rotation
    );
  };

  const applyRotateTransform = (
    activeTransform: ActiveTransform,
    activeItem: MediaItem,
    startPoint: Vector,
    resolution: Resolution
  ) => {
    const vector = getTransformVector(activeTransform, startPoint, resolution);
    const angle = Math.atan2(vector.y, vector.x);

    activeItem.transform = new MediaTransform(
      { ...activeTransform.startTransform.translation },
      activeTransform.startTransform.scale,
      activeTransform.startTransform.rotation + (angle - activeTransform.startAngle)
    );
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
        applyMoveTransform(activeTransform, activeItem, startPoint, resolution);
        return;
      }

      if (activeTransform.mode === "scale") {
        applyScaleTransform(activeTransform, activeItem, startPoint, resolution);
        return;
      }

      applyRotateTransform(activeTransform, activeItem, startPoint, resolution);
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

function resizeOverlay(
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
): RenderTransform {
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

    const scale = { x: width, y: height };

    return new RenderTransform(center, scale, 0, translation);
  }

  const width = item.transform.scale * resolution.width;
  const height = width / item.aspect;

  const center = {
    x: item.transform.translation.x * resolution.width,
    y: item.transform.translation.y * resolution.height,
  };

  const scale = { x: width, y: height };
  const { rotation } = item.transform;

  const translation = {
    x: center.x - width * 0.5,
    y: center.y - height * 0.5,
  };

  return new RenderTransform(center, scale, rotation, translation);
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

function calculateVertexBounds(vertices: Vector[]) {
  const minimum = {
    x: Number.POSITIVE_INFINITY,
    y: Number.POSITIVE_INFINITY,
  };

  const maximum = {
    x: Number.NEGATIVE_INFINITY,
    y: Number.NEGATIVE_INFINITY,
  };

  vertices.forEach((vertex) => {
    minimum.x = Math.min(minimum.x, vertex.x);
    minimum.y = Math.min(minimum.y, vertex.y);
    maximum.x = Math.max(maximum.x, vertex.x);
    maximum.y = Math.max(maximum.y, vertex.y);
  });

  return { minimum, maximum };
}

function renderSelectionDetails(
  context: CanvasRenderingContext2D,
  item: MediaItem,
  vertices: Vector[]
) {
  const lines = [
    `Blur: ${item.blur.toFixed(2)}`,
    `Opacity: ${item.opacity.toFixed(2)}`,
    `Contrast: ${item.contrast.toFixed(2)}`,
    `Brightness: ${item.brightness.toFixed(2)}`,
  ];

  context.save();

  context.font = "12px Roboto, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "top";

  const lineHeight = 16;
  const padding = 6;

  const maxWidth = Math.max(...lines.map((line) => {
    const { width } = context.measureText(line);
    return width;
  }));

  const boxWidth = maxWidth + padding * 2;
  const boxHeight = lines.length * lineHeight + padding * 2;

  const bounds = calculateVertexBounds(vertices);

  const inset = 6;

  const minimum = {
    x: bounds.minimum.x + inset,
    y: bounds.minimum.y + inset
  };

  const maximum = {
    x: bounds.maximum.x - boxWidth - inset,
    y: bounds.maximum.y - boxHeight - inset
  };

  const x = maximum.x >= minimum.x ? clampValue(minimum.x, minimum.x, maximum.x) : bounds.minimum.x + inset;
  const y = maximum.y >= minimum.y ? clampValue(minimum.y, minimum.y, maximum.y) : bounds.minimum.y + inset;

  context.fillStyle = "rgba(15, 23, 42, 0.75)";
  context.strokeStyle = "rgba(148, 163, 184, 0.7)";
  context.lineWidth = 1;

  context.fillRect(x, y, boxWidth, boxHeight);
  context.strokeRect(x, y, boxWidth, boxHeight);

  context.fillStyle = "rgba(248, 250, 252, 0.95)";

  lines.forEach((line, index) => {
    context.fillText(line, x + padding, y + padding + index * lineHeight);
  });

  context.restore();
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

  renderSelectionDetails(context, item, vertices);

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
