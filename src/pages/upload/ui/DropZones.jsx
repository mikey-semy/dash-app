import { UI } from "#common/config.js";
import { copy } from "#common/copy.js";
import { Icon } from "#src/shared/ui/Icons.jsx";
import { IconButton } from "#src/shared/ui/IconButton.jsx";
import { Modal } from "#src/shared/ui/Modal.jsx";

const destinations = [
  { zone: "new", label: copy.newTransfer, icon: "upload" },
  { zone: "append", label: copy.addToCurrentTransfer, icon: "add" },
];

function DestinationZones({ zone, canAppend, canNew = true, onChoose }) {
  const Zone = onChoose ? "button" : "div";
  return (canAppend || onChoose ? destinations : destinations.slice(0, 1)).map(
    ({ zone: value, label, icon }) => (
      <Zone
        key={value}
        className={
          zone === value && (value !== "new" || canNew)
            ? "drop-zone active"
            : "drop-zone"
        }
        aria-label={label}
        title={label}
        aria-disabled={value === "new" && !canNew}
        {...(onChoose
          ? {
              type: "button",
              disabled: value === "append" ? !canAppend : !canNew,
              onClick: () => onChoose(value === "append"),
            }
          : {})}
      >
        <Icon name={icon} size={UI.dropIconSize} />
      </Zone>
    ),
  );
}

export function DropZones({ active, ...props }) {
  return active ? (
    <div className="drop-zones" aria-label={copy.whereToUploadFiles}>
      <DestinationZones {...props} />
    </div>
  ) : null;
}

export function PasteDestinations({ canAppend, canNew, onChoose, onClose }) {
  return (
    <Modal
      className="paste-destinations"
      aria-label={copy.whereToPaste}
      initialFocus=".drop-zone"
      onClose={onClose}
    >
      {({ close }) => (
        <>
          <DestinationZones
            canAppend={canAppend}
            canNew={canNew}
            onChoose={onChoose}
          />
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
