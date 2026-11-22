import { Modal } from "#src/shared/ui/Modal.jsx";
import { IconButton } from "#src/shared/ui/IconButton.jsx";
import { copy } from "#common/copy.js";
import { ErrorNotice } from "#src/shared/ui/Errors.jsx";
import { lazy, Suspense, useState } from "react";
import { Icon } from "#src/shared/ui/Icons.jsx";
const CodeEditor = lazy(
  () => import("#src/shared/ui/code-editor/CodeEditor.jsx"),
);
import { TEXT_LIMIT } from "#common/config.js";
export { TEXT_LIMIT };
export default function TextComposer({
  initial = "",
  filename,
  editing = false,
  onClose,
  onSend,
}) {
  const [text, setText] = useState(initial),
    [language, setLanguage] = useState("?"),
    [error, setError] = useState(""),
    [sending, setSending] = useState(false);
  const send = async () => {
    const file = new File([text], filename || textName(), {
      type: "text/plain;charset=utf-8",
    });
    if (file.size > TEXT_LIMIT) {
      setError(copy.textIsLimitedTo5Mib);
      return;
    }
    setSending(true);
    setError("");
    try {
      const sent = await onSend([file]);
      if (sent !== false) onClose();
      else
        setError(
          editing ? copy.couldNotSaveTryAgain : copy.couldNotSendTryAgain,
        );
    } catch (error) {
      setError(error.message || copy.couldNotSendTryAgain);
    } finally {
      setSending(false);
    }
  };
  return (
    <Modal
      className="text-dialog"
      aria-label={editing ? copy.editText : copy.textTransfer}
      onClose={onClose}
      closeDisabled={sending}
      title={copy.text}
      onKeyDownCapture={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          if (!sending && (editing || text.length)) send();
        }
      }}
    >
      {({ close }) => (
        <>
          <header className="dialog-header">
            <span className="editor-context">
              <Icon name={editing ? "edit" : "code"} />
              {editing && <span className="language-label">{filename}</span>}
            </span>
            <div className="text-actions">
              <span className="language-label">{language}</span>
              <IconButton
                aria-label={editing ? copy.saveText : copy.sendText}
                title={editing ? copy.save : copy.send}
                disabled={sending || (!editing && !text.length)}
                onClick={send}
              >
                <Icon name={editing ? "save" : "upload"} />
              </IconButton>
              <IconButton
                aria-label={copy.closeEditor}
                title={copy.close}
                disabled={sending}
                onClick={close}
              >
                <Icon name="cancel" />
              </IconButton>
            </div>
          </header>
          <div className="text-dialog-body">
            <Suspense
              fallback={
                <div
                  className="archive-status"
                  role="status"
                  aria-label={copy.loadingEditor}
                >
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
          {error && <ErrorNotice error={error} />}
        </>
      )}
    </Modal>
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
