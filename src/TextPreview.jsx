import React, { lazy, Suspense, useEffect, useState } from "react";
import { CopyButton, Icon } from "./Icons.jsx";
const CodeEditor = lazy(() => import("./CodeEditor.jsx"));
export default function TextPreview({
  token,
  info,
  onUnavailable,
  onUnsupported,
}) {
  const [source, setSource] = useState(null),
    [language, setLanguage] = useState("?");
  useEffect(() => {
    const control = new AbortController();
    let active = true;
    setSource(null);
    fetch("/raw/" + token, {
      signal: control.signal,
      headers: info.etag ? { "If-Match": info.etag } : {},
    })
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) {
          if (response.status === 404) onUnavailable();
          else if (response.status === 412 || response.status === 401)
            onUnavailable(true);
          else if (active) {
            setSource(false);
            onUnsupported();
          }
          return;
        }
        const buffer = await response.arrayBuffer();
        if (active)
          setSource(
            new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
              buffer,
            ),
          );
      })
      .catch((error) => {
        if (error.name !== "AbortError" && active) {
          setSource(false);
          onUnsupported();
        }
      });
    return () => {
      active = false;
      control.abort();
    };
  }, [token, info.etag, info.name]);
  if (source === false)
    return (
      <a
        className="primary-action"
        aria-label="СКАЧАТЬ"
        title="Скачать"
        href={"/public/" + token + "/download"}
      >
        <Icon name="download" />
      </a>
    );
  return (
    <section className="text-preview" aria-label="Текст передачи">
      <header className="text-preview-header">
        <span className="language-label">{language}</span>
        <div className="text-actions">
          <CopyButton value={source} label="Копировать текст" />
          <a
            className="raw-link"
            href={"/raw/" + token}
            target="_blank"
            rel="noopener noreferrer"
          >
            Raw
          </a>
          <a
            className="icon-button"
            aria-label="СКАЧАТЬ"
            title="Скачать"
            href={"/public/" + token + "/download"}
          >
            <Icon name="download" />
          </a>
        </div>
      </header>
      <div className="text-preview-body">
        {source !== null && (
          <Suspense
            fallback={
              <div className="archive-status">
                <Icon name="code" />
              </div>
            }
          >
            <CodeEditor
              value={source}
              filename={info.name}
              readOnly
              onLanguage={setLanguage}
            />
          </Suspense>
        )}
      </div>
    </section>
  );
}
