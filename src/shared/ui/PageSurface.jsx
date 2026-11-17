import { restoreFocus } from "#src/shared/lib/focus.js";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef } from "react";
export function PageSurface({
  children,
  onClose,
  suspended = false,
  title,
  returnTitle,
  className = "",
  ...props
}) {
  const ref = useRef(),
    lastFocus = useRef(),
    root = useRef(document.getElementById("root")),
    opener = useRef(document.activeElement);
  useLayoutEffect(() => {
    const element = root.current,
      previous = element.inert;
    element.inert = !suspended;
    return () => {
      element.inert = previous;
    };
  }, [suspended]);
  useLayoutEffect(() => () => restoreFocus(opener.current), []);
  useLayoutEffect(() => {
    if (!suspended)
      (
        lastFocus.current ||
        ref.current.querySelector("h2") ||
        ref.current
      ).focus({ preventScroll: true });
  }, [suspended]);
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = returnTitle || previous;
    };
  }, [title, returnTitle]);
  return createPortal(
    <section
      ref={ref}
      role="region"
      tabIndex={-1}
      hidden={suspended}
      className={className}
      onFocusCapture={(event) => {
        lastFocus.current = event.target;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.stopPropagation();
          onClose();
        }
      }}
      {...props}
    >
      {children({ close: onClose, dismiss: onClose })}
    </section>,
    document.body,
  );
}
