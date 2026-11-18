import { IconButton } from "./IconButton.jsx";
import { copy } from "#common/copy.js";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./Icons.jsx";
import { highlightedParts } from "./HighlightedText.jsx";
export default function EditableName({
  value,
  label,
  onSave,
  onGenerate,
  disabled = false,
  className = "",
  highlight,
}) {
  const ref = useRef(),
    active = useRef(false),
    latest = useRef(value),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false),
    [failed, setFailed] = useState(false),
    pending = useRef(false),
    session = useRef(0);
  useEffect(() => {
    if (failed) {
      const timer = setTimeout(() => setFailed(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [failed]);
  latest.current = value;
  useLayoutEffect(() => {
    if (editing || !ref.current) return;
    ref.current.replaceChildren(
      ...highlightedParts(value, highlight).map(({ text, match }) => {
        if (!match) return text;
        const mark = document.createElement("mark");
        mark.className = "search-match";
        mark.textContent = text;
        return mark;
      }),
    );
  }, [value, highlight, editing, !!onGenerate]);
  useLayoutEffect(() => {
    if (editing) {
      ref.current.textContent = latest.current;
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
    session.current++;
    setEditing(true);
  };
  const cancel = () => {
    active.current = false;
    session.current++;
    ref.current.textContent = latest.current;
    setEditing(false);
    ref.current.blur();
  };
  const commit = async () => {
    if (!active.current) return;
    active.current = false;
    session.current++;
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
  const field = (
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
      onBlur={onGenerate ? undefined : commit}
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
  if (!onGenerate) return field;
  return (
    <span
      className="editable-name-group"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && editing) {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
      }}
    >
      {field}
      {editing && (
        <IconButton
          className={
            "icon-button name-generator" + (failed ? " edit-error" : "")
          }
          aria-label={copy.generateName}
          title={copy.generateName}
          aria-busy={generating}
          disabled={busy || disabled}
          onPointerDown={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
          onClick={async (event) => {
            event.stopPropagation();
            if (pending.current || busy || disabled) return;
            pending.current = true;
            setGenerating(true);
            setFailed(false);
            const version = session.current,
              before = ref.current.textContent;
            try {
              const next = await onGenerate(before);
              if (
                active.current &&
                session.current === version &&
                ref.current.textContent === before
              ) {
                ref.current.textContent = next;
              }
            } catch (error) {
              console.error("[DU] title generator", error);
              setFailed(true);
            } finally {
              pending.current = false;
              setGenerating(false);
            }
          }}
        >
          <Icon name={failed ? "cancel" : "reload"} />
        </IconButton>
      )}
    </span>
  );
}
