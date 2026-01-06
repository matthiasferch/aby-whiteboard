import { Vector } from "./types";

export function getLength(vector: Vector): number {
  return Math.hypot(vector.x, vector.y);
}

export function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
