import { useCallback, useEffect, useRef, useState } from "react";

// Overlay entries keep the underlying page URL and allow Back/Forward navigation.
export function useHistoryOverlay() {
  const entries = useRef(new Map());
  const currentValue = useRef(null);
  const [value, setValue] = useState(null);
  useEffect(() => {
    const update = () => {
      currentValue.current =
        entries.current.get(window.history.state?.dashOverlay) || null;
      setValue(currentValue.current);
    };
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  const navigate = useCallback((next, { replace = false } = {}) => {
    if (typeof next === "function") next = next(currentValue.current);
    if (next === currentValue.current) return;
    currentValue.current = next;
    const current = window.history.state?.dashOverlay;
    if (next === null) {
      if (entries.current.has(current)) {
        if (replace) {
          const state = { ...window.history.state };
          delete state.dashOverlay;
          window.history.replaceState(state, "");
          entries.current.delete(current);
        } else window.history.back();
      }
      setValue(null);
      return;
    }
    const id = crypto.randomUUID();
    entries.current.set(id, next);
    const state = { ...window.history.state, dashOverlay: id };
    if (entries.current.has(current)) window.history.replaceState(state, "");
    else window.history.pushState(state, "");
    setValue(next);
  }, []);
  return [value, navigate];
}
