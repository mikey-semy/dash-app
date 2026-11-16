import { IconButton } from "./components/IconButton.jsx";
import { copy } from "../shared/copy.js";
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
      <IconButton
        className={"icon-button publication-status " + className}
        aria-label={published ? copy.unpublishSite : copy.publishSite}
        title={published ? copy.publishedUnpublish : copy.unpublishedPublish}
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
      </IconButton>
      {error && <ErrorNotice error={error} />}
    </>
  );
}
