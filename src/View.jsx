import { Disclosure, AnimatedDetails } from "./Disclosure.jsx";
import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import QRButton from "./QRButton.jsx";
import { Icon, CopyButton, DeleteButton, Expiry } from "./Icons.jsx";
const TextComposer = lazy(() => import("./TextComposer.jsx"));
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
  disabled = false,
}) {
  return (
    <ul className="files">
      {files.map((f, i) => (
        <li key={i}>
          {selection ? (
            <label className="file-choice">
              <input
                type="checkbox"
                checked={selection.has(i)}
                disabled={disabled}
                aria-label={"Выбрать " + f.name}
                onChange={() => onToggle(i)}
              />
              <span>{f.name}</span>
            </label>
          ) : onPreview && f.preview ? (
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
          <small>{bytes(f.size)}</small>
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
        {onEdit && (
          <button
            type="button"
            className="icon-button"
            aria-label="Редактировать текст"
            title="Редактировать текст"
            onClick={() => {
              onEdit();
            }}
          >
            <Icon name="edit" />
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
  selected,
  onSelect,
  selectionDisabled,
}) {
  const [open, setOpen] = useState(false),
    [selection, setSelection] = useState(new Set());
  const signature = JSON.stringify([t.revision, t.files]),
    busy = t.appendState && t.appendState !== "failed";
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
        <button
          className="history-toggle"
          aria-label={"Передача " + date(t.created)}
          aria-expanded={open}
          aria-controls={"history-" + t.id}
          onClick={() => setOpen(!open)}
        >
          <span
            className="history-state"
            role="img"
            aria-label={
              typeof states[t.state] === "string"
                ? states[t.state]
                : "Сборка ZIP"
            }
            title={
              typeof states[t.state] === "string"
                ? states[t.state]
                : "Сборка ZIP"
            }
          >
            <Icon
              name={
                {
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
          <span className="history-date">
            <time>{date(t.created)}</time>
            <small key={t.state}>
              {t.state === "ready" &&
              t.expires !== null &&
              t.expires <= Date.now() ? (
                "Срок истёк"
              ) : t.appendState && t.appendState !== "failed" ? (
                "Обновление файлов"
              ) : ["ready", "empty"].includes(t.state) ? (
                <Expiry value={t.expires} className="expiry-inline" />
              ) : ["deleted", "deleting"].includes(t.state) ? null : (
                states[t.state]
              )}
            </small>
          </span>
          <span className={open ? "chevron expanded" : "chevron"}>
            <Icon name="chevron" />
          </span>
        </button>
        <Share
          url={t.url}
          onEdit={
            t.preview && t.url && !busy && onEdit ? () => onEdit(t) : undefined
          }
          compact
          onAdd={
            t.url && (!t.appendState || t.appendState === "failed")
              ? () => onAdd(t.id)
              : undefined
          }
          deleteLabel={selection.size ? "Удалить выбранные файлы" : "Удалить"}
          confirmationKey={JSON.stringify([t.revision, ...selection])}
          onDelete={
            selection.size
              ? busy
                ? undefined
                : async () => {
                    if (await onRemoveFiles(t.id, [...selection], t.revision))
                      setSelection(new Set());
                  }
              : ["deleted", "deleting"].includes(t.state)
                ? undefined
                : () => onDelete(t.id)
          }
        />
      </div>
      <Disclosure open={open} id={"history-" + t.id}>
        <section className="history-information">
          {t.files.length > 0 && (
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
          )}
          <FileList
            files={t.files}
            selection={selection}
            onToggle={toggle}
            disabled={!!busy || ["deleted", "deleting"].includes(t.state)}
          />
          {!t.files.length && <p className="muted">Пока нет файлов</p>}
          <p className="muted">{bytes(t.size)}</p>
          {(t.error || t.appendError) && (
            <p role="alert">{t.error || t.appendError}</p>
          )}
          <p className="muted">
            {t.expires
              ? date(t.expires)
              : t.ttl === 0
                ? "∞"
                : "Срок: " + t.ttl / 3600 + " ч после готовности"}
          </p>
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
}) {
  const [selection, setSelection] = useState(new Set()),
    [removing, setRemoving] = useState(false),
    [error, setError] = useState("");
  const selectedItems = items.filter((t) => selection.has(t.id));
  const allSelected = items.length > 0 && selectedItems.length === items.length;
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
    timer.current = setTimeout(
      onClose,
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180,
    );
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
          <div className="dialog-header-actions history-bulk-actions">
            <input
              className="history-select"
              type="checkbox"
              aria-label="Выбрать все передачи"
              checked={allSelected}
              disabled={!items.length || removing}
              ref={(el) => {
                if (el)
                  el.indeterminate = selectedItems.length > 0 && !allSelected;
              }}
              onChange={() =>
                setSelection(
                  allSelected ? new Set() : new Set(items.map((t) => t.id)),
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
      <div className={items.length ? "dialog-body" : "dialog-body is-empty"}>
        {error && <p role="alert">{error}</p>}
        {!items.length && (
          <span className="history-empty" role="img" aria-label="Нет передач">
            <Icon name="cancel" />
          </span>
        )}
        {items.map((t) => (
          <HistoryItem
            key={t.id}
            transfer={t}
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
            onAdd={(id) => {
              ref.current.close();
              onClose();
              onAdd(id);
            }}
          />
        ))}
      </div>
    </dialog>
  );
}
export function OwnerView(p) {
  const [draft, setDraft] = useState(null),
    [opening, setOpening] = useState(false),
    [editorError, setEditorError] = useState(""),
    [viewing, setViewing] = useState(null),
    [historyOpen, setHistoryOpen] = useState(false),
    [passwordState, setPasswordState] = useState("idle"),
    input = useRef(),
    appendTarget = useRef(null),
    settings = useRef(),
    passwordClick = useRef(),
    passwordVersion = useRef(0);
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
  useEffect(() => {
    const paste = (event) => {
      if (
        event.defaultPrevented ||
        p.upload ||
        historyOpen ||
        draft !== null ||
        (event.target instanceof Element &&
          event.target.closest("input,textarea,[contenteditable=true]"))
      )
        return;
      if (event.clipboardData.files.length) {
        event.preventDefault();
        p.choose(event.clipboardData.files);
      } else {
        const text = event.clipboardData.getData("text/plain");
        if (text) {
          event.preventDefault();
          settings.current.open = false;
          setDraft({ text });
        }
      }
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, [p.upload, p.choose, historyOpen, draft]);
  const editText = async (transfer) => {
    if (opening) return;
    setOpening(true);
    setEditorError("");
    try {
      const text = await p.readText(transfer);
      setDraft({
        text,
        id: transfer.id,
        revision: transfer.revision,
        filename: transfer.files[0].name,
      });
    } catch (error) {
      setEditorError(error.message);
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
    } catch {
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
  ];
  const durationIndex = durations.findIndex(([value]) => value === p.ttl),
    duration = durations[durationIndex];
  const latest = p.history.find((t) => t.id === p.selected);
  const busyAppend = latest?.appendState && latest.appendState !== "failed";
  const completed =
    !p.upload &&
    !busyAppend &&
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
        e.preventDefault();
        if (!p.upload) p.setDrag(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) p.setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        p.setDrag(false);
        if (!p.upload) p.choose(e.dataTransfer.files);
      }}
      className={p.drag ? "owner dragging" : "owner"}
    >
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
            className="icon-button"
            aria-label="Сгенерировать и скопировать пароль"
            title={
              passwordState === "removed"
                ? "Пароль убран"
                : passwordState === "copied"
                  ? "Пароль скопирован"
                  : passwordState === "failed"
                    ? "Не удалось скопировать. Повторить"
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
            <Icon name={p.secret ? "lock" : "unlock"} />
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
          {p.upload ? (
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
                  title={p.paused ? "Продолжить" : "Пауза"}
                  onClick={() => (p.paused ? p.run(p.upload) : p.pause())}
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
                url={latest.url}
                onAdd={() => {
                  appendTarget.current = latest.id;
                  input.current.click();
                }}
                onDelete={() => p.remove(latest.id)}
                onEdit={
                  latest.preview && !opening
                    ? () => editText(latest)
                    : undefined
                }
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
          {completed && (
            <AnimatedDetails
              className="transfer-details owner-details"
              label="Подробности передачи"
              summary={<Icon name="chevron" />}
            >
              <div className="transfer-information">
                <FileList
                  files={latest.files}
                  onPreview={(index) => setViewing({ record: latest, index })}
                />
                <p className="muted">{bytes(latest.size)}</p>
                <p className="muted">
                  {latest.expires === null ? "∞" : date(latest.expires)}
                </p>
              </div>
            </AnimatedDetails>
          )}
          {(p.error || latest?.appendError || editorError) && (
            <p role="alert">{p.error || latest?.appendError || editorError}</p>
          )}
        </div>
      </section>
      {completed && <Expiry value={latest.expires} />}
      {viewing && (
        <Suspense fallback={null}>
          <TextViewer
            token=""
            shareUrl={viewing.record.url}
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
        </Suspense>
      )}

      {historyOpen && (
        <History
          items={p.history}
          onClose={() => setHistoryOpen(false)}
          onDelete={p.remove}
          onRemoveFiles={p.removeFiles}
          onRemoveHistory={p.removeHistory}
          onEdit={editText}
          onAdd={(id) => {
            appendTarget.current = id;
            input.current.click();
          }}
        />
      )}
    </main>
  );
}
