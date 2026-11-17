import { useSelection } from "#src/shared/lib/useSelection.js";
import { SelectionCheckbox } from "#src/shared/ui/SelectionCheckbox.jsx";
import { Modal } from "#src/shared/ui/Modal.jsx";
import { IconButton } from "#src/shared/ui/IconButton.jsx";
import { useRef, useState } from "react";
import { copy } from "#common/copy.js";
import { ErrorNotice } from "#src/shared/ui/Errors.jsx";
import { Disclosure } from "#src/shared/ui/Disclosure.jsx";
import { Icon, DeleteButton } from "#src/shared/ui/Icons.jsx";
import { Expiry, FileList } from "#src/entities/transfer/index.js";
import { TransferActions as Share } from "#src/features/manage-transfer/actions.js";
import EditableName from "#src/shared/ui/EditableName.jsx";
import PublicationButton from "#src/features/manage-transfer/publication.js";
import { bytes, date } from "#src/shared/lib/format.js";
const states = {
  uploading: copy.upload,
  queued: copy.queued,
  archiving: (
    <span className="archive-status" aria-label={copy.buildingZip}>
      <Icon name="archive" />
    </span>
  ),
  ready: copy.ready,
  failed: copy.zipCreationFailed,
  deleting: copy.deleting,
  deleted: copy.deleted,
  empty: copy.empty,
};
function HistoryItem({
  transfer: t,
  onDelete,
  onAdd,
  onRemoveFiles,
  onEdit,
  onSettings,
  onPublish,
  onOpen,
  onRenameFile,
  onRenameTitle,
  onGenerateTitle,
  onView,
  renaming,
  selected,
  onSelect,
  selectionDisabled,
}) {
  const [open, setOpen] = useState(false);
  const signature = JSON.stringify([t.revision, t.files]),
    busy = renaming || (t.appendState && t.appendState !== "failed");
  const { selection, toggle, toggleAll, clear, allSelected } = useSelection({
    keys: t.files.map((file, index) => index),
    resetKey: signature,
  });
  return (
    <article className="history-item">
      <div className="history-row">
        <SelectionCheckbox
          className="history-select"
          aria-label={copy.selectTransferPrefix + date(t.created)}
          checked={selected}
          disabled={selectionDisabled}
          onChange={onSelect}
        />
        {t.hasSite && !t.consumed && t.state === "ready" ? (
          <PublicationButton
            className="history-state"
            published={t.published}
            disabled={!!busy || !t.url}
            onToggle={(value) => onPublish(t, value)}
          />
        ) : (
          <span
            className={
              ["queued", "archiving"].includes(t.state)
                ? "history-state archive-status"
                : "history-state"
            }
            role="img"
            aria-label={
              t.consumed
                ? copy.received
                : typeof states[t.state] === "string"
                  ? states[t.state]
                  : copy.buildingZip
            }
            title={
              t.consumed
                ? copy.received
                : typeof states[t.state] === "string"
                  ? states[t.state]
                  : copy.buildingZip
            }
          >
            <Icon
              name={
                t.consumed
                  ? "cancel"
                  : {
                      ready: "check",
                      empty: "archive",
                      deleted: "cancel",
                      deleting: "cancel",
                      failed: "warning",
                      archiving: "archive",
                      queued: "archive",
                      uploading: "upload",
                    }[t.state] || "warning"
              }
            />
          </span>
        )}
        <div className="history-middle">
          {t.url ? (
            <EditableName
              value={t.title || t.name || t.files[0]?.name || "—"}
              label={copy.transferName}
              disabled={!!busy}
              onSave={(value) => onRenameTitle(t, value)}
              onGenerate={
                t.hasSite ? (current) => onGenerateTitle(t, current) : undefined
              }
            />
          ) : (
            <span>{t.title || t.name || t.files[0]?.name || "—"}</span>
          )}
        </div>
        <Share
          url={t.shareUrl || t.url}
          compact
          onOpen={t.url && onOpen ? () => onOpen(t) : undefined}
          onAdd={t.url && onAdd && !busy ? () => onAdd(t.id) : undefined}
          onSettings={t.url && !busy ? () => onSettings(t) : undefined}
          onDelete={
            ["deleted", "deleting"].includes(t.state)
              ? undefined
              : () => onDelete(t.id)
          }
          confirmationKey={t.revision}
        />
        <IconButton
          className="icon-button history-toggle"
          aria-label={copy.transferPrefix + date(t.created)}
          aria-expanded={open}
          aria-controls={"history-" + t.id}
          onClick={() => setOpen(!open)}
        >
          <span className={open ? "chevron expanded" : "chevron"}>
            <Icon name="chevron" />
          </span>
        </IconButton>
      </div>
      <Disclosure open={open} id={"history-" + t.id}>
        <section className="history-information">
          <div className="history-dates">
            <time title={copy.created}>{date(t.created)}</time>
            <span title={copy.expires}>
              {t.oneTime
                ? "1"
                : t.expires === null
                  ? t.ttl === 0
                    ? "∞"
                    : "—"
                  : date(t.expires)}
            </span>
          </div>
          {t.files.length > 0 && (
            <div className="file-selection-actions">
              <label className="select-all">
                <SelectionCheckbox
                  aria-label={copy.selectAllFiles}
                  checked={allSelected}
                  disabled={!!busy || ["deleted", "deleting"].includes(t.state)}
                  indeterminate={
                    selection.size > 0 && selection.size < t.files.length
                  }
                  onChange={toggleAll}
                />
              </label>
              <DeleteButton
                label={copy.deleteSelectedFiles}
                disabled={
                  !!busy ||
                  !selection.size ||
                  ["deleted", "deleting"].includes(t.state)
                }
                confirmationKey={JSON.stringify([t.revision, ...selection])}
                onDelete={async () => {
                  if (await onRemoveFiles(t, [...selection])) clear();
                }}
              />
            </div>
          )}
          <FileList
            files={t.files}
            onRename={
              t.url
                ? (index, value) => onRenameFile(t, index, value)
                : undefined
            }
            onPreview={
              t.url && onView ? (index) => onView(t, index) : undefined
            }
            selection={selection}
            onToggle={toggle}
            onRemove={t.url ? (index) => onRemoveFiles(t, [index]) : undefined}
            confirmationKey={t.revision}
            disabled={!!busy || ["deleted", "deleting"].includes(t.state)}
          />
          {!t.files.length && <p className="muted">{copy.noFilesYet}</p>}
          <p className="muted">{bytes(t.size)}</p>
          {(t.error || t.appendError) && (
            <ErrorNotice error={t.error || t.appendError} />
          )}
          {["ready", "empty"].includes(t.state) && (
            <div className="history-remaining">
              <Expiry
                value={t.expires}
                oneTime={t.oneTime}
                className="expiry-inline"
              />
            </div>
          )}
        </section>
      </Disclosure>
    </article>
  );
}
export default function History({
  items,
  onClose,
  onDelete,
  onAdd,
  onRemoveFiles,
  onRemoveHistory,
  onEdit,
  onSettings,
  onPublish,
  onOpen,
  uploading,
  onRenameFile,
  onRenameTitle,
  onGenerateTitle,
  onView,
  renaming,
  suspended,
}) {
  const searchInput = useRef();
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [searchOpen, setSearchOpen] = useState(false);
  const visibleItems = items.filter(
    (t) =>
      !["deleted", "deleting"].includes(t.state) &&
      (t.expires === undefined ||
        t.expires === null ||
        t.expires > Date.now()) &&
      (!query ||
        [t.title || "", ...t.files.map((file) => file.name)].some((value) =>
          value.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
        )) &&
      (filter === "all" ||
        (filter === "password" && t.hasPassword) ||
        (filter === "infinite" && t.ttl === 0 && !t.oneTime) ||
        (filter === "expiring" &&
          t.url &&
          t.expires !== null &&
          t.expires > Date.now() &&
          t.expires <= Date.now() + 86400000)),
  );
  const { selection, toggle, toggleAll, clear, allSelected } = useSelection({
    keys: visibleItems.map((item) => item.id),
    resetKey: JSON.stringify([query, filter]),
  });
  const [removing, setRemoving] = useState(false),
    [error, setError] = useState("");
  const selectedItems = items.filter((item) => selection.has(item.id));
  return (
    <Modal
      className="history-dialog"
      aria-label={copy.history}
      onClose={onClose}
      suspended={suspended}
      initialFocus="h2"
      title={copy.history}
      closeOnBackdrop
    >
      {({ close, dismiss }) => (
        <>
          <header className="dialog-header">
            <div className="dialog-header-start">
              <h2 aria-label={copy.history} tabIndex={-1}>
                <Icon name="history" />
              </h2>
              <IconButton
                aria-label={copy.searchHistory}
                aria-expanded={searchOpen}
                onClick={() => {
                  setSearchOpen(!searchOpen);
                  setQuery("");
                  setFilter("all");
                }}
              >
                <Icon name="search" />
              </IconButton>
              <div className="dialog-header-actions history-bulk-actions">
                <SelectionCheckbox
                  className="history-select"
                  aria-label={copy.selectAllTransfers}
                  checked={allSelected}
                  disabled={!visibleItems.length || removing}
                  indeterminate={selectedItems.length > 0 && !allSelected}
                  onChange={toggleAll}
                />
                <DeleteButton
                  label={copy.deleteSelectedTransfers}
                  confirmationKey={selectedItems.map((t) => t.id).join(",")}
                  disabled={!selectedItems.length || removing}
                  onDelete={async () => {
                    setRemoving(true);
                    setError("");
                    try {
                      await onRemoveHistory(selectedItems.map((t) => t.id));
                      clear();
                    } catch (e) {
                      setError(e.message);
                    } finally {
                      setRemoving(false);
                    }
                  }}
                />
              </div>
            </div>
            <IconButton
              onClick={close}
              aria-label={copy.closeHistory}
              title={copy.closeHistory}
            >
              <Icon name="cancel" />
            </IconButton>
          </header>
          {searchOpen && (
            <div className="history-search">
              <div className="history-search-field">
                <input
                  ref={searchInput}
                  aria-label={copy.searchFilenamesOrTransfers}
                  placeholder={copy.search}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <IconButton
                    className="icon-button search-clear"
                    aria-label={copy.clearSearch}
                    title={copy.clear}
                    onClick={() => {
                      setQuery("");
                      searchInput.current.focus();
                    }}
                  >
                    <Icon name="cancel" />
                  </IconButton>
                )}
              </div>
              {[
                ["password", "lock", copy.passwordProtected],
                ["infinite", null, copy.noExpiry],
                ["expiring", "clock", copy.expiringWithin24Hours],
              ].map(([value, icon, label]) => (
                <IconButton
                  key={value}

                  aria-label={label}
                  title={label}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(filter === value ? "all" : value)}
                >
                  {icon ? <Icon name={icon} /> : "∞"}
                </IconButton>
              ))}
            </div>
          )}
          <div
            className={
              visibleItems.length ? "dialog-body" : "dialog-body is-empty"
            }
          >
            {error && <ErrorNotice error={error} />}
            {!visibleItems.length && (
              <span
                className="history-empty"
                role="img"
                aria-label={copy.noTransfers}
              >
                <Icon name="cancel" />
              </span>
            )}
            {visibleItems.map((t) => (
              <HistoryItem
                key={t.id}
                transfer={t}
                onSettings={onSettings}
                onPublish={onPublish}
                onRenameFile={onRenameFile}
                onRenameTitle={onRenameTitle}
                onGenerateTitle={onGenerateTitle}
                renaming={renaming}
                onView={(record, index) => {
                  dismiss();
                  onView(record, index);
                }}
                onOpen={
                  uploading
                    ? undefined
                    : (item) => {
                        dismiss();
                        onOpen(item);
                      }
                }
                onEdit={(item) => {
                  dismiss();
                  onEdit(item);
                }}
                selected={selection.has(t.id)}
                onSelect={() => toggle(t.id)}
                selectionDisabled={removing}
                onDelete={onDelete}
                onRemoveFiles={onRemoveFiles}
                onAdd={
                  uploading
                    ? undefined
                    : (id) => {
                        dismiss();
                        onAdd(id);
                      }
                }
              />
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
