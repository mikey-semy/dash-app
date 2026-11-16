import { Modal } from "../../../shared/ui/Modal.jsx";
import { copy } from "../../../../shared/copy.js";
import React from "react";
import { Expiry } from "../../../entities/transfer/index.js";
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
  return (
    <Modal
      className="viewer-dialog"
      aria-label={copy.textPreview}
      onClose={onClose}
    >
      {({ close }) => (
        <>
          <TextPreview
            token={token}
            info={info}
            index={index}
            onClose={close}
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
        </>
      )}
    </Modal>
  );
}
