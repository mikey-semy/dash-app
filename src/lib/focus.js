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
