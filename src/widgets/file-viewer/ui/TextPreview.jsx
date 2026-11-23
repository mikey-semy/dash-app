import { IconButton } from "#src/shared/ui/IconButton.jsx";
import { copy } from "#common/copy.js";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import QRButton from "#src/shared/ui/QRButton.jsx";
import { CopyButton, Icon } from "#src/shared/ui/Icons.jsx";
const CodeEditor = lazy(
  () => import("#src/shared/ui/code-editor/CodeEditor.jsx"),
);
const MarkdownPreview = lazy(
  () => import("#src/shared/ui/markdown/MarkdownPreview.jsx"),
);
const markdownFile = (name) => /\.(?:md|markdown|mkd)$/i.test(name || "");
export default function TextPreview({
  token,
  info,
  onUnavailable,
  onUnsupported,
  onClose,
  index,
  rawPath: rawOverride,
  downloadPath: downloadOverride,
  onEdit,
  shareUrl,
  bare = false,
}) {
  const rawPath =
    rawOverride || "/raw/" + token + (index === undefined ? "" : "/" + index);
  const downloadPath =
    downloadOverride ||
    (index === undefined
      ? "/public/" + token + "/download"
      : "/public/" + token + "/files/" + index + "/download");
  const [source, setSource] = useState(null),
    [language, setLanguage] = useState(
      markdownFile(info.name) ? "Markdown" : "?",
    ),
    [preview, setPreview] = useState(markdownFile(info.name));
  const automatic = useRef(true);
  useEffect(() => {
    const known = markdownFile(info.name);
    setPreview(known);
    setLanguage(known ? "Markdown" : "?");
    automatic.current = !known;
  }, [token, info.etag, info.name, index, rawOverride]);
  useEffect(() => {
    if (automatic.current && language === "Markdown") {
      setPreview(true);
      automatic.current = false;
    }
  }, [language]);
  const markdown = markdownFile(info.name) || /^Markdown\??$/.test(language);
  useEffect(() => {
    const control = new AbortController();
    let active = true;
    setSource(null);
    fetch(rawPath, {
      signal: control.signal,
      headers: info.etag ? { "If-Match": info.etag } : {},
    })
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) {
          console.error("[app] text preview", response.status, rawPath);
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
  }, [token, info.etag, info.name, index, rawOverride]);
  if (source === false)
    return (
      <a
        className="primary-action"
        aria-label={copy.downloadAction}
        title={copy.download}
        href={downloadPath}
      >
        <Icon name="download" />
      </a>
    );
  return (
    <section className="text-preview" aria-label={copy.transferText}>
      {!bare && (
        <header className="text-preview-header">
          <span className="language-label">{language}</span>
          <div className="text-actions">
            <CopyButton value={source} label={copy.copyText} />
            <QRButton
              url={shareUrl || new URL(location.pathname, location.origin).href}
            />
            {onEdit && (
              <IconButton
                aria-label={copy.editText}
                title={copy.editText}
                onClick={onEdit}
              >
                <Icon name="edit" />
              </IconButton>
            )}
            <a
              className="raw-link"
              href={rawPath}
              target="_blank"
              rel="noopener noreferrer"
            >
              {copy.raw}
            </a>
            {markdown && (
              <IconButton
                aria-label={preview ? copy.showSource : copy.showPreview}
                title={preview ? copy.source : copy.preview}
                aria-pressed={preview}
                onClick={() => {
                  automatic.current = false;
                  setPreview(!preview);
                }}
              >
                <Icon name={preview ? "code" : "eye"} />
              </IconButton>
            )}
            <a
              className="icon-button"
              aria-label={copy.downloadAction}
              title={copy.download}
              href={downloadPath}
            >
              <Icon name="download" />
            </a>
            {onClose && (
              <IconButton
                aria-label={copy.closePreview}
                title={copy.close}
                onClick={onClose}
              >
                <Icon name="cancel" />
              </IconButton>
            )}
          </div>
        </header>
      )}
      <div className="text-preview-body">
        {source === null ? (
          <div
            className="archive-status"
            role="status"
            aria-label={copy.loadingText}
          >
            <Icon name="code" />
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="archive-status">
                <Icon name="code" />
              </div>
            }
          >
            {markdown && preview ? (
              <MarkdownPreview
                source={source}
                filename={info.name}
                files={info.files}
                token={
                  token ||
                  (shareUrl ? new URL(shareUrl).pathname.split("/").pop() : "")
                }
              />
            ) : (
              <CodeEditor
                value={source}
                filename={info.name}
                readOnly
                onLanguage={setLanguage}
              />
            )}
          </Suspense>
        )}
      </div>
    </section>
  );
}
