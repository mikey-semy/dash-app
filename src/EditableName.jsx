import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
export default function EditableName({
  value,
  label,
  onSave,
  disabled = false,
  className = "",
}) {
  const ref = useRef(),
    active = useRef(false),
    latest = useRef(value),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false);
  latest.current = value;
  useLayoutEffect(() => {
    if (!editing && ref.current) ref.current.textContent = value;
  }, [value, editing]);
  useLayoutEffect(() => {
    if (editing) {
      ref.current.focus({ preventScroll: true });
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }, [editing]);
  const start = () => {
    if (disabled || busy || active.current) return;
    active.current = true;
    setEditing(true);
  };
  const cancel = () => {
    active.current = false;
    ref.current.textContent = latest.current;
    setEditing(false);
    ref.current.blur();
  };
  const commit = async () => {
    if (!active.current) return;
    active.current = false;
    const next = ref.current.textContent.replace(/[\r\n]+/g, " ").trim();
    ref.current.blur();
    if (!next || next === latest.current) {
      ref.current.textContent = latest.current;
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onSave(next);
    } catch {
      if (ref.current) ref.current.textContent = latest.current;
    } finally {
      setBusy(false);
      setEditing(false);
    }
  };
  return (
    <span
      ref={ref}
      className={"editable-name " + className}
      role="textbox"
      aria-label={label}
      aria-readonly={!editing}
      aria-disabled={disabled || busy}
      aria-busy={busy}
      tabIndex={disabled ? -1 : 0}
      contentEditable={editing && !busy}
      suppressContentEditableWarning
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      onClick={(event) => {
        if (!editing) event.preventDefault();
        event.stopPropagation();
        start();
      }}
      onFocus={start}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          editing ? commit() : start();
        } else if (event.key === "Escape" && editing) {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
      }}
      onPaste={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const text = event.clipboardData
          .getData("text/plain")
          .replace(/[\r\n]+/g, " ");
        const selection = getSelection();
        if (!selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        if (!ref.current.contains(range.commonAncestorContainer)) return;
        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }}
    />
  );
}
