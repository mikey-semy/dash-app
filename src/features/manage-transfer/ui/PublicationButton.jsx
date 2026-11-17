import { IconButton } from "#src/shared/ui/IconButton.jsx";
import { copy } from "#common/copy.js";
import { useState } from "react";
import { Icon } from "#src/shared/ui/Icons.jsx";
import { ErrorNotice } from "#src/shared/ui/Errors.jsx";
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
