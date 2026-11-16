import React, { useEffect, useRef } from "react";
import { Expiry } from "./Icons.jsx";
import TextPreview from "./TextPreview.jsx";
export default function TextViewer({
  token,
  info,
  index,
  onClose,
  onUnavailable,
  onUnsupported,
  rawPath,
  downloadPath,
  onEdit,
  shareUrl,
}) {
  const ref = useRef();
  useEffect(() => {
    ref.current.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="viewer-dialog"
      aria-label="Просмотр текста"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <TextPreview
        token={token}
        info={info}
        index={index}
        onClose={onClose}
        onUnavailable={onUnavailable}
        onUnsupported={onUnsupported}
        rawPath={rawPath}
        downloadPath={downloadPath}
        onEdit={onEdit}
        shareUrl={shareUrl}
      />
      <footer className="viewer-footer">
        <Expiry value={info.expires} oneTime={info.oneTime} />
      </footer>
    </dialog>
  );
}
