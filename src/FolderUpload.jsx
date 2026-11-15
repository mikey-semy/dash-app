import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons.jsx";
import { scanFolders, folderZip } from "./folders.js";
export default function FolderUpload({ source, onClose, onSend }) {
  const ref = useRef(),
    alive = useRef(true);
  const [plan, setPlan] = useState(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [, render] = useState(0);
  useEffect(() => {
    ref.current.showModal();
    scanFolders(source)
      .then((value) => {
        if (alive.current) setPlan(value);
      })
      .catch((e) => {
        if (alive.current) setError(e.message);
      })
      .finally(() => {
        if (alive.current) setBusy(false);
      });
    return () => {
      alive.current = false;
      ref.current?.close();
    };
  }, []);
  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const files = [...plan.loose];
      for (const root of plan.roots) {
        const entries = plan.files.filter((item) => item.root === root);
        if (entries.length)
          files.push(await folderZip(root.name, entries, () => !alive.current));
      }
      if (!alive.current) return;
      if (!files.length) throw new Error("Нет файлов для загрузки");
      if ((await onSend(files)) !== false) onClose();
      else setError("Не удалось начать загрузку. Проверьте лимит и повторите.");
    } catch (e) {
      if (alive.current) setError(e.message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <dialog
      ref={ref}
      className="history-dialog folder-dialog"
      aria-label="Папки"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="dialog-header">
        <Icon name="archive" />
        <div className="text-actions">
          <button
            type="button"
            className="icon-button"
            aria-label="Загрузить папки"
            disabled={busy || !plan}
            onClick={send}
          >
            <Icon name="upload" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Закрыть папки"
            onClick={onClose}
          >
            <Icon name="cancel" />
          </button>
        </div>
      </header>
      <div className="dialog-body">
        {busy && (
          <p role="status" aria-label="Подготовка папок">
            <Icon name="archive" />
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        {plan && (
          <>
            <p className="muted">
              {plan.files.filter((item) => !item.directory).length +
                plan.loose.length}{" "}
              файлов
            </p>
            <ul className="folder-files">
              {[
                ...plan.files,
                ...plan.loose.map((file) => ({ path: file.name })),
              ].map((item, i) => (
                <li key={i}>{item.path}</li>
              ))}
            </ul>
            {plan.excluded.length > 0 && (
              <details>
                <summary>Исключено: {plan.excluded.length}</summary>
                <ul className="folder-files">
                  {plan.excluded.map((item) => (
                    <li key={item.path}>
                      <span>
                        {item.path}
                        {item.entry.isDirectory ? "/" : ""}
                      </span>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={"Вернуть " + item.path}
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setError("");
                          try {
                            await plan.restore(item);
                            render((n) => n + 1);
                          } catch (e) {
                            setError(e.message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <Icon name="add" />
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}
