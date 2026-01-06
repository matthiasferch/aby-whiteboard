import { useState } from "react";
import Whiteboard from "./components/Whiteboard";
import { MediaType, MediaRequest } from "./types/media";

export default function App() {
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>("image");

  const [mediaRequests, setMediaRequests] = useState<MediaRequest[]>([]);

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
        url: trimmedUrl
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
                placeholder="https://example.com/whiteboard.png"
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

            <button
              type="button"
              onClick={() => {
                addMedia(mediaType, mediaUrl);
                setMediaUrl("");
              }}
              disabled={!mediaUrl.trim()}
            >
              Add media
            </button>
          </div>

          <p>Media URLs must be CORS-enabled.</p>

        </div>
      </div>

      <div className="whiteboard-wrapper">
        <Whiteboard mediaRequests={mediaRequests} />
      </div>
    </div>
  );
}
