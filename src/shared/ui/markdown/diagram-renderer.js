import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  htmlLabels: false,
  suppressErrorRendering: true,
  theme: "neutral",
  secure: [
    "secure",
    "securityLevel",
    "startOnLoad",
    "maxTextSize",
    "maxEdges",
    "suppressErrorRendering",
    "htmlLabels",
  ],
});

const parentOrigin = new URL(location.href).origin;
async function rasterize(svg) {
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = parsed.documentElement;
  const [, , width, height] =
    root.getAttribute("viewBox")?.trim().split(/\s+/).map(Number) || [];
  if (!(width > 0 && height > 0)) throw new Error("Missing diagram dimensions");
  const scale = Math.min(2, 4096 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  root.setAttribute("width", String(canvas.width));
  root.setAttribute("height", String(canvas.height));
  root.removeAttribute("style");
  const image = new Image();
  image.src =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(new XMLSerializer().serializeToString(root));
  await image.decode();
  canvas.getContext("2d").drawImage(image, 0, 0);
  return {
    png: canvas.toDataURL(),
    width: Math.ceil(width),
    label: root.querySelector("title")?.textContent,
  };
}
window.addEventListener("message", async (event) => {
  if (
    event.origin !== parentOrigin ||
    event.source !== window.parent ||
    event.data?.type !== "render-diagram" ||
    typeof event.data.source !== "string"
  )
    return;
  const { id, source } = event.data;
  let result;
  try {
    const { svg } = await mermaid.render("diagram-" + id, source);
    result = await rasterize(svg);
  } catch {
    result = null;
  }
  window.parent.postMessage(
    { type: "diagram-result", id, result },
    parentOrigin,
  );
});
window.parent.postMessage({ type: "diagram-ready" }, parentOrigin);
