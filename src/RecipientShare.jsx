import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Disclosure } from "./Disclosure.jsx";
import { CopyButton, Icon } from "./Icons.jsx";

export function RecipientShare({ url }) {
  const [qr, setQr] = useState(""),
    [open, setOpen] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(url, {
      margin: 1,
      width: 144,
      color: { dark: "#111111", light: "#ffffff" },
    })
      .then((value) => {
        if (active) setQr(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [url]);
  return (
    <div className="recipient-share">
      <div className="recipient-share-actions">
        <CopyButton value={url} />
        <button
          type="button"
          className="icon-button"
          aria-label="QR-код"
          title="QR-код"
          disabled={!qr}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Icon name="qr" />
        </button>
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
      <Disclosure open={open}>
        {qr && (
          <img
            className="recipient-qr"
            src={qr}
            alt="QR-код ссылки"
            width="144"
            height="144"
          />
        )}
      </Disclosure>
    </div>
  );
}
