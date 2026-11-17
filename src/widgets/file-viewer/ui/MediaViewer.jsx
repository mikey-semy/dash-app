import { Modal } from "#src/shared/ui/Modal.jsx";
import { IconButton } from "#src/shared/ui/IconButton.jsx";
import { copy } from "#common/copy.js";
import { ErrorNotice } from "#src/shared/ui/Errors.jsx";
import { useState } from "react";
import { Icon, CopyButton } from "#src/shared/ui/Icons.jsx";
import QRButton from "#src/shared/ui/QRButton.jsx";
export default function MediaViewer({
  token,
  info,
  index,
  onClose,
  source,
  download,
  shareUrl,
}) {
  const [error, setError] = useState("");
  const failure = (event) =>
    setError(event.currentTarget.error?.message || copy.couldNotDisplayTheFile);
  const path =
    source || "/preview/" + token + (index === undefined ? "" : "/" + index);
  return (
    <Modal
      className="viewer-dialog media-dialog"
      aria-label={copy.filePreview}
      onClose={onClose}
    >
      {({ close }) => (
        <>
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
                aria-label={copy.downloadFile}
              >
                <Icon name="download" />
              </a>
              <IconButton aria-label={copy.closePreview} onClick={close}>
                <Icon name="cancel" />
              </IconButton>
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
        </>
      )}
    </Modal>
  );
}
