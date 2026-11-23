import { TIMING } from "#common/config.js";
import { copy } from "#common/copy.js";
import { useEffect, useRef, useState } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  lineNumbers,
  highlightSpecialChars,
  drawSelection,
  keymap,
  Decoration,
  ViewPlugin,
  highlightActiveLine,
  highlightActiveLineGutter,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { tags } from "@lezer/highlight";
const stripe = Decoration.line({ class: "cm-line-stripe" });
const lineStripes = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = this.build(view);
    }
    update(update) {
      if (update.docChanged || update.viewportChanged)
        this.decorations = this.build(update.view);
    }
    build(view) {
      const ranges = [];
      for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to;) {
          const line = view.state.doc.lineAt(pos);
          if (line.number % 2 === 0) ranges.push(stripe.range(line.from));
          pos = line.to + 1;
        }
      }
      return Decoration.set(ranges);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
const colors = HighlightStyle.define([
  { tag: [tags.keyword, tags.operator], color: "var(--color-syntax-keyword)" },
  { tag: [tags.string, tags.regexp], color: "var(--color-syntax-string)" },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom],
    color: "var(--color-syntax-number)",
  },
  { tag: [tags.comment, tags.meta], color: "var(--color-syntax-comment)" },
  {
    tag: [tags.function(tags.variableName), tags.definition(tags.variableName)],
    color: "var(--color-syntax-function)",
  },
  { tag: [tags.typeName, tags.className], color: "var(--color-syntax-type)" },
  { tag: [tags.tagName, tags.attributeName], color: "var(--color-syntax-tag)" },
]);
function useDetection(text, filename) {
  const [result, setResult] = useState({ name: null, label: "?" });
  useEffect(() => {
    setResult({ name: null, label: "?" });
    let worker,
      deadline,
      active = true;
    const timer = setTimeout(() => {
      try {
        worker = new Worker(
          new URL("../../lib/code/detect.worker.js", import.meta.url),
          {
            type: "module",
          },
        );
      } catch {
        setResult({ name: null, label: "?" });
        return;
      }
      const fallback = () => {
        if (active) setResult({ name: null, label: "?" });
        worker.terminate();
      };
      deadline = setTimeout(fallback, TIMING.workerStartup);
      worker.onerror = (event) => {
        event.preventDefault();
        fallback();
      };
      worker.onmessage = ({ data }) => {
        if (!active) return;
        clearTimeout(deadline);
        if (data.ready) {
          worker.postMessage({ text, filename });
          deadline = setTimeout(fallback, TIMING.detectionTimeout);
        } else {
          setResult(data);
          worker.terminate();
        }
      };
    }, TIMING.detectionDebounce);
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
            "aria-label": readOnly ? copy.transferText : copy.textOrCode,
            ...(readOnly ? { tabindex: "0" } : {}),
          }),
          lineNumbers(),
          lineStripes,
          ...(readOnly
            ? []
            : [highlightActiveLine(), highlightActiveLineGutter()]),
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
