import { UI } from "#common/config.js";
import { copy } from "#common/copy.js";
import { Icon } from "#src/shared/ui/Icons.jsx";
import { IconButton } from "#src/shared/ui/IconButton.jsx";
import { Modal } from "#src/shared/ui/Modal.jsx";

const destinations = [
  { zone: "new", label: copy.newTransfer, icon: "upload" },
  { zone: "append", label: copy.addToCurrentTransfer, icon: "add" },
];

export function DropZones({ active, zone, canAppend }) {
  return active ? (
    <div className="drop-zones" aria-label={copy.whereToUploadFiles}>
      {(canAppend ? destinations : destinations.slice(0, 1)).map((item) => (
        <div
          key={item.zone}
          className={zone === item.zone ? "drop-zone active" : "drop-zone"}
          aria-label={item.label}
        >
          <Icon name={item.icon} size={UI.dropIconSize} />
        </div>
      ))}
    </div>
  ) : null;
}

export function PasteDestinations({ canAppend, onChoose, onClose }) {
  return (
    <Modal
      className="paste-destinations"
      aria-label={copy.whereToPaste}
      initialFocus=".drop-zone"
      onClose={onClose}
    >
      {({ close }) => (
        <>
          {destinations.map(({ zone, label, icon }) => (
            <button
              key={zone}
              type="button"
              className="drop-zone"
              disabled={zone === "append" && !canAppend}
              onClick={() => onChoose(zone === "append")}
            >
              <Icon name={icon} size={UI.dropIconSize} />
              {label}
            </button>
          ))}
          <IconButton
            className="icon-button current-close"
            aria-label={copy.cancel}
            title={copy.cancel}
            onClick={close}
          >
            <Icon name="cancel" />
          </IconButton>
        </>
      )}
    </Modal>
  );
}
