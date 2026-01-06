import { Vector } from "./types";

export class MediaTransform {
  constructor(
    public translation: Vector,
    public scale: number,
    public rotation: number = 0
  ) { }
}

export class RenderTransform {
  constructor(
    public center: Vector,
    public scale: Vector,
    public rotation: number,
    public translation: Vector
  ) { }
}

export type TransformMode = "move" | "scale" | "rotate";

export class ActiveTransform {
  constructor(
    public id: string,
    public mode: TransformMode,
    public startTransform: MediaTransform,
    public startPoint: Vector,
    public startDistance: number,
    public startAngle: number
  ) { }
}
