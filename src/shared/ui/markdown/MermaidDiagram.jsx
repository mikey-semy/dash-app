import { useEffect, useState } from "react";
import { copy } from "#common/copy.js";

let renderer;
function getRenderer() {
  if (renderer) return renderer;
  const frame = document.createElement("iframe");
  frame.className = "markdown-render-surface";
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.tabIndex = -1;
  renderer = new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      if (error) reject(error);
      else resolve(frame.contentWindow);
    };
    const receive = (event) => {
      if (
        event.source === frame.contentWindow &&
        event.origin === "null" &&
        event.data?.type === "diagram-ready"
      )
        finish();
    };
    const timer = setTimeout(
      () => finish(new Error("Diagram renderer timed out")),
      12000,
    );
    window.addEventListener("message", receive);
    frame.src = "/diagram-renderer.html";
    document.body.append(frame);
  }).catch((error) => {
    frame.remove();
    renderer = undefined;
    throw error;
  });
  return renderer;
}
async function draw(source, signal) {
  const target = await getRenderer();
  signal.throwIfAborted();
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const finish = (result) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      window.removeEventListener("message", receive);
      resolve(result);
    };
    const cancel = () => finish(null);
    const receive = (event) => {
      if (
        event.source !== target ||
        event.origin !== "null" ||
        event.data?.type !== "diagram-result" ||
        event.data.id !== id
      )
        return;
      finish(event.data.result);
    };
    const timer = setTimeout(cancel, 12000);
    signal.addEventListener("abort", cancel, { once: true });
    window.addEventListener("message", receive);
    target.postMessage({ type: "render-diagram", id, source }, "*");
  });
}

export default function MermaidDiagram({ source, fallback }) {
  const [rendered, setRendered] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    draw(source, controller.signal)
      .then((result) => {
        if (result && !controller.signal.aborted)
          setRendered({ source, ...result });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [source]);
  if (rendered?.source !== source) return fallback;
  return (
    <div className="markdown-overflow markdown-diagram" tabIndex={0}>
      <img
        src={rendered.png}
        width={rendered.width}
        alt={rendered.label || copy.mermaidDiagram}
      />
    </div>
  );
}
