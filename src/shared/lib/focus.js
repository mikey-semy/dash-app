export function installFocusIndicators(document) {
  const keyboard = (event) => {
    if (event.key === "Tab")
      document.documentElement.classList.add("keyboard-navigation");
  };
  const pointer = () =>
    document.documentElement.classList.remove("keyboard-navigation");
  document.addEventListener("keydown", keyboard, true);
  document.addEventListener("pointerdown", pointer, true);
  return () => {
    document.removeEventListener("keydown", keyboard, true);
    document.removeEventListener("pointerdown", pointer, true);
  };
}

export function restoreFocus(previous) {
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
        const trigger = [...document.querySelectorAll("[aria-controls]")].find(
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
}
