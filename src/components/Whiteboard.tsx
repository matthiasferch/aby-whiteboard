import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { getLength, clampValue } from "../utilities";
import { vertexShader, fragmentShader } from "../shaders";
import { Renderer } from "../renderer";
import { MediaRequest, MediaItem, ImageItem, VideoItem } from "../media";
import { ActiveTransform, TransformMode, MediaTransform } from "../transform";
import { Resolution, Vector } from "../types";
import {
  calculateCanvasPoint,
  calculateRenderTransform,
  getSelectedItem,
  renderOverlay,
  resizeOverlayCanvas,
} from "./whiteboardHelpers";

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
