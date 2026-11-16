import React, { useState, useEffect, useRef } from "react";
import {
  Presentation,
  ArrowLeft,
  Search,
  Clock,
  CodeXml,
  Pencil,
  Save,
  FileArchive,
  Share,
  Copy,
  TriangleAlert,
  Check,
  Lock,
  LockOpen,
  History,
  LogOut,
  Eye,
  EyeOff,
  ArrowRight,
  Trash2,
  QrCode,
  ChevronDown,
  Plus,
  Pause,
  Play,
  X,
  CircleHelp,
  ArrowUp,
  ArrowDown,
  Settings,
} from "lucide-react";
const glyphs = {
  presentation: Presentation,
  left: ArrowLeft,
  search: Search,
  clock: Clock,
  edit: Pencil,
  save: Save,
  code: CodeXml,
  archive: FileArchive,
  share: Share,
  copy: Copy,
  warning: TriangleAlert,
  check: Check,
  lock: Lock,
  unlock: LockOpen,
  history: History,
  logout: LogOut,
  eye: Eye,
  hidden: EyeOff,
  enter: ArrowRight,
  delete: Trash2,
  qr: QrCode,
  chevron: ChevronDown,
  add: Plus,
  pause: Pause,
  play: Play,
  cancel: X,
  question: CircleHelp,
  upload: ArrowUp,
  download: ArrowDown,
  settings: Settings,
};
export function Icon({ name, size = 18 }) {
  const Glyph = glyphs[name] || CircleHelp;
  return <Glyph key={name} size={size} strokeWidth={1.4} aria-hidden="true" />;
}
export function CopyButton({ value, label = "Копировать ссылку" }) {
  const [copied, setCopied] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    if (copied || failed) {
      const id = setTimeout(() => {
        setCopied(false);
        setFailed(false);
      }, 1500);
      return () => clearTimeout(id);
    }
  }, [copied, failed]);
  return (
    <button
      type="button"
      className={failed ? "icon-button edit-error" : "icon-button"}
      aria-label={label}
      title={failed ? undefined : copied ? "Скопировано" : label}
      disabled={!value}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setFailed(false);
        } catch (error) {
          console.error("[DU] clipboard", label, error);
          setFailed(true);
          setCopied(false);
        }
      }}
    >
      <Icon name={failed ? "cancel" : copied ? "check" : "copy"} />
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
      <span className={className} title="Одноразовая" aria-label="Одноразовая">
        1
      </span>
    );
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
