import React from "react";
import { copy } from "../../../../shared/copy.js";
import { AnimatedDetails } from "../../../shared/ui/Disclosure.jsx";
import EditableName from "../../../shared/ui/EditableName.jsx";
import { Icon } from "../../../shared/ui/Icons.jsx";
import { FileList } from "../../../entities/transfer/index.js";
import { bytes, date } from "../../../shared/lib/format.js";
import { TransferActions as Share } from "../../../features/manage-transfer/actions.js";
export function CurrentTransferActions({
  transfer,
  opening,
  editFailed,
  onAdd,
  onDelete,
  onSettings,
  onEdit,
  settingsApi,
}) {
  return (
    <Share
      url={transfer.shareUrl || transfer.url}
      publication={
        transfer.hasSite
          ? {
              published: transfer.published,
              onToggle: (published) =>
                settingsApi(
                  "/api/transfers/" + transfer.id + "/settings",
                  { published },
                  "PATCH",
                ),
            }
          : undefined
      }
      onAdd={onAdd}
      onDelete={() => onDelete(transfer.id)}
      onSettings={() => onSettings(transfer.id)}
      editFailed={editFailed}
      editBusy={opening}
      onEdit={transfer.preview ? () => onEdit(transfer) : undefined}
    />
  );
}
export function CurrentTransferDetails({
  transfer,
  renaming,
  onRename,
  onRemoveFiles,
  onPreview,
  settingsApi,
}) {
  return (
    <AnimatedDetails
      className="transfer-details owner-details"
      label={copy.transferDetails}
      summary={<Icon name="chevron" />}
    >
      <div className="transfer-information">
        <p>
          <EditableName
            value={transfer.title || transfer.name || date(transfer.created)}
            label={copy.transferName}
            disabled={renaming}
            onSave={(value) => onRename(transfer, { title: value })}
            onGenerate={
              transfer.hasSite
                ? (current) =>
                    settingsApi(
                      "/api/transfers/" +
                        transfer.id +
                        "/title-suggestion?current=" +
                        encodeURIComponent(current),
                    ).then((result) => result.title)
                : undefined
            }
          />
        </p>
        <FileList
          files={transfer.files}
          onRemove={(index) =>
            onRemoveFiles(transfer.id, [index], transfer.revision)
          }
          confirmationKey={transfer.revision}
          onRename={(index, value) =>
            onRename(transfer, {
              names: transfer.files.map((file, i) =>
                i === index ? value : file.name,
              ),
            })
          }
          disabled={renaming}
          onPreview={(index) => onPreview(transfer, index)}
        />
        <p className="muted">{bytes(transfer.size)}</p>
        <p className="muted">
          {transfer.oneTime
            ? "1"
            : transfer.expires === null
              ? "∞"
              : date(transfer.expires)}
        </p>
      </div>
    </AnimatedDetails>
  );
}
