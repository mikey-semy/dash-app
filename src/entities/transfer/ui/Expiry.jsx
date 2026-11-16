import React, { useState, useEffect } from "react";
import { copy } from "../../../../shared/copy.js";
import { date } from "../../../shared/lib/format.js";
export function Expiry({
  value,
  oneTime = false,
  className = "expiry-corner",
}) {
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
  if (oneTime)
    return (
      <span
        className={className}
        title={copy.oneTime}
        aria-label={copy.oneTime}
      >
        1
      </span>
    );
  if (value === null)
    return (
      <span
        className={className}
        title={copy.forever}
        aria-label={copy.forever}
      >
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
      title={date(value)}
      aria-label={copy.remainingPrefix + text}
    >
      {text}
    </time>
  );
}
