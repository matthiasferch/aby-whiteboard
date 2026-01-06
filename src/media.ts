import { clampValue } from "./utilities";
import { MediaTransform } from "./transform";
import { Vector } from "./types";

export type MediaType = "image" | "video";
export type MediaState = "loading" | "ready" | "error";

export type MediaSource = HTMLImageElement | HTMLVideoElement;

export type MediaRequest = {
  id: string;
  url: string;
  type: MediaType;
  blur?: number;
  opacity?: number;
  contrast?: number;
  brightness?: number;
};

type MediaItemFactoryOptions = {
  id: string;
  url: string;
  items: MediaItem[];
  baseSize?: number;
  opacity?: number;
  blur?: number;
  brightness?: number;
  contrast?: number;
};

export abstract class MediaItem {
  abstract readonly type: MediaType;

  constructor(
    public id: string,
    public source: MediaSource,
    public texture: WebGLTexture,
    public baseSize: number,
    public transform: MediaTransform | undefined = undefined,
    public aspect = 1,
    public opacity = 1,
    public blur = 0,
    public brightness = 1,
    public contrast = 1,
    public anchor: Vector = { x: 0.5, y: 0.5 },
    public uploaded = false,
    public state: MediaState = "loading"
  ) { }

  protected static calculateInitialTransform(items: MediaItem[], scale: number): MediaTransform {
    const x = ((items.length % 3) - 1) * 0.275;
    const y = ((Math.floor(items.length / 3) % 3) - 1) * 0.25;

    const translation = {
      x: clampValue(0.5 + x, 0.15, 0.85),
      y: clampValue(0.5 + y, 0.15, 0.85),
    };

    return new MediaTransform(translation, scale);
  }
}

export class ImageItem extends MediaItem {
  readonly type: MediaType = "image";

  static fromUrl(options: MediaItemFactoryOptions, createTexture: () => WebGLTexture): ImageItem {
    const baseSize = options.baseSize ?? 0.25;

    const image = new Image();

    image.decoding = "async";
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";

    const texture = createTexture();
    const transform = this.calculateInitialTransform(options.items, baseSize);

    const { id } = options;

    const item = new ImageItem(
      id,
      image,
      texture,
      baseSize,
      transform,
      1,
      options.opacity ?? 1,
      options.blur ?? 0,
      options.brightness ?? 1,
      options.contrast ?? 1
    );

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

    image.src = options.url;

    return item;
  }
}

export class VideoItem extends MediaItem {
  readonly type: MediaType = "video";

  static fromUrl(options: MediaItemFactoryOptions, createTexture: () => WebGLTexture): VideoItem {
    const baseSize = options.baseSize ?? 0.25;

    const video = document.createElement("video");

    video.crossOrigin = "anonymous";
    video.playsInline = true;
    video.preload = "auto";
    video.muted = true;
    video.loop = true;

    const texture = createTexture();
    const transform = this.calculateInitialTransform(options.items, baseSize);

    const { id } = options;

    const item = new VideoItem(
      id,
      video,
      texture,
      baseSize,
      transform,
      16 / 9,
      options.opacity ?? 1,
      options.blur ?? 0,
      options.brightness ?? 1,
      options.contrast ?? 1
    );

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

    video.src = options.url;
    video.play().catch(() => undefined);

    return item;
  }
}
