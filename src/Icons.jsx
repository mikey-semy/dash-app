import React, { useState, useEffect } from "react";
export function Icon({ name }) {
  const paths = {
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
    generate: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <circle cx="8" cy="8" r=".8" />
        <circle cx="16" cy="8" r=".8" />
        <circle cx="12" cy="12" r=".8" />
        <circle cx="8" cy="16" r=".8" />
        <circle cx="16" cy="16" r=".8" />
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
export function Expiry({ value }) {
  if (value === null)
    return (
      <span className="expiry-corner" title="Бессрочно" aria-label="Бессрочно">
        ∞
      </span>
    );
  return (
    <time className="expiry-corner" dateTime={new Date(value).toISOString()}>
      {new Date(value).toLocaleString("ru-RU")}
    </time>
  );
}
