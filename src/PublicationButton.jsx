import React, { useState } from "react";
import { Icon } from "./Icons.jsx";
import { ErrorNotice } from "./Errors.jsx";
export default function PublicationButton({
  published,
  onToggle,
  disabled = false,
  className = "",
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        className={"icon-button publication-status " + className}
        aria-label={published ? "Остановить публикацию" : "Опубликовать сайт"}
        title={
          published
            ? "Опубликовано — остановить"
            : "Не опубликовано — опубликовать"
        }
        aria-pressed={!!published}
        disabled={busy || disabled || !onToggle}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await onToggle(!published);
          } catch (error) {
            setError(error.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="publication-current">
          <Icon name={published ? "globe" : "pause"} />
        </span>
        <span className="publication-action">
          <Icon name={published ? "pause" : "globe"} />
        </span>
      </button>
      {error && <ErrorNotice error={error} />}
    </>
  );
}
