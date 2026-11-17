import { IconButton } from "#src/shared/ui/IconButton.jsx";
import { copy } from "#common/copy.js";
import { useState } from "react";
import QRButton from "#src/shared/ui/QRButton.jsx";
import { CopyButton, Icon } from "#src/shared/ui/Icons.jsx";
export function RecipientShare({ url }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="recipient-share">
      <div className="recipient-share-actions">
        <CopyButton value={url} />
        <QRButton url={url} />
        {typeof navigator.share === "function" && (
          <IconButton
            aria-label={copy.share}
            title={failed ? copy.couldNotShare : copy.share}
            onClick={async () => {
              try {
                await navigator.share({ url });
                setFailed(false);
              } catch (error) {
                if (error.name !== "AbortError") setFailed(true);
              }
            }}
          >
            <Icon name={failed ? "warning" : "share"} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
