import { UI } from "#common/config.js";
import { copy } from "#common/copy.js";
import { Icon } from "#src/shared/ui/Icons.jsx";
export function DropZones({ active, zone, canAppend }) {
  return active ? (
    <div className="drop-zones" aria-label={copy.whereToUploadFiles}>
      <div
        className={zone === "new" ? "drop-zone active" : "drop-zone"}
        aria-label={copy.newTransfer}
      >
        <Icon name="upload" size={UI.dropIconSize} />
      </div>
      {canAppend && (
        <div
          className={zone === "append" ? "drop-zone active" : "drop-zone"}
          aria-label={copy.addToCurrentTransfer}
        >
          <Icon name="add" size={UI.dropIconSize} />
        </div>
      )}
    </div>
  ) : null;
}
