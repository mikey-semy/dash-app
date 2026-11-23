import { Modal } from "#src/shared/ui/Modal.jsx";
import { copy } from "#common/copy.js";

import { Expiry } from "#src/entities/transfer/index.js";
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
  onRename,
  renaming,
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
            onRename={onRename}
            renaming={renaming}
          />
          <footer className="viewer-footer">
            <Expiry value={info.expires} oneTime={info.oneTime} />
          </footer>
        </>
      )}
    </Modal>
  );
}
