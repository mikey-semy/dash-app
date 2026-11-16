import { ErrorNotice } from "./Errors.jsx";
import React, { useEffect, useRef, useState } from "react";
import { Icon, CopyButton } from "./Icons.jsx";
import QRButton from "./QRButton.jsx";
export default function MediaViewer({
  token,
  info,
  index,
  onClose,
  source,
  download,
  shareUrl,
}) {
  const ref = useRef(),
    [error, setError] = useState("");
  const failure = (event) =>
    setError(event.currentTarget.error?.message || "Не удалось показать файл");
  useEffect(() => {
    ref.current.showModal();
    return () => ref.current?.close();
  }, []);
  const path =
    source || "/preview/" + token + (index === undefined ? "" : "/" + index);
  return (
    <dialog
      ref={ref}
      className="viewer-dialog media-dialog"
      aria-label="Просмотр файла"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="text-preview-header">
        <span className="media-name">{info.name}</span>
        <div className="text-actions">
          <CopyButton value={shareUrl || location.href} />
          <QRButton url={shareUrl || location.href} />
          <a
            className="icon-button"
            href={
              download ||
              "/public/" +
                token +
                (index === undefined ? "" : "/files/" + index) +
                "/download"
            }
            aria-label="Скачать файл"
          >
            <Icon name="download" />
          </a>
          <button
            type="button"
            className="icon-button"
            aria-label="Закрыть просмотр"
            onClick={onClose}
          >
            <Icon name="cancel" />
          </button>
        </div>
      </header>
      <div className="media-body">
        {error ? (
          <ErrorNotice error={error} context="media preview" />
        ) : info.media === "image" ? (
          <img
            onError={failure}
            src={
              path +
              (path.includes("?") ? "&" : "?") +
              "v=" +
              encodeURIComponent(info.etag || "")
            }
            alt={info.name}
          />
        ) : info.media === "pdf" ? (
          <iframe
            onError={failure}
            src={
              path +
              (path.includes("?") ? "&" : "?") +
              "v=" +
              encodeURIComponent(info.etag || "")
            }
            title={info.name}
          />
        ) : info.media === "video" ? (
          <video
            onError={failure}
            src={
              path +
              (path.includes("?") ? "&" : "?") +
              "v=" +
              encodeURIComponent(info.etag || "")
            }
            controls
            preload="metadata"
            playsInline
          />
        ) : (
          <audio
            onError={failure}
            src={
              path +
              (path.includes("?") ? "&" : "?") +
              "v=" +
              encodeURIComponent(info.etag || "")
            }
            controls
            preload="metadata"
          />
        )}
      </div>
    </dialog>
  );
}
