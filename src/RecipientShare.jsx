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
          <button
            type="button"
            className="icon-button"
            aria-label="Поделиться"
            title={failed ? "Не удалось поделиться" : "Поделиться"}
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
          </button>
        )}
      </div>
    </div>
  );
}
