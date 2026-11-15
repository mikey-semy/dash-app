import React, { useEffect, useRef, useState } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  lineNumbers,
  highlightSpecialChars,
  drawSelection,
  keymap,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { tags } from "@lezer/highlight";
const colors = HighlightStyle.define([
  { tag: [tags.keyword, tags.operator], color: "#cf222e" },
  { tag: [tags.string, tags.regexp], color: "#0a3069" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "#0550ae" },
  { tag: [tags.comment, tags.meta], color: "#6e7781" },
  {
    tag: [tags.function(tags.variableName), tags.definition(tags.variableName)],
    color: "#8250df",
  },
  { tag: [tags.typeName, tags.className], color: "#953800" },
  { tag: [tags.tagName, tags.attributeName], color: "#116329" },
]);
function useDetection(text, filename) {
  const [result, setResult] = useState({ name: null, label: "?" });
  useEffect(() => {
    let worker,
      deadline,
      active = true;
    const timer = setTimeout(() => {
      try {
        worker = new Worker(new URL("./detect.worker.js", import.meta.url), {
          type: "module",
        });
      } catch {
        setResult({ name: null, label: "?" });
        return;
      }
      const fallback = () => {
        if (active) setResult({ name: null, label: "?" });
        worker.terminate();
      };
      deadline = setTimeout(fallback, 15000);
      worker.onerror = fallback;
      worker.onmessage = ({ data }) => {
        if (!active) return;
        clearTimeout(deadline);
        if (data.ready) {
          worker.postMessage({ text, filename });
          deadline = setTimeout(fallback, 2000);
        } else {
          setResult(data);
          worker.terminate();
        }
      };
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(deadline);
      worker?.terminate();
    };
  }, [text, filename]);
  return result;
}
export default function CodeEditor({
  value,
  onChange,
  readOnly = false,
  filename = "",
  onLanguage,
}) {
  const host = useRef(),
    view = useRef(),
    callback = useRef(onChange),
    compartment = useRef(new Compartment());
  callback.current = onChange;
  const result = useDetection(value, filename);
  useEffect(() => {
    onLanguage?.(result.label);
  }, [result.label, onLanguage]);
  useEffect(() => {
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          EditorView.cspNonce.of(
            document.querySelector('meta[name="csp-nonce"]')?.content || "",
          ),
          EditorState.lineSeparator.of(value.includes("\r\n") ? "\r\n" : "\n"),
          EditorState.tabSize.of(4),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of({
            "aria-label": readOnly ? "Текст передачи" : "Текст или код",
            ...(readOnly ? { tabindex: "0" } : {}),
          }),
          lineNumbers(),
          highlightSpecialChars(),
          drawSelection(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          syntaxHighlighting(colors),
          compartment.current.of([]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callback.current?.(update.state.sliceDoc());
          }),
        ],
      }),
    });
    view.current = editor;
    if (!readOnly)
      requestAnimationFrame(() => {
        if (view.current === editor) editor.focus();
      });
    return () => {
      view.current = null;
      editor.destroy();
    };
  }, [readOnly]);
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.sliceDoc() !== value)
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: value },
      });
  }, [value]);
  useEffect(() => {
    let cancelled = false;
    const editor = view.current,
      language = languages.find((l) => l.name === result.name);
    if (!language) {
      editor?.dispatch({ effects: compartment.current.reconfigure([]) });
      return;
    }
    language
      .load()
      .then((extension) => {
        if (!cancelled && view.current === editor)
          editor.dispatch({
            effects: compartment.current.reconfigure(extension),
          });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [result.name]);
  return (
    <div className="code-editor" ref={host} data-language={result.label} />
  );
}
