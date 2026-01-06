import { Vector } from "./vector";

export type MediaTransform = {
  scale: number;
  rotation: number;
  translation: Vector;
};

export type RenderTransform = {
  center: Vector;
  scale: Vector;
  rotation: number;
  translation: Vector;
};

export type TransformMode = "move" | "scale" | "rotate";

export type ActiveTransform = {
  id: string;
  mode: TransformMode;
  startTransform: MediaTransform;
  startPoint: Vector;
  startDistance: number;
  startAngle: number;
};
