import { MediaTransform } from "./transform";
import { Vector } from "./vector";

export type MediaType = "image" | "video";

export type MediaSource = HTMLImageElement | HTMLVideoElement;

export type MediaRequest = {
  id: string;
  type: MediaType;
  url: string;
};

export type MediaState = "loading" | "ready" | "error";

export type MediaItem = {
  id: string;
  type: MediaType;
  state: MediaState;
  source: MediaSource;
  texture: WebGLTexture;
  aspect: number;
  baseSize: number;
  anchor: Vector;
  opacity: number;
  uploaded: boolean;
  transform?: MediaTransform;
};