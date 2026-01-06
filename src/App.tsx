import { useState } from "react";
import Whiteboard from "./components/Whiteboard";
import { MediaType, MediaRequest } from "./media";

export default function App() {
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>("image");

  const [mediaBlur, setMediaBlur] = useState(0);
  const [mediaOpacity, setMediaOpacity] = useState(1);
  const [mediaContrast, setMediaContrast] = useState(1);
  const [mediaBrightness, setMediaBrightness] = useState(1);

  const [mediaRequests, setMediaRequests] = useState<MediaRequest[]>([
    {
      id: crypto.randomUUID(),
      type: "image",
      url: "https://picsum.photos/id/1069/900/600",
      blur: 1.8,
    },
    {
      id: crypto.randomUUID(),
      type: "image",
      url: "https://picsum.photos/id/1025/800/600",
      brightness: 1.2,
    },
    {
      id: crypto.randomUUID(),
      type: "video",
      url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      contrast: 1.5,
    }
  ]);

  const addMedia = (type: MediaType, url: string) => {
    const trimmedUrl = url.trim();

    if (!trimmedUrl) {
      return;
    }

    const id = crypto.randomUUID();

    setMediaRequests((items) => [
      ...items, {
        id,
        type,
        url: trimmedUrl,
        blur: mediaBlur,
        opacity: mediaOpacity,
        contrast: mediaContrast,
        brightness: mediaBrightness,
      }
    ]);
  };

  return (
    <div className="app">
      <div className="panel">

        <div className="panel-header">
          <h1>Aby Whiteboard</h1>

          <p>Click media to select.</p>
          <p>Drag to move. Hold Shift to scale or Alt to rotate.</p>
          <p>Press Delete or Backspace to remove.</p>
        </div>

        <div className="panel-section">
          <h2>Add Media</h2>

          <div className="media-input">
            <label>
              <span>Media URL</span>

              <input
                type="url"
                placeholder="URL must be CORS-enabled"
                value={mediaUrl}
                onChange={(event) => setMediaUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    addMedia(mediaType, mediaUrl);
                    setMediaUrl("");
                  }
                }}
              />
            </label>

            <label>
              <span>Type</span>

              <select
                value={mediaType}
                onChange={(event) => setMediaType(event.target.value as MediaType)}
              >
                <option value="image">Image</option>
                <option value="video">Video</option>
              </select>
            </label>

            <label>
              <span>Opacity</span>

              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={mediaOpacity}
                onChange={(event) => setMediaOpacity(Number(event.target.value))}
              />
            </label>

            <label>
              <span>Blur</span>

              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={mediaBlur}
                onChange={(event) => setMediaBlur(Number(event.target.value))}
              />
            </label>

            <label>
              <span>Brightness</span>

              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={mediaBrightness}
                onChange={(event) => setMediaBrightness(Number(event.target.value))}
              />
            </label>

            <label>
              <span>Contrast</span>

              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={mediaContrast}
                onChange={(event) => setMediaContrast(Number(event.target.value))}
              />
            </label>

            <button
              type="button"
              onClick={() => {
                addMedia(mediaType, mediaUrl);
                setMediaUrl("");
              }}
              disabled={!mediaUrl.trim()}
            >
              Add Media
            </button>
          </div>
        </div>
      </div>

      <div className="whiteboard-wrapper">
        <Whiteboard mediaRequests={mediaRequests} />
      </div>
    </div>
  );
}
