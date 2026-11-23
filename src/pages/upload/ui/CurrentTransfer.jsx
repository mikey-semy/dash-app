import { copy } from "#common/copy.js";
import { AnimatedDetails } from "#src/shared/ui/Disclosure.jsx";
import EditableName from "#src/shared/ui/EditableName.jsx";
import { Icon } from "#src/shared/ui/Icons.jsx";
import { FileList } from "#src/entities/transfer/index.js";
import { bytes, date } from "#src/shared/lib/format.js";
import { TransferActions as Share } from "#src/features/manage-transfer/actions.js";
export function CurrentTransferActions({
  transfer,
  opening,
  editFailed,
  onAdd,
  onAddText,
  onDelete,
  onSettings,
  onEdit,
  onPublish,
}) {
  return (
    <Share
      url={transfer.shareUrl || transfer.url}
      publication={
        transfer.hasSite
          ? {
              published: transfer.published,
              onToggle: (published) => onPublish(transfer, published),
            }
          : undefined
      }
      onAdd={onAdd}
      onAddText={onAddText}
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
  onRenameTitle,
  onRenameFile,
  onGenerateTitle,
  onRemoveFiles,
  onPreview,
  onEdit,
  editBusy,
}) {
  return (
    <AnimatedDetails
      className="transfer-details owner-details"
      label={copy.transferDetails}
      summary={<Icon name="chevron" />}
      heading={
        <div className="transfer-heading">
          <EditableName
            value={transfer.title || transfer.name || date(transfer.created)}
            label={copy.transferName}
            disabled={renaming}
            onSave={(value) => onRenameTitle(transfer, value)}
            onGenerate={
              transfer.hasSite
                ? (current) => onGenerateTitle(transfer, current)
                : undefined
            }
          />
        </div>
      }
    >
      <div className="transfer-information">
        <FileList
          files={transfer.files}
          onEdit={(index) => onEdit(transfer, index)}
          editBusy={editBusy}
          onRemove={(index) => onRemoveFiles(transfer, [index])}
          confirmationKey={transfer.revision}
          onRename={(index, value) => onRenameFile(transfer, index, value)}
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
