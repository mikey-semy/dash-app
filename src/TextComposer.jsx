import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Icon } from "./Icons.jsx";
const CodeEditor = lazy(() => import("./CodeEditor.jsx"));
export const TEXT_LIMIT = 5 * 1024 * 1024;
export default function TextComposer({ initial = "", onClose, onSend }) {
  const ref = useRef(),
    [text, setText] = useState(initial),
    [language, setLanguage] = useState("?"),
    [error, setError] = useState(""),
    [sending, setSending] = useState(false);
  useEffect(() => {
    const previous = document.title;
    document.title = "Текст";
    ref.current.showModal();
    return () => {
      ref.current?.close();
      document.title = previous;
    };
  }, []);
  const send = async () => {
    const file = new File([text], textName(), {
      type: "text/plain;charset=utf-8",
    });
    if (file.size > TEXT_LIMIT) {
      setError("Максимум 5 МиБ текста");
      return;
    }
    setSending(true);
    setError("");
    try {
      const sent = await onSend([file]);
      if (sent !== false) onClose();
    } catch {
      setError("Не удалось отправить. Повторите.");
    } finally {
      setSending(false);
    }
  };
  return (
    <dialog
      ref={ref}
      className="text-dialog"
      aria-label="Текстовая передача"
      onCancel={(e) => {
        e.preventDefault();
        if (!sending) onClose();
      }}
      onKeyDownCapture={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          if (!sending && text.length) send();
        }
      }}
    >
      <header className="dialog-header">
        <Icon name="code" />
        <div className="text-actions">
          <span className="language-label">{language}</span>
          <button
            className="icon-button"
            type="button"
            aria-label="Отправить текст"
            title="Отправить"
            disabled={sending || !text.length}
            onClick={send}
          >
            <Icon name="upload" />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Закрыть редактор"
            title="Закрыть"
            disabled={sending}
            onClick={onClose}
          >
            <Icon name="cancel" />
          </button>
        </div>
      </header>
      <div className="text-dialog-body">
        <Suspense
          fallback={
            <div className="archive-status">
              <Icon name="code" />
            </div>
          }
        >
          <CodeEditor
            value={text}
            onChange={setText}
            onLanguage={setLanguage}
          />
        </Suspense>
      </div>
      {error && (
        <p className="text-error" role="alert">
          {error}
        </p>
      )}
    </dialog>
  );
}
function textName() {
  const now = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `text-${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}${String(now.getMilliseconds()).padStart(3, "0")}.txt`;
}
