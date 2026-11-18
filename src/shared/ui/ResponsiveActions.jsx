import { Children, useEffect, useId, useRef, useState } from "react";
import { copy } from "#common/copy.js";
import { IconButton } from "./IconButton.jsx";
import { Icon } from "./Icons.jsx";

export function ResponsiveActions({
  children,
  className = "",
  label = copy.actions,
}) {
  const id = useId(),
    trigger = useRef(),
    popup = useRef();
  const [compact, setCompact] = useState(false),
    [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const place = () => {
    const rect = trigger.current.getBoundingClientRect();
    const menu = popup.current.getBoundingClientRect();
    setPosition({
      left: Math.max(
        0,
        Math.min(innerWidth - menu.width, rect.right - menu.width),
      ),
      top: Math.max(
        0,
        rect.bottom + menu.height <= innerHeight
          ? rect.bottom
          : rect.top - menu.height,
      ),
    });
  };
  useEffect(() => {
    const width = getComputedStyle(document.documentElement)
      .getPropertyValue("--compact-table-width")
      .trim();
    const media = matchMedia(`(max-width: ${width})`);
    const update = () => {
      if (popup.current?.matches(":popover-open")) popup.current.hidePopover();
      setCompact(media.matches);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = () => popup.current?.hidePopover();
    const scroll = (event) => {
      if (
        !popup.current?.contains(event.target) &&
        popup.current?.matches(":popover-open")
      )
        place();
    };
    const escape = (event) => {
      if (
        event.key !== "Escape" ||
        !popup.current?.matches(":popover-open") ||
        popup.current.querySelector(".qr-dropdown")
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      close();
      trigger.current.focus();
    };
    window.addEventListener("resize", close);
    document.addEventListener("scroll", scroll, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", scroll, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);
  if (!Children.toArray(children).length) return null;
  return (
    <div className="responsive-actions">
      {compact && (
        <IconButton
          ref={trigger}
          aria-label={label}
          title={label}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => {
            if (open) return popup.current.hidePopover();
            popup.current.showPopover();
            place();
          }}
        >
          <Icon name="more" />
        </IconButton>
      )}
      <div
        ref={popup}
        id={id}
        popover={compact ? "auto" : undefined}
        className={compact ? "action-popup" : className}
        role={compact ? "group" : undefined}
        aria-label={compact ? label : undefined}
        style={compact ? position : undefined}
        onToggle={(event) => setOpen(event.newState === "open")}
        onKeyDown={(event) => {
          if (compact && event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            popup.current.hidePopover();
            trigger.current.focus();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
