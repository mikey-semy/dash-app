import { useEffect, useState } from "react";
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
  useEffect(() => {
    const paste = (event) => {
      if (event.clipboardData?.files.length) {
        event.preventDefault();
        event.stopPropagation();
        if (
          upload ||
          preparingUpload ||
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
          setSelected(current.id);
        }
        receiveFiles(event.clipboardData, current?.url ? current.id : null);
        return;
      }
      if (
        event.defaultPrevented ||
        upload ||
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
          onText(text);
        }
      }
    };
    document.addEventListener("paste", paste, true);
    return () => document.removeEventListener("paste", paste, true);
  }, [
    upload,
    preparingUpload,
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
  ]);

  return {
    dropZone,
    dropHandlers: {
      onDragOver: (e) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        if (
          !upload &&
          !preparingUpload &&
          !preparing &&
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
          setViewing(null);
          setHistoryOpen(false);
          setSelected(current.id);
          receiveFiles(e.dataTransfer, current.id);
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
          setViewing(null);
          setHistoryOpen(false);
          setSelected(current.id);
          receiveFiles(e.dataTransfer, current.id);
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
            e.dataTransfer,
            completed && e.clientY >= innerHeight / 2 ? latest.id : null,
          );
      },
    },
  };
}
