import { IconButton } from "./components/IconButton.jsx";
import { date } from "./lib/format.js";
import { UI, TIMING } from "../shared/config.js";
import { copy } from "../shared/copy.js";
import React, { useState, useEffect, useRef } from "react";
import {
  Presentation,
  Globe,
  Route,
  RotateCw,
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
  globe: Globe,
  route: Route,
  reload: RotateCw,
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
export function Icon({ name, size = UI.iconSize }) {
  const Glyph = glyphs[name] || CircleHelp;
  return (
    <Glyph
      key={name}
      size={size}
      strokeWidth={UI.iconStroke}
      aria-hidden="true"
    />
  );
}
export function CopyButton({ value, label = copy.copyLink }) {
  const [copied, setCopied] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    if (copied || failed) {
      const id = setTimeout(() => {
        setCopied(false);
        setFailed(false);
      }, TIMING.feedback);
      return () => clearTimeout(id);
    }
  }, [copied, failed]);
  return (
    <IconButton
      className={failed ? "icon-button edit-error" : "icon-button"}
      aria-label={label}
      title={failed ? undefined : copied ? copy.copied : label}
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
        {copied ? copy.copied : ""}
      </span>
    </IconButton>
  );
}
export function DeleteButton({
  onDelete,
  onPrepare,
  disabled,
  label = copy.delete,
  icon = "delete",
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
    const timer = setTimeout(() => setArmed(false), TIMING.confirmation);
    return () => clearTimeout(timer);
  }, [armed]);
  const text = armed ? copy.confirmDeletion : label;
  return (
    <IconButton
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
      <Icon name={armed ? "question" : icon} />
    </IconButton>
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
