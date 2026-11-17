import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TIMING } from "#common/config.js";

export function Modal({
  children,
  onClose,
  suspended = false,
  closeDisabled = false,
  closeOnBackdrop = false,
  initialFocus,
  title,
  className = "",
  onKeyDownCapture,
  ...props
}) {
  const ref = useRef(null),
    callback = useRef(onClose),
    pending = useRef(false),
    finished = useRef(false),
    timer = useRef(),
    savedScroll = useRef([]),
    lastFocused = useRef(null),
    opener = useRef(document.activeElement);
  const [closing, setClosing] = useState(false);
  callback.current = onClose;

  const focusEdge = (last = false) => {
    const elements = [
      ...ref.current.querySelectorAll(
        "a[href], button, input, select, textarea, summary, iframe, audio[controls], video[controls], [tabindex], [contenteditable=true]",
      ),
    ].filter(
      (element) =>
        !element.hasAttribute("data-modal-focus-guard") &&
        !element.matches(":disabled") &&
        element.tabIndex >= 0 &&
        !element.closest("[inert]") &&
        element.getClientRects().length &&
        getComputedStyle(element).visibility !== "hidden",
    );
    (elements[last ? elements.length - 1 : 0] || ref.current).focus({
      preventScroll: true,
    });
  };

  const dismiss = () => {
    if (finished.current) return;
    finished.current = true;
    pending.current = true;
    clearTimeout(timer.current);
    ref.current?.close();
    callback.current?.();
  };
  const close = () => {
    if (closeDisabled || pending.current || suspended) return;
    pending.current = true;
    setClosing(true);
    timer.current = setTimeout(dismiss, TIMING.dialogClose);
  };

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (suspended) {
      savedScroll.current = [...dialog.querySelectorAll("*")]
        .filter((element) => element.scrollTop || element.scrollLeft)
        .map((element) => [element, element.scrollTop, element.scrollLeft]);
      dialog.close();
      return;
    }
    const savedFocus = lastFocused.current;
    dialog.showModal();
    const focus = savedFocus?.isConnected
      ? savedFocus
      : initialFocus
        ? dialog.querySelector(initialFocus)
        : dialog;
    focus?.focus({ preventScroll: true });
    for (const [element, top, left] of savedScroll.current) {
      element.scrollTop = top;
      element.scrollLeft = left;
    }
  }, [suspended, initialFocus]);

  useLayoutEffect(() => {
    const dialog = ref.current;
    return () => {
      clearTimeout(timer.current);
      dialog.close();
      const previous = opener.current;
      queueMicrotask(() => {
        if (document.querySelector("dialog[open]")) return;
        const visible = (element) =>
          element?.isConnected &&
          !element.closest("[inert]") &&
          element.getClientRects().length &&
          getComputedStyle(element).visibility !== "hidden";
        if (visible(previous)) previous.focus({ preventScroll: true });
        else {
          // A menu item may remain mounted inside its now-closed disclosure.
          // Return to that disclosure's trigger rather than a hidden control.
          for (
            let parent = previous?.parentElement;
            parent;
            parent = parent.parentElement
          ) {
            if (!parent.id) continue;
            const trigger = [
              ...document.querySelectorAll("[aria-controls]"),
            ].find(
              (element) =>
                element
                  .getAttribute("aria-controls")
                  .split(/\s+/)
                  .includes(parent.id) && visible(element),
            );
            if (trigger) {
              trigger.focus({ preventScroll: true });
              break;
            }
          }
        }
      });
    };
  }, []);
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <dialog
      {...props}
      ref={ref}
      tabIndex={-1}
      className={`modal ${className}`}
      data-closing={closing}
      onFocusCapture={(event) => {
        if (!event.target.hasAttribute("data-modal-focus-guard"))
          lastFocused.current = event.target;
      }}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDownCapture={(event) => {
        if (pending.current) {
          event.preventDefault();
          event.stopPropagation();
        } else onKeyDownCapture?.(event);
      }}
      onClickCapture={(event) => {
        if (pending.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onClick={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) close();
      }}
    >
      <span
        className="sr-only"
        tabIndex={0}
        data-modal-focus-guard
        onFocus={() => focusEdge(true)}
      />
      {typeof children === "function" ? children({ close, dismiss }) : children}
      <span
        className="sr-only"
        tabIndex={0}
        data-modal-focus-guard
        onFocus={() => focusEdge()}
      />
    </dialog>
  );
}
