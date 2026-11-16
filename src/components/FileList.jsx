import { IconButton } from "./IconButton.jsx";
import React from "react";
import { copy } from "../../shared/copy.js";
import EditableName from "../EditableName.jsx";
import { Icon, DeleteButton } from "../Icons.jsx";
import { bytes } from "../lib/format.js";
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
}) {
  const SelectionRow = onPreview || onRename ? "div" : "label";
  return (
    <ul className="files">
      {files.map((f, i) => (
        <li key={i}>
          {selection ? (
            <SelectionRow className="file-choice">
              <input
                type="checkbox"
                checked={selection.has(i)}
                disabled={disabled}
                aria-label={copy.selectPrefix + f.name}
                onChange={() => onToggle(i)}
              />
              {onRename ? (
                <EditableName
                  value={f.name}
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
                  {f.name}
                </button>
              ) : (
                <span>{f.name}</span>
              )}
            </SelectionRow>
          ) : onRename ? (
            <EditableName
              value={f.name}
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
              {f.name}
            </button>
          ) : (
            <span>{f.name}</span>
          )}
          <small className="file-size">{bytes(f.size)}</small>
          <div className="file-actions">
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
          </div>
        </li>
      ))}
    </ul>
  );
}
