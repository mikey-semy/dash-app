import { IconButton } from "./components/IconButton.jsx";
import { copy } from "../shared/copy.js";
import React, { useState } from "react";
import QRButton from "./QRButton.jsx";
import { CopyButton, Icon } from "./Icons.jsx";
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
