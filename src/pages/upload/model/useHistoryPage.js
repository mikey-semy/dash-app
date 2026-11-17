import { useCallback, useEffect, useState } from "react";
export function useHistoryPage() {
  const [open, setOpen] = useState(() => location.pathname === "/history");
  useEffect(() => {
    const update = () => setOpen(location.pathname === "/history");
    addEventListener("popstate", update);
    return () => removeEventListener("popstate", update);
  }, []);
  const navigate = useCallback((value) => {
    const path = value ? "/history" : "/";
    if (location.pathname !== path) window.history.pushState(null, "", path);
    setOpen(value);
  }, []);
  return [open, navigate];
}
