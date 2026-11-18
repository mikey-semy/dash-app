import { SelectionCheckbox } from "#src/shared/ui/SelectionCheckbox.jsx";
import { IconButton } from "#src/shared/ui/IconButton.jsx";

import { copy } from "#common/copy.js";
import EditableName from "#src/shared/ui/EditableName.jsx";
import { Icon, DeleteButton } from "#src/shared/ui/Icons.jsx";
import { bytes } from "#src/shared/lib/format.js";
import { ResponsiveActions } from "#src/shared/ui/ResponsiveActions.jsx";
import { HighlightedText } from "#src/shared/ui/HighlightedText.jsx";
export function FileList({
  files,
  selection,
  onToggle,
  onPreview,
  downloadPath,
  onRename,
  onRemove,
  confirmationKey,
  disabled = false,
  highlight,
}) {
  const SelectionRow = onPreview || onRename ? "div" : "label";
  return (
    <ul className="files">
      {files.map((f, i) => (
        <li key={i}>
          {selection ? (
            <SelectionRow className="file-choice">
              <SelectionCheckbox
                checked={selection.has(i)}
                disabled={disabled}
                aria-label={copy.selectPrefix + f.name}
                onChange={() => onToggle(i)}
              />
              {onRename ? (
                <EditableName
                  value={f.name}
                  highlight={highlight}
                  label={copy.filenamePrefix + (i + 1)}
                  disabled={disabled}
                  onSave={(name) => onRename(i, name)}
                />
              ) : onPreview && (f.preview || f.media) ? (
                <button
                  type="button"
                  className="file-preview-link"
                  onClick={() => onPreview(i)}
                >
                  <HighlightedText value={f.name} pattern={highlight} />
                </button>
              ) : (
                <span>
                  <HighlightedText value={f.name} pattern={highlight} />
                </span>
              )}
            </SelectionRow>
          ) : onRename ? (
            <EditableName
              value={f.name}
              highlight={highlight}
              label={copy.filenamePrefix + (i + 1)}
              disabled={disabled}
              onSave={(name) => onRename(i, name)}
            />
          ) : onPreview && (f.preview || f.media) ? (
            <button
              type="button"
              className="file-preview-link"
              onClick={() => onPreview(i)}
              title={copy.previewFile}
            >
              <HighlightedText value={f.name} pattern={highlight} />
            </button>
          ) : (
            <span>
              <HighlightedText value={f.name} pattern={highlight} />
            </span>
          )}
          <small className="file-size">{bytes(f.size)}</small>
          <div className="file-actions">
            <ResponsiveActions className="file-actions">
              {onRename && onPreview && (f.preview || f.media) && (
                <IconButton
                  aria-label={copy.previewPrefix + f.name}
                  onClick={() => onPreview(i)}
                >
                  <Icon name="eye" />
                </IconButton>
              )}
              {downloadPath && !f.name.endsWith("/") && (
                <a
                  className="icon-button"
                  href={downloadPath(i)}
                  aria-label={copy.downloadPrefix + f.name}
                >
                  <Icon name="download" />
                </a>
              )}
              {onRemove && (
                <DeleteButton
                  icon="cancel"
                  label={copy.deletePrefix + f.name}
                  disabled={disabled}
                  confirmationKey={confirmationKey || f.name}
                  onDelete={() => onRemove(i)}
                />
              )}
            </ResponsiveActions>
          </div>
        </li>
      ))}
    </ul>
  );
}
