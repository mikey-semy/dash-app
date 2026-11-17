import { Modal } from "#src/shared/ui/Modal.jsx";
import { IconButton } from "#src/shared/ui/IconButton.jsx";
import { copy } from "#common/copy.js";
import { ErrorNotice } from "#src/shared/ui/Errors.jsx";
import { useEffect, useRef, useState } from "react";
import { Icon } from "#src/shared/ui/Icons.jsx";
import { scanFolders, folderFiles } from "../model/folders.js";
export default function FolderUpload({ source, onClose, onSend }) {
  const alive = useRef(true);
  const [plan, setPlan] = useState(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [, render] = useState(0);
  useEffect(() => {
    alive.current = true;
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
    };
  }, []);
  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const files = folderFiles(plan);
      if (!alive.current) return;
      if (!files.length) throw new Error(copy.noFilesToUpload);
      if ((await onSend(files)) !== false) onClose();
      else setError(copy.uploadStartFailed);
    } catch (e) {
      if (alive.current) setError(e.message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <Modal
      className="history-dialog folder-dialog"
      aria-label={copy.folders}
      onClose={onClose}
    >
      {({ close }) => (
        <>
          <header className="dialog-header">
            <Icon name="archive" />
            <div className="text-actions">
              <IconButton
                aria-label={copy.uploadFolders}
                disabled={busy || !plan}
                onClick={send}
              >
                <Icon name="upload" />
              </IconButton>
              <IconButton aria-label={copy.closeFolders} onClick={close}>
                <Icon name="cancel" />
              </IconButton>
            </div>
          </header>
          <div className="dialog-body">
            {busy && (
              <p role="status" aria-label={copy.preparingFolders}>
                <Icon name="archive" />
              </p>
            )}
            {error && <ErrorNotice error={error} />}
            {plan && (
              <>
                <p className="muted">
                  {plan.files.filter((item) => !item.directory).length +
                    plan.loose.length}{" "}
                  {copy.filesUnit}
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
                    <summary>
                      {copy.excludedPrefix}
                      {plan.excluded.length}
                    </summary>
                    <ul className="folder-files">
                      {plan.excluded.map((item) => (
                        <li key={item.path}>
                          <span>
                            {item.path}
                            {item.entry.isDirectory ? "/" : ""}
                          </span>
                          <IconButton
                            aria-label={copy.restorePrefix + item.path}
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
                          </IconButton>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
