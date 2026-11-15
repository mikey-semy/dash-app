import React, { useState, useEffect, useRef } from "react";
export function Icon({ name }) {
  const paths = {
    code: <path d="m8 5-6 7 6 7m8-14 6 7-6 7M14 3l-4 18" />,
    archive: (
      <>
        <path d="M5 3h14v18H5zM12 3v3m0 2v2m0 2v2" />
        <rect x="10" y="16" width="4" height="3" rx="1" />
      </>
    ),
    share: (
      <>
        <path d="M12 16V3m-4 4 4-4 4 4M5 12v9h14v-9" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="1" />
        <path d="M16 8V3H3v13h5" />
      </>
    ),
    warning: (
      <>
        <path d="m12 3 10 18H2Z" />
        <path d="M12 9v5m0 3v.1" />
      </>
    ),
    check: <path d="m4 12 5 5L20 6" />,
    lock: (
      <>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4M12 15v2" />
      </>
    ),
    unlock: (
      <>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 7.5-2M12 15v2" />
      </>
    ),
    history: (
      <>
        <path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v6l4 2" />
      </>
    ),
    logout: (
      <>
        <path d="M9 3H3v18h6M9 12h12m-5-5 5 5-5 5" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    hidden: (
      <>
        <path d="m3 3 18 18M9.5 5.3A11 11 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.2 4M6 6.5A22 22 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 4-.8M10 10a3 3 0 0 0 4 4" />
      </>
    ),
    enter: <path d="M3 12h17m-6-6 6 6-6 6" />,
    delete: (
      <>
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
      </>
    ),
    qr: (
      <>
        <path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h3v3h-6zM12 3v3M3 12h3m6-3v6m0 6v-3m6-6h3" />
      </>
    ),
    chevron: <path d="m7 10 5 5 5-5" />,
    add: <path d="M12 4v16M4 12h16" />,
    pause: <path d="M8 5v14M16 5v14" />,
    play: <path d="m8 4 12 8-12 8Z" />,
    cancel: <path d="m6 6 12 12M18 6 6 18" />,
    question: <path d="M8 7a4 4 0 0 1 8 0c0 3-4 3-4 6m0 5v.1" />,
    upload: <path d="M12 20V4m-6 6 6-6 6 6" />,
    download: <path d="M12 4v16m-6-6 6 6 6-6" />,
  };
  return (
    <svg
      key={name}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export function CopyButton({ value, label = "Копировать ссылку" }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (copied) {
      const id = setTimeout(() => setCopied(false), 1500);
      return () => clearTimeout(id);
    }
  }, [copied]);
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={copied ? "Скопировано" : label}
      disabled={!value}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
    >
      <Icon name={copied ? "check" : "copy"} />
      <span className="sr-only" role="status">
        {copied ? "Скопировано" : ""}
      </span>
    </button>
  );
}
export function DeleteButton({
  onDelete,
  onPrepare,
  disabled,
  label = "Удалить",
  confirmationKey = "",
}) {
  const [armed, setArmed] = useState(false),
    [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    setArmed(false);
  }, [disabled, label, confirmationKey]);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  const text = armed ? "Подтвердить удаление" : label;
  return (
    <button
      type="button"
      className="icon-button"
      disabled={disabled || busy}
      aria-label={text}
      title={text}
      data-confirming={armed}
      onBlur={() => setArmed(false)}
      onClick={async () => {
        if (pending.current) return;
        onPrepare?.();
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        setBusy(true);
        pending.current = true;
        try {
          await onDelete?.();
        } finally {
          pending.current = false;
          setBusy(false);
        }
      }}
    >
      <Icon name={armed ? "question" : "delete"} />
    </button>
  );
}
export function Expiry({ value, className = "expiry-corner" }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (value === null || value === undefined) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [value]);
  if (value === null)
    return (
      <span className={className} title="Бессрочно" aria-label="Бессрочно">
        ∞
      </span>
    );
  if (!Number.isFinite(value)) return null;
  const seconds = Math.max(0, Math.ceil((value - now) / 1000));
  const hours = Math.floor(seconds / 3600),
    minutes = Math.floor((seconds % 3600) / 60),
    rest = seconds % 60;
  const text = [hours, minutes, rest]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  return (
    <time
      className={className}
      dateTime={new Date(value).toISOString()}
      title={new Date(value).toLocaleString("ru-RU")}
      aria-label={"Осталось: " + text}
    >
      {text}
    </time>
  );
}
