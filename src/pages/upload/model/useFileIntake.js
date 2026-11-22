import { useEffect, useState } from "react";
import { captureFiles } from "#src/features/upload-files/index.js";
export function useFileIntake({
  upload,
  preparingUpload,
  preparing,
  completed,
  latest,
  historyOpen,
  draft,
  folders,
  config,
  viewing,
  setViewing,
  setHistoryOpen,
  setSelected,
  setDrag,
  receiveFiles,
  onText,
}) {
  const [dropZone, setDropZone] = useState("new");
  const [pendingPaste, setPendingPaste] = useState(null);
  const canAppendPaste = !!completed && pendingPaste?.parentId === latest.id;
  useEffect(() => {
    const paste = (event) => {
      const data = event.clipboardData;
      if (!data) return;
      if (data.files.length) {
        event.preventDefault();
        event.stopPropagation();
        if (
          upload ||
          preparingUpload ||
          pendingPaste ||
          draft !== null ||
          folders !== null ||
          config ||
          (historyOpen && !viewing)
        )
          return;
        const source = captureFiles(data);
        if (viewing) {
          const current = viewing.record;
          setViewing(null, { replace: true });
          setHistoryOpen(false);
          setSelected(current.id);
          receiveFiles(source, current.id);
        } else if (completed) {
          setDrag(false);
          setPendingPaste({ source, parentId: latest.id });
        } else {
          receiveFiles(source, latest?.url ? latest.id : null);
        }
        return;
      }
      if (
        event.defaultPrevented ||
        upload ||
        preparingUpload ||
        preparing ||
        pendingPaste ||
        historyOpen ||
        viewing ||
        config ||
        draft !== null ||
        folders !== null ||
        (event.target instanceof Element &&
          event.target.closest("input,textarea,[contenteditable=true]"))
      )
        return;
      const text = data.getData("text/plain");
      if (text) {
        event.preventDefault();
        if (completed) {
          setDrag(false);
          setPendingPaste({ text, parentId: latest.id });
        } else onText(text);
      }
    };
    document.addEventListener("paste", paste, true);
    return () => document.removeEventListener("paste", paste, true);
  }, [
    upload,
    preparingUpload,
    preparing,
    pendingPaste,
    completed,
    historyOpen,
    draft,
    folders,
    config,
    viewing,
    latest,
    receiveFiles,
    onText,
    setSelected,
    setViewing,
    setHistoryOpen,
    setDrag,
  ]);

  return {
    dropZone,
    pendingPaste,
    canAppendPaste,
    cancelPaste: () => setPendingPaste(null),
    choosePaste: (append) => {
      if (!pendingPaste || (append && !canAppendPaste)) return;
      const parentId = append ? pendingPaste.parentId : null;
      setPendingPaste(null);
      if (pendingPaste.source) receiveFiles(pendingPaste.source, parentId);
      else onText(pendingPaste.text, parentId);
    },
    dropHandlers: {
      onDragOver: (e) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        if (
          !upload &&
          !preparingUpload &&
          !preparing &&
          !pendingPaste &&
          !folders &&
          !historyOpen &&
          !viewing &&
          !config &&
          !draft
        ) {
          setDrag(true);
          setDropZone(
            completed && e.clientY >= innerHeight / 2 ? "append" : "new",
          );
        }
      },
      onDragLeave: (e) => {
        if (
          !e.currentTarget.contains(e.relatedTarget) &&
          (e.clientX <= 0 ||
            e.clientY <= 0 ||
            e.clientX >= innerWidth ||
            e.clientY >= innerHeight)
        )
          setDrag(false);
      },
      onDropCapture: (e) => {
        if (
          !e.dataTransfer.files.length &&
          !Array.from(e.dataTransfer.types || []).includes("Files")
        )
          return;
        if (
          draft ||
          pendingPaste ||
          folders ||
          config ||
          (historyOpen && !viewing) ||
          upload ||
          preparingUpload
        ) {
          e.preventDefault();
          e.stopPropagation();
          setDrag(false);
        } else if (viewing) {
          e.preventDefault();
          e.stopPropagation();
          setDrag(false);
          const current = viewing.record;
          setViewing(null, { replace: true });
          setHistoryOpen(false);
          setSelected(current.id);
          receiveFiles(captureFiles(e.dataTransfer), current.id);
        }
      },
      onDrop: (e) => {
        e.preventDefault();
        setDrag(false);
        if (
          viewing &&
          !upload &&
          !preparingUpload &&
          !draft &&
          !folders &&
          !config
        ) {
          const current = viewing.record;
          setViewing(null, { replace: true });
          setHistoryOpen(false);
          setSelected(current.id);
          receiveFiles(captureFiles(e.dataTransfer), current.id);
          return;
        }
        if (
          e.target instanceof Element &&
          e.target.closest("[contenteditable=true]")
        )
          return;
        if (
          !upload &&
          !preparingUpload &&
          !preparing &&
          !folders &&
          !historyOpen &&
          !config &&
          !draft
        )
          receiveFiles(
            captureFiles(e.dataTransfer),
            completed && e.clientY >= innerHeight / 2 ? latest.id : null,
          );
      },
    },
  };
}
