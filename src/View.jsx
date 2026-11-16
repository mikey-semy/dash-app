import { ErrorNotice, connectionError } from "./Errors.jsx";
import { Disclosure, AnimatedDetails } from "./Disclosure.jsx";
import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import EditableName from "./EditableName.jsx";
import PublicationButton from "./PublicationButton.jsx";
import QRButton from "./QRButton.jsx";
import { captureFiles } from "./folders.js";
const FolderUpload = lazy(() => import("./FolderUpload.jsx"));
import { Icon, CopyButton, DeleteButton, Expiry } from "./Icons.jsx";
const TextComposer = lazy(() => import("./TextComposer.jsx"));
const MediaViewer = lazy(() => import("./MediaViewer.jsx"));
const TransferSettings = lazy(() => import("./TransferSettings.jsx"));
const TextViewer = lazy(() => import("./TextViewer.jsx"));
export const bytes = (n) =>
  n < 1000
    ? Math.round(n) + " Б"
    : new Intl.NumberFormat("ru", { maximumFractionDigits: 1 }).format(
        n / (n >= 1e9 ? 1e9 : n >= 1e6 ? 1e6 : 1e3),
      ) +
      " " +
      (n >= 1e9 ? "ГБ" : n >= 1e6 ? "МБ" : "КБ");
