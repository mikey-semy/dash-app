import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { Icon } from "./Icons.jsx";
export default function QRButton({ url }) {
  const button = useRef(),
    popup = useRef(),
    [open, setOpen] = useState(false),
    [qr, setQr] = useState(""),
    [container, setContainer] = useState(null),
    [position, setPosition] = useState({ left: 8, top: 8, size: 170 });
  useEffect(() => {
    setOpen(false);
    setQr("");
  }, [url]);
  useEffect(() => {
    if (!open || !url) return;
    let active = true;
    QRCode.toDataURL(url, {
      margin: 1,
      width: 144,
      color: { dark: "#111111", light: "#ffffff" },
    })
      .then((value) => {
        if (active) setQr(value);
      })
      .catch(() => setOpen(false));
    return () => {
      active = false;
    };
  }, [open, url]);
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = button.current.getBoundingClientRect(),
        size = Math.min(170, innerWidth - 16, innerHeight - 16);
      setPosition({
        size,
        left: Math.max(
          8,
          Math.min(innerWidth - size - 8, rect.x + rect.width / 2 - size / 2),
        ),
        top: Math.max(
          8,
          rect.bottom + 8 + size <= innerHeight - 8
            ? rect.bottom + 8
            : rect.top - size - 8,
        ),
      });
    };
    const outside = (event) => {
      if (
        !button.current?.contains(event.target) &&
        !popup.current?.contains(event.target)
      )
        setOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
    };
    update();
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, true);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);
  return (
    <>
      <button
        ref={button}
        type="button"
        className="icon-button"
        aria-label="QR-код"
        title="QR-код"
        disabled={!url}
        aria-expanded={open}
        onClick={() => {
          setContainer(button.current.closest("dialog") || document.body);
          setOpen(!open);
        }}
      >
        <Icon name="qr" />
      </button>
      {open &&
        container &&
        createPortal(
          <div
            ref={popup}
            className="qr-popover qr-dropdown is-open"
            role="region"
            aria-label="QR-код ссылки"
            style={{
              left: position.left,
              top: position.top,
              width: position.size,
              height: position.size,
            }}
          >
            {qr ? (
              <img src={qr} alt="QR-код ссылки" width="144" height="144" />
            ) : (
              <Icon name="qr" />
            )}
          </div>,
          container,
        )}
    </>
  );
}
