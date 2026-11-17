import { useCallback, useEffect, useState } from "react";

export function useSelection({ keys = [], resetKey }) {
  const [selection, setSelection] = useState(() => new Set());
  const clear = useCallback(() => setSelection(new Set()), []);
  useEffect(clear, [resetKey, clear]);
  const toggle = useCallback(
    (key) =>
      setSelection((previous) => {
        const next = new Set(previous);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      }),
    [],
  );
  const allSelected =
    keys.length > 0 && keys.every((key) => selection.has(key));
  const toggleAll = () => setSelection(allSelected ? new Set() : new Set(keys));
  return { selection, toggle, toggleAll, clear, allSelected };
}
