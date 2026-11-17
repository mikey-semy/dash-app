import { IconButton } from "./IconButton.jsx";
import { UI, TIMING } from "#common/config.js";
import { copy } from "#common/copy.js";
import { useState, useEffect, useRef } from "react";
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
