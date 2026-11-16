import { IconButton } from "./IconButton.jsx";
import React from "react";
import { copy } from "../../shared/copy.js";
import { Icon, CopyButton, DeleteButton } from "../Icons.jsx";
import QRButton from "../QRButton.jsx";
import PublicationButton from "../PublicationButton.jsx";
export function TransferActions({
  url,
  onAdd,
  onDelete,
  onEdit,
  onSettings,
  publication,
  onOpen,
  editFailed,
  editBusy,
  compact = false,
  deleteLabel = copy.delete,
  confirmationKey,
}) {
  return (
    <div className={onAdd && !compact ? "share share-ready" : "share"}>
      {onAdd && !compact && (
        <button
          className="primary-action"
          onClick={onAdd}
          aria-label={copy.add}
          title={copy.add}
        >
          <Icon name="add" />
        </button>
      )}
      <div className="share-controls">
        {publication && <PublicationButton {...publication} />}
        {(onOpen || compact) && (
          <IconButton
            aria-label={copy.openTransfer}
            disabled={!onOpen}
            title={copy.openAsCurrent}
            onClick={onOpen}
          >
            <Icon name="eye" />
          </IconButton>
        )}
        {onEdit && (
          <IconButton
            className={editFailed ? "icon-button edit-error" : "icon-button"}
            disabled={editBusy || editFailed}
            aria-label={editFailed ? copy.couldNotOpenTheText : copy.editText}
            title={editFailed ? copy.couldNotOpenTheText : copy.editText}
            onClick={() => {
              onEdit();
            }}
          >
            <Icon name={editFailed ? "cancel" : "edit"} />
          </IconButton>
        )}
        {compact && (
          <IconButton
            aria-label={copy.addFilesToTransfer}
            title={copy.addFiles}
            disabled={!onAdd}
            onClick={onAdd}
          >
            <Icon name="add" />
          </IconButton>
        )}
        {(onSettings || compact) && (
          <IconButton
            aria-label={copy.transferSettings}
            disabled={!onSettings}
            title={copy.transferRetentionAndPassword}
            onClick={onSettings}
          >
            <Icon name="settings" />
          </IconButton>
        )}
        <QRButton url={url} />
        <CopyButton value={url} />
        <DeleteButton
          label={deleteLabel}
          disabled={!onDelete}
          onDelete={onDelete}
          confirmationKey={confirmationKey || url}
        />
      </div>
    </div>
  );
}
