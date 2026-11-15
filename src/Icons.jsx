import React, { useState, useEffect } from "react";
export function Icon({ name }) {
  const paths = {
    copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="1" />
        <path d="M16 8V3H3v13h5" />
      </>
    ),
    check: <path d="m4 12 5 5L20 6" />,
    generate: (
      <>
        <path d="m4 20 12-12 4 4L8 24M14 2v4M20 3l-2 3M22 8h-4M6 4v4M4 6h4" />
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
  };
  return (
    <svg
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
  return (
    <time className="expiry-corner" dateTime={new Date(value).toISOString()}>
      {new Date(value).toLocaleString("ru-RU")}
    </time>
  );
}
