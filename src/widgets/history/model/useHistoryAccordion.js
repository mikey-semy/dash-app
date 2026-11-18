import { useEffect, useRef, useState } from "react";
import { TIMING } from "#common/config.js";

export function useHistoryAccordion() {
  const body = useRef(null);
  const spacer = useRef(null);
  const origin = useRef(0);
  const frame = useRef(0);
  const [openId, setOpenId] = useState(null);
  const stop = () => cancelAnimationFrame(frame.current);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const reset = () => {
    stop();
    if (spacer.current) spacer.current.style.height = "";
    setOpenId(null);
  };

  function toggle(id, row) {
    const list = body.current;
    const tail = spacer.current;
    stop();
    const opening = openId !== id;
    const from = list.scrollTop;
    if (openId === null) origin.current = from;
    setOpenId(opening ? id : null);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = performance.now();
    function move(now) {
      if (!row.isConnected || !list.clientHeight) return;
      let target = origin.current;
      if (opening) {
        target = Math.max(
          0,
          list.scrollTop +
            row.getBoundingClientRect().top -
            list.getBoundingClientRect().top,
        );
        const afterRow =
          tail.getBoundingClientRect().top - row.getBoundingClientRect().top;
        tail.style.height =
          Math.max(0, Math.ceil(list.clientHeight - afterRow)) + "px";
      }
      const progress = reduced
        ? 1
        : Math.min(1, (now - started) / TIMING.historyScroll);
      list.scrollTop = from + (target - from) * (1 - (1 - progress) ** 3);
      if (progress < 1) frame.current = requestAnimationFrame(move);
      else if (!opening) tail.style.height = "";
    }
    frame.current = requestAnimationFrame(move);
  }
  return { body, spacer, openId, toggle, stop, reset };
}