export const date = (n) => new Date(n).toLocaleString("ru-RU");
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
                aria-label={"Выбрать " + f.name}
                onChange={() => onToggle(i)}
              />
              {onRename ? (
                <EditableName
                  value={f.name}
                  label={"Имя файла " + (i + 1)}
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
              label={"Имя файла " + (i + 1)}
              disabled={disabled}
              onSave={(name) => onRename(i, name)}
            />
          ) : onPreview && (f.preview || f.media) ? (
            <button
              type="button"
              className="file-preview-link"
              onClick={() => onPreview(i)}
              title="Просмотреть файл"
            >
              {f.name}
            </button>
          ) : (
            <span>{f.name}</span>
          )}
          <small className="file-size">{bytes(f.size)}</small>
          <div className="file-actions">
            {onRename && onPreview && (f.preview || f.media) && (
              <button
                type="button"
                className="icon-button"
                aria-label={"Просмотреть " + f.name}
                onClick={() => onPreview(i)}
              >
                <Icon name="eye" />
              </button>
            )}
            {downloadPath && !f.name.endsWith("/") && (
              <a
                className="icon-button"
                href={downloadPath(i)}
                aria-label={"Скачать " + f.name}
              >
                <Icon name="download" />
              </a>
            )}
            {onRemove && (
              <DeleteButton
                icon="cancel"
                label={"Удалить " + f.name}
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
export function Share({
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
  deleteLabel = "Удалить",
  confirmationKey,
}) {
  return (
    <div className={onAdd && !compact ? "share share-ready" : "share"}>
      {onAdd && !compact && (
        <button
          className="primary-action"
          onClick={onAdd}
          aria-label="Добавить"
          title="Добавить"
        >
          <Icon name="add" />
        </button>
      )}
      <div className="share-controls">
        {publication && <PublicationButton {...publication} />}
        {(onOpen || compact) && (
          <button
            type="button"
            className="icon-button"
            aria-label="Открыть передачу"
            disabled={!onOpen}
            title="Открыть как текущую"
            onClick={onOpen}
          >
            <Icon name="eye" />
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            className={editFailed ? "icon-button edit-error" : "icon-button"}
            disabled={editBusy || editFailed}
            aria-label={
              editFailed ? "Не удалось открыть текст" : "Редактировать текст"
            }
            title={
              editFailed ? "Не удалось открыть текст" : "Редактировать текст"
            }
            onClick={() => {
              onEdit();
            }}
          >
            <Icon name={editFailed ? "cancel" : "edit"} />
          </button>
        )}
        {compact && (
          <button
            type="button"
            className="icon-button"
            aria-label="Добавить файлы в передачу"
            title="Добавить файлы"
            disabled={!onAdd}
            onClick={onAdd}
          >
            <Icon name="add" />
          </button>
        )}
        {(onSettings || compact) && (
          <button
            type="button"
            className="icon-button"
            aria-label="Параметры передачи"
            disabled={!onSettings}
            title="Срок и пароль передачи"
            onClick={onSettings}
          >
            <Icon name="settings" />
          </button>
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
const states = {
  uploading: "Загрузка",
  queued: "В очереди",
  archiving: (
    <span className="archive-status" aria-label="Сборка ZIP">
      <Icon name="archive" />
    </span>
  ),
  ready: "Готово",
  failed: "Ошибка архивации",
  deleting: "Удаление",
  deleted: "Удалено",
  empty: "Пусто",
};
function Gear() {
  return <Icon name="settings" size={22} />;
}
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
  const [open, setOpen] = useState(false),
    [selection, setSelection] = useState(new Set());
  const signature = JSON.stringify([t.revision, t.files]),
    busy = renaming || (t.appendState && t.appendState !== "failed");
  useEffect(() => setSelection(new Set()), [signature]);
  const toggle = (i) =>
    setSelection((previous) => {
      const next = new Set(previous);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  return (
    <article className="history-item">
      <div className="history-row">
        <input
          className="history-select"
          type="checkbox"
          aria-label={"Выбрать передачу " + date(t.created)}
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
                ? "Получено"
                : typeof states[t.state] === "string"
                  ? states[t.state]
                  : "Сборка ZIP"
            }
            title={
              t.consumed
                ? "Получено"
                : typeof states[t.state] === "string"
                  ? states[t.state]
                  : "Сборка ZIP"
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
              label="Название передачи"
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
        <button
          type="button"
          className="icon-button history-toggle"
          aria-label={"Передача " + date(t.created)}
          aria-expanded={open}
          aria-controls={"history-" + t.id}
          onClick={() => setOpen(!open)}
        >
          <span className={open ? "chevron expanded" : "chevron"}>
            <Icon name="chevron" />
          </span>
        </button>
      </div>
      <Disclosure open={open} id={"history-" + t.id}>
        <section className="history-information">
          <div className="history-dates">
            <time title="Создана">{date(t.created)}</time>
            <span title="Окончание хранения">
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
                <input
                  type="checkbox"
                  aria-label="Выбрать все файлы"
                  checked={selection.size === t.files.length}
                  disabled={!!busy || ["deleted", "deleting"].includes(t.state)}
                  ref={(el) => {
                    if (el)
                      el.indeterminate =
                        selection.size > 0 && selection.size < t.files.length;
                  }}
                  onChange={() =>
                    setSelection(
                      selection.size === t.files.length
                        ? new Set()
                        : new Set(t.files.map((f, i) => i)),
                    )
                  }
                />
              </label>
              <DeleteButton
                label="Удалить выбранные файлы"
                disabled={
                  !!busy ||
                  !selection.size ||
                  ["deleted", "deleting"].includes(t.state)
                }
                confirmationKey={JSON.stringify([t.revision, ...selection])}
                onDelete={async () => {
                  if (await onRemoveFiles(t.id, [...selection], t.revision))
                    setSelection(new Set());
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
            onRemove={
              t.url
                ? (index) => onRemoveFiles(t.id, [index], t.revision)
                : undefined
            }
            confirmationKey={t.revision}
            disabled={!!busy || ["deleted", "deleting"].includes(t.state)}
          />
          {!t.files.length && <p className="muted">Пока нет файлов</p>}
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
function History({
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
  const searchInput = useRef(),
    savedScroll = useRef(0);
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
  useEffect(() => setSelection(new Set()), [query, filter]);
  const [selection, setSelection] = useState(new Set()),
    [removing, setRemoving] = useState(false),
    [error, setError] = useState("");
  const selectedItems = items.filter((t) => selection.has(t.id));
  const allSelected =
    visibleItems.length > 0 && visibleItems.every((t) => selection.has(t.id));
  const toggle = (id) =>
    setSelection((previous) => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const ref = useRef(),
    timer = useRef(),
    [closing, setClosing] = useState(false);
  const close = () => {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(onClose, 180);
  };
  useEffect(() => {
    ref.current.showModal();
    ref.current.querySelector("h2").focus({ preventScroll: true });
    document.title = "История";
    return () => {
      clearTimeout(timer.current);
      ref.current?.close();
      document.title = "Загрузка";
    };
  }, []);
  useEffect(() => {
    if (!ref.current) return;
    const body = ref.current.querySelector(".dialog-body");
    if (suspended) {
      savedScroll.current = body?.scrollTop || 0;
      ref.current.close();
    } else if (!ref.current.open) {
      ref.current.showModal();
      requestAnimationFrame(() => {
        if (body) body.scrollTop = savedScroll.current;
      });
    }
  }, [suspended]);
  return (
    <dialog
      ref={ref}
      className="history-dialog"
      data-closing={closing}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      aria-label="История"
    >
      <header className="dialog-header">
        <div className="dialog-header-start">
          <h2 aria-label="История" tabIndex={-1}>
            <Icon name="history" />
          </h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Поиск в истории"
            aria-expanded={searchOpen}
            onClick={() => {
              setSearchOpen(!searchOpen);
              setQuery("");
              setFilter("all");
            }}
          >
            <Icon name="search" />
          </button>
          <div className="dialog-header-actions history-bulk-actions">
            <input
              className="history-select"
              type="checkbox"
              aria-label="Выбрать все передачи"
              checked={allSelected}
              disabled={!visibleItems.length || removing}
              ref={(el) => {
                if (el)
                  el.indeterminate = selectedItems.length > 0 && !allSelected;
              }}
              onChange={() =>
                setSelection(
                  allSelected
                    ? new Set()
                    : new Set(visibleItems.map((t) => t.id)),
                )
              }
            />
            <DeleteButton
              label="Удалить выбранные передачи"
              confirmationKey={selectedItems.map((t) => t.id).join(",")}
              disabled={!selectedItems.length || removing}
              onDelete={async () => {
                setRemoving(true);
                setError("");
                try {
                  await onRemoveHistory(selectedItems.map((t) => t.id));
                  setSelection(new Set());
                } catch (e) {
                  setError(e.message);
                } finally {
                  setRemoving(false);
                }
              }}
            />
          </div>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={close}
          aria-label="Закрыть историю"
          title="Закрыть историю"
        >
          <Icon name="cancel" />
        </button>
      </header>
      {searchOpen && (
        <div className="history-search">
          <div className="history-search-field">
            <input
              ref={searchInput}
              aria-label="Поиск по имени файла или передачи"
              placeholder="Поиск"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className="icon-button search-clear"
                aria-label="Очистить поиск"
                title="Очистить"
                onClick={() => {
                  setQuery("");
                  searchInput.current.focus();
                }}
              >
                <Icon name="cancel" />
              </button>
            )}
          </div>
          {[
            ["password", "lock", "С паролем"],
            ["infinite", null, "Бессрочные"],
            ["expiring", "clock", "Истекают за сутки"],
          ].map(([value, icon, label]) => (
            <button
              type="button"
              key={value}
              className="icon-button"
              aria-label={label}
              title={label}
              aria-pressed={filter === value}
              onClick={() => setFilter(filter === value ? "all" : value)}
            >
              {icon ? <Icon name={icon} /> : "∞"}
            </button>
          ))}
        </div>
      )}
      <div
        className={visibleItems.length ? "dialog-body" : "dialog-body is-empty"}
      >
        {error && <ErrorNotice error={error} />}
        {!visibleItems.length && (
          <span className="history-empty" role="img" aria-label="Нет передач">
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
              ref.current.close();
              onClose();
              onView(record, index);
            }}
            onOpen={
              uploading
                ? undefined
                : (item) => {
                    ref.current.close();
                    onClose();
                    onOpen(item);
                  }
            }
            onEdit={(item) => {
              ref.current.close();
              onClose();
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
                    ref.current.close();
                    onClose();
                    onAdd(id);
                  }
            }
          />
        ))}
      </div>
    </dialog>
  );
}
export function OwnerView(p) {
  const [draft, setDraft] = useState(null),
    [folders, setFolders] = useState(null),
    [dropZone, setDropZone] = useState("new"),
    [config, setConfig] = useState(null),
    [opening, setOpening] = useState(false),
    [editorError, setEditorError] = useState(""),
    [viewing, setViewing] = useState(null),
    [historyOpen, setHistoryOpen] = useState(false),
    [passwordState, setPasswordState] = useState("idle"),
    input = useRef(),
    appendTarget = useRef(null),
    settings = useRef(),
    passwordClick = useRef(),
    passwordVersion = useRef(0),
    editorTimer = useRef();
  useEffect(() => () => clearTimeout(editorTimer.current), []);
  useEffect(() => {
    const reset = () => window.scrollTo(0, 0);
    reset();
    window.addEventListener("pageshow", reset);
    window.addEventListener("focus", reset);
    window.visualViewport?.addEventListener("resize", reset);
    return () => {
      window.removeEventListener("pageshow", reset);
      window.removeEventListener("focus", reset);
      window.visualViewport?.removeEventListener("resize", reset);
    };
  }, []);
  useEffect(
    () => () => {
      clearTimeout(passwordClick.current);
      passwordVersion.current++;
    },
    [],
  );
  useEffect(() => {
    if (p.upload) {
      clearTimeout(passwordClick.current);
      passwordVersion.current++;
    }
  }, [p.upload]);
  const receiveFiles = (data, parentId = null) => {
    const source = captureFiles(data);
    if (source.folders) setFolders({ ...source, parentId });
    else p.choose(source.files, parentId);
  };
  useEffect(() => {
    const paste = (event) => {
      if (event.clipboardData?.files.length) {
        event.preventDefault();
        event.stopPropagation();
        if (
          p.upload ||
          p.preparingUpload ||
          draft !== null ||
          folders !== null ||
          config ||
          (historyOpen && !viewing)
        )
          return;
        const current = viewing?.record || latest;
        if (viewing) {
          setViewing(null);
          setHistoryOpen(false);
          p.setSelected(current.id);
        }
        receiveFiles(event.clipboardData, current?.url ? current.id : null);
        return;
      }
      if (
        event.defaultPrevented ||
        p.upload ||
        historyOpen ||
        viewing ||
        config ||
        draft !== null ||
        folders !== null ||
        (event.target instanceof Element &&
          event.target.closest("input,textarea,[contenteditable=true]"))
      )
        return;
      {
        const text = event.clipboardData.getData("text/plain");
        if (text) {
          event.preventDefault();
          settings.current.open = false;
          setDraft({ text });
        }
      }
    };
    document.addEventListener("paste", paste, true);
    return () => document.removeEventListener("paste", paste, true);
  }, [
    p.upload,
    p.preparingUpload,
    p.choose,
    historyOpen,
    draft,
    folders,
    config,
    viewing,
    p.selected,
    p.history,
  ]);
  useEffect(() => {
    if (config && !p.history.some((t) => t.id === config && t.url))
      setConfig(null);
  }, [config, p.history]);
  const editText = async (transfer) => {
    if (opening) return;
    setOpening(true);
    setEditorError("");
    clearTimeout(editorTimer.current);
    try {
      const text = await p.readText(transfer);
      setDraft({
        text,
        id: transfer.id,
        revision: transfer.revision,
        filename: transfer.files[0].name,
      });
    } catch (error) {
      console.error("[DU] text editor", error);
      setEditorError(transfer.id);
      editorTimer.current = setTimeout(() => setEditorError(""), 2400);
      p.refresh();
    } finally {
      setOpening(false);
    }
  };
  useEffect(() => {
    if (
      viewing &&
      !p.history.some(
        (t) =>
          t.id === viewing.record.id &&
          t.revision === viewing.record.revision &&
          t.url,
      )
    )
      setViewing(null);
  }, [p.history, viewing]);
  const clearPassword = () => {
    clearTimeout(passwordClick.current);
    passwordVersion.current++;
    p.setSecret("");
    setPasswordState("removed");
  };
  const generatePassword = async () => {
    const version = ++passwordVersion.current;
    const a = new Uint32Array(1);
    do {
      crypto.getRandomValues(a);
    } while (a[0] >= 4294000000);
    const pin = String(a[0] % 1000000).padStart(6, "0");
    try {
      await navigator.clipboard.writeText(pin);
      if (version !== passwordVersion.current) return;
      p.setSecret(pin);
      setPasswordState("copied");
    } catch (error) {
      console.error("[DU] password clipboard", error);
      if (version === passwordVersion.current) setPasswordState("failed");
    }
  };
  useEffect(() => {
    if (passwordState === "copied" || passwordState === "removed") {
      const timer = setTimeout(() => setPasswordState("idle"), 1600);
      return () => clearTimeout(timer);
    }
  }, [passwordState]);
  const durations = [
    [3600, "1", "ч", "1 час"],
    [21600, "6", "ч", "6 часов"],
    [86400, "24", "ч", "Сутки"],
    [259200, "3", "д", "3 дня"],
    [604800, "7", "д", "7 дней"],
    [0, "∞", "", "Бессрочно"],
    [-1, "1", "", "Одноразовая"],
  ];
  const durationIndex = durations.findIndex(([value]) => value === p.ttl),
    duration = durations[durationIndex];
  const latest = p.history.find((t) => t.id === p.selected);
  const busyAppend = latest?.appendState && latest.appendState !== "failed";
  const completed =
    !p.upload &&
    (!busyAppend || p.renaming) &&
    ["ready", "empty"].includes(latest?.state) &&
    latest.url;
  const preparing =
    !p.upload &&
    (["queued", "archiving"].includes(latest?.state) || busyAppend);
  const speed = p.elapsed ? p.progress / p.elapsed : 0,
    eta = speed ? Math.max(0, (p.upload?.total - p.progress) / speed) : 0;
  return (
    <main
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        if (
          !p.upload &&
          !p.preparingUpload &&
          !preparing &&
          !folders &&
          !historyOpen &&
          !viewing &&
          !config &&
          !draft
        ) {
          p.setDrag(true);
          setDropZone(
            completed && e.clientY >= innerHeight / 2 ? "append" : "new",
          );
        }
      }}
      onDragLeave={(e) => {
        if (
          !e.currentTarget.contains(e.relatedTarget) &&
          (e.clientX <= 0 ||
            e.clientY <= 0 ||
            e.clientX >= innerWidth ||
            e.clientY >= innerHeight)
        )
          p.setDrag(false);
      }}
      onDropCapture={(e) => {
        if (
          !e.dataTransfer.files.length &&
          !Array.from(e.dataTransfer.types || []).includes("Files")
        )
          return;
        if (
          draft ||
          folders ||
          config ||
          (historyOpen && !viewing) ||
          p.upload ||
          p.preparingUpload
        ) {
          e.preventDefault();
          e.stopPropagation();
          p.setDrag(false);
        } else if (viewing) {
          e.preventDefault();
          e.stopPropagation();
          p.setDrag(false);
          const current = viewing.record;
          setViewing(null);
          setHistoryOpen(false);
          p.setSelected(current.id);
          receiveFiles(e.dataTransfer, current.id);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        p.setDrag(false);
        if (
          viewing &&
          !p.upload &&
          !p.preparingUpload &&
          !draft &&
          !folders &&
          !config
        ) {
          const current = viewing.record;
          setViewing(null);
          setHistoryOpen(false);
          p.setSelected(current.id);
          receiveFiles(e.dataTransfer, current.id);
          return;
        }
        if (
          e.target instanceof Element &&
          e.target.closest("[contenteditable=true]")
        )
          return;
        if (
          !p.upload &&
          !p.preparingUpload &&
          !preparing &&
          !folders &&
          !historyOpen &&
          !config &&
          !draft
        )
          receiveFiles(
            e.dataTransfer,
            completed && e.clientY >= innerHeight / 2 ? latest.id : null,
          );
      }}
      className={p.drag ? "owner dragging" : "owner"}
    >
      {p.drag && (
        <div className="drop-zones" aria-label="Куда загрузить файлы">
          <div
            className={dropZone === "new" ? "drop-zone active" : "drop-zone"}
            aria-label="Новая передача"
          >
            <Icon name="upload" size={28} />
          </div>
          {completed && (
            <div
              className={
                dropZone === "append" ? "drop-zone active" : "drop-zone"
              }
              aria-label="Добавить к текущей передаче"
            >
              <Icon name="add" size={28} />
            </div>
          )}
        </div>
      )}
      {completed && (
        <button
          type="button"
          className="icon-button current-close"
          aria-label="Закрыть текущую передачу"
          title="Новая передача"
          onClick={p.startNew}
        >
          <Icon name="cancel" />
        </button>
      )}
      <AnimatedDetails
        className="settings"
        inline
        ref={settings}
        label="Настройки"
        summary={<Gear />}
      >
        <div className="settings-panel settings-toolbar">
          <button
            className="icon-button"
            aria-label="История"
            title="История"
            onClick={() => {
              settings.current.open = false;
              setHistoryOpen(true);
            }}
          >
            <Icon name="history" />
          </button>
          <button
            type="button"
            hidden={completed}
            className="icon-button duration-button"
            aria-label={"Срок хранения: " + duration[3]}
            title={duration[3] + ". Нажмите, чтобы сменить срок"}
            disabled={!!p.upload}
            onClick={() =>
              p.setTtl(durations[(durationIndex + 1) % durations.length][0])
            }
          >
            <span className="duration-value" key={p.ttl}>
              <span>{duration[1]}</span>
              <small>{duration[2]}</small>
            </span>
          </button>
          <button
            type="button"
            className={
              passwordState === "failed"
                ? "icon-button edit-error"
                : "icon-button"
            }
            hidden={completed}
            aria-label="Сгенерировать и скопировать пароль"
            title={
              passwordState === "removed"
                ? "Пароль убран"
                : passwordState === "copied"
                  ? "Пароль скопирован"
                  : passwordState === "failed"
                    ? undefined
                    : p.secret
                      ? "Пароль установлен. Один клик — новый пароль, двойной — убрать"
                      : "Один клик — сгенерировать и скопировать пароль, двойной — убрать"
            }
            data-active={!!p.secret}
            aria-pressed={!!p.secret}
            disabled={!!p.upload}
            onClick={(e) => {
              clearTimeout(passwordClick.current);
              if (e.detail === 0) generatePassword();
              else if (e.detail === 1)
                passwordClick.current = setTimeout(generatePassword, 350);
            }}
            onDoubleClick={clearPassword}
            onKeyDown={(e) => {
              if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                clearPassword();
              }
            }}
          >
            <Icon
              name={
                passwordState === "failed"
                  ? "cancel"
                  : passwordState === "copied"
                    ? "check"
                    : p.secret
                      ? "lock"
                      : "unlock"
              }
            />
            <span className="sr-only" role="status">
              {passwordState === "removed"
                ? "Пароль убран"
                : passwordState === "copied"
                  ? "Пароль скопирован"
                  : passwordState === "failed"
                    ? "Не удалось скопировать пароль"
                    : ""}
            </span>
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Новая текстовая передача"
            title="Новая текстовая передача"
            disabled={!!p.upload}
            onClick={() => {
              settings.current.open = false;
              setDraft({ text: "" });
            }}
          >
            <Icon name="code" />
          </button>
          <button
            className="icon-button"
            aria-label="Выйти"
            title="Выйти"
            onClick={p.logout}
          >
            <Icon name="logout" />
          </button>
        </div>
      </AnimatedDetails>
      {config && p.history.find((t) => t.id === config)?.url && (
        <Suspense fallback={null}>
          <TransferSettings
            transfer={p.history.find((t) => t.id === config)}
            api={p.settingsApi}
            renaming={p.renaming}
            onRename={(record, patch) => p.rename(record, patch)}
            onClose={() => setConfig(null)}
            onEdit={editText}
          />
        </Suspense>
      )}
      {folders && (
        <Suspense fallback={null}>
          <FolderUpload
            source={folders}
            onClose={() => setFolders(null)}
            onSend={(files) => p.choose(files, folders.parentId)}
          />
        </Suspense>
      )}
      {draft !== null && (
        <Suspense fallback={null}>
          <TextComposer
            initial={draft.text}
            filename={draft.filename}
            editing={!!draft.id}
            onClose={() => setDraft(null)}
            onSend={(files) =>
              draft.id ? p.replaceText(files, draft) : p.choose(files)
            }
          />
        </Suspense>
      )}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onCancel={() => (appendTarget.current = null)}
        onChange={(e) => {
          p.choose(e.target.files, appendTarget.current);
          appendTarget.current = null;
          e.target.value = "";
        }}
      />
      <section className="center">
        <div className="content">
          {connectionError(p.error) && !p.upload ? (
            <ErrorNotice error={p.error} />
          ) : p.preparingUpload ? (
            <div
              className="archive-status"
              role="status"
              aria-label="Подготовка загрузки"
            >
              <Icon name="archive" />
            </div>
          ) : p.upload ? (
            <>
              <FileList files={p.upload.files} />
              <div className="upload-times">
                <time title="Прошло">{Math.round(p.elapsed)} с</time>
                <time title="Осталось">≈ {Math.round(eta)} с</time>
              </div>
              <progress
                aria-label="Прогресс загрузки"
                value={p.progress}
                max={p.upload.total || 1}
              />
              <div className="upload-metrics">
                <span title="Загружено / общий размер">
                  {bytes(p.progress)} / {bytes(p.upload.total)}
                </span>
                <span title="Скорость">{bytes(speed)}/с</span>
              </div>
              <div className="upload-actions">
                <button
                  type="button"
                  className="icon-button"
                  disabled={p.paused && p.running}
                  aria-label={p.paused ? "Продолжить" : "Пауза"}
                  title={
                    p.upload.missing
                      ? "Выберите те же файлы для продолжения"
                      : p.paused
                        ? "Продолжить"
                        : "Пауза"
                  }
                  onClick={() =>
                    p.upload.missing
                      ? input.current.click()
                      : p.paused
                        ? p.run(p.upload)
                        : p.pause()
                  }
                >
                  <Icon name={p.paused ? "play" : "pause"} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Отменить"
                  title="Отменить"
                  onClick={p.cancel}
                >
                  <Icon name="cancel" />
                </button>
              </div>
            </>
          ) : completed ? (
            <>
              <Share
                url={latest.shareUrl || latest.url}
                publication={
                  latest.hasSite
                    ? {
                        published: latest.published,
                        onToggle: (published) =>
                          p.settingsApi(
                            "/api/transfers/" + latest.id + "/settings",
                            { published },
                            "PATCH",
                          ),
                      }
                    : undefined
                }
                onAdd={() => {
                  appendTarget.current = latest.id;
                  input.current.click();
                }}
                onDelete={() => p.remove(latest.id)}
                onSettings={() => setConfig(latest.id)}
                editFailed={editorError === latest.id}
                editBusy={opening}
                onEdit={latest.preview ? () => editText(latest) : undefined}
              />
            </>
          ) : preparing ? (
            <div
              className="archive-status"
              role="status"
              aria-label="Сборка ZIP"
            >
              <Icon name="archive" />
            </div>
          ) : (
            <button
              className="primary-action"
              aria-label="ЗАГРУЗИТЬ"
              title="Загрузить"
              onClick={() => {
                appendTarget.current = null;
                input.current.click();
              }}
            >
              <Icon name="upload" />
            </button>
          )}
          {completed && !connectionError(p.error) && (
            <AnimatedDetails
              className="transfer-details owner-details"
              label="Подробности передачи"
              summary={<Icon name="chevron" />}
            >
              <div className="transfer-information">
                <p>
                  <EditableName
                    value={latest.title || latest.name || date(latest.created)}
                    label="Название передачи"
                    disabled={p.renaming}
                    onSave={(value) => p.rename(latest, { title: value })}
                    onGenerate={
                      latest.hasSite
                        ? (current) =>
                            p
                              .settingsApi(
                                "/api/transfers/" +
                                  latest.id +
                                  "/title-suggestion?current=" +
                                  encodeURIComponent(current),
                              )
                              .then((result) => result.title)
                        : undefined
                    }
                  />
                </p>
                <FileList
                  files={latest.files}
                  onRemove={(index) =>
                    p.removeFiles(latest.id, [index], latest.revision)
                  }
                  confirmationKey={latest.revision}
                  onRename={(index, value) =>
                    p.rename(latest, {
                      names: latest.files.map((file, i) =>
                        i === index ? value : file.name,
                      ),
                    })
                  }
                  disabled={p.renaming}
                  onPreview={(index) => setViewing({ record: latest, index })}
                />
                <p className="muted">{bytes(latest.size)}</p>
                <p className="muted">
                  {latest.oneTime
                    ? "1"
                    : latest.expires === null
                      ? "∞"
                      : date(latest.expires)}
                </p>
              </div>
            </AnimatedDetails>
          )}
          {(p.error || latest?.appendError) &&
            !(connectionError(p.error) && !p.upload) && (
              <ErrorNotice error={p.error || latest?.appendError} />
            )}
        </div>
      </section>
      {completed && <Expiry value={latest.expires} oneTime={latest.oneTime} />}
      {viewing && (
        <Suspense fallback={null}>
          {viewing.record.files[viewing.index].media ? (
            <MediaViewer
              token=""
              info={{
                ...viewing.record,
                ...viewing.record.files[viewing.index],
              }}
              source={
                "/api/transfers/" +
                viewing.record.id +
                "/media/" +
                viewing.index
              }
              download={
                "/api/transfers/" +
                viewing.record.id +
                "/media/" +
                viewing.index +
                "?download=1"
              }
              shareUrl={viewing.record.shareUrl || viewing.record.url}
              onClose={() => setViewing(null)}
            />
          ) : (
            <TextViewer
              token={new URL(viewing.record.url).pathname.split("/").pop()}
              shareUrl={viewing.record.shareUrl || viewing.record.url}
              index={viewing.index}
              info={{
                ...viewing.record,
                name: viewing.record.files[viewing.index].name,
                etag: `"${viewing.record.revision}"`,
              }}
              rawPath={
                "/api/transfers/" + viewing.record.id + "/text/" + viewing.index
              }
              downloadPath={
                "/api/transfers/" +
                viewing.record.id +
                "/text/" +
                viewing.index +
                "?download=1"
              }
              onClose={() => setViewing(null)}
              onUnavailable={() => {
                setViewing(null);
                p.refresh();
              }}
              onUnsupported={() => setViewing(null)}
              onEdit={
                viewing.record.preview
                  ? () => {
                      const record = viewing.record;
                      setViewing(null);
                      editText(record);
                    }
                  : undefined
              }
            />
          )}
        </Suspense>
      )}

      {historyOpen && (
        <History
          items={p.history}
          suspended={!!config}
          onClose={() => setHistoryOpen(false)}
          onDelete={p.remove}
          onRemoveFiles={p.removeFiles}
          onRemoveHistory={p.removeHistory}
          onEdit={editText}
          renaming={p.renaming}
          onRenameFile={(record, index, value) =>
            p.rename(record, {
              names: record.files.map((file, i) =>
                i === index ? value : file.name,
              ),
            })
          }
          onRenameTitle={(record, value) => p.rename(record, { title: value })}
          onGenerateTitle={(record, current) =>
            p
              .settingsApi(
                "/api/transfers/" +
                  record.id +
                  "/title-suggestion?current=" +
                  encodeURIComponent(current),
              )
              .then((result) => result.title)
          }
          onView={(record, index) => setViewing({ record, index })}
          uploading={!!p.upload || p.preparingUpload}
          onOpen={(item) => p.setSelected(item.id)}
          onSettings={(item) => setConfig(item.id)}
          onPublish={(item, published) =>
            p.settingsApi(
              "/api/transfers/" + item.id + "/settings",
              { published },
              "PATCH",
            )
          }
          onAdd={(id) => {
            appendTarget.current = id;
            input.current.click();
          }}
        />
      )}
    </main>
  );
}
