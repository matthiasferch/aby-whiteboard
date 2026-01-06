import type { PointerEvent } from "react";
import { clampValue } from "../utilities";
import { MediaItem, MediaState } from "../media";
import { RenderTransform } from "../transform";
import { Resolution, Vector } from "../types";

export function resizeOverlayCanvas(
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

export function calculateCanvasPoint(
  event: PointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement
): Vector {
  const rect = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

export function calculateRenderTransform(
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

export function getSelectedItem(
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

export function renderOverlay(
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

  const item = items.find((activeItem) => activeItem.id === selectedId);

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

function calculateTransformedVertices(transform: RenderTransform): Vector[] {
  const { scale, rotation, center } = transform;

  const w = scale.x * 0.5;
  const h = scale.y * 0.5;

  const sin = Math.sin(rotation);
  const cos = Math.cos(rotation);

  const vertices = [
    { x: -w, y: -h },
    { x: w, y: -h },
    { x: w, y: h },
    { x: -w, y: h },
  ];

  return vertices.map((vertex) => ({
    x: center.x + vertex.x * cos - vertex.y * sin,
    y: center.y + vertex.x * sin + vertex.y * cos,
  }));
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
  const maxWidth = Math.max(...lines.map((line) => context.measureText(line).width));
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

  const x = maximum.x >= minimum.x
    ? clampValue(minimum.x, minimum.x, maximum.x)
    : bounds.minimum.x + inset;
  const y = maximum.y >= minimum.y
    ? clampValue(minimum.y, minimum.y, maximum.y)
    : bounds.minimum.y + inset;

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
