import { MediaItem } from "./types/media";
import { RenderTransform, MediaTransform } from "./types/transform";
import { Vector } from "./types/vector";

export function getLength(vector: Vector): number {
  return Math.hypot(vector.x, vector.y);
}

export function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function calculateTransformedVertices(transform: RenderTransform): Vector[] {
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

export function calculateInitialTransform(items: MediaItem[], scale: number): MediaTransform {
  const x = ((items.length % 3) - 1) * 0.12;
  const y = ((Math.floor(items.length / 3) % 3) - 1) * 0.1;

  return {
    translation: {
      x: clampValue(0.5 + x, 0.15, 0.85),
      y: clampValue(0.5 + y, 0.15, 0.85),
    },
    scale,
    rotation: 0,
  } as MediaTransform;
}
