import { copy } from "#common/copy.js";
import stylesheet from "./export.css?inline";

async function imageData(url) {
  try {
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return null;
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function createDocument(article, filename) {
  const title = (filename.split("/").at(-1) || copy.markdownPreview).replace(
    /(.+)\.[^.]+$/,
    "$1",
  );
  const output = document.implementation.createHTMLDocument(title);
  output.documentElement.lang = document.documentElement.lang;
  output.body.className = "markdown-export";
  const charset = output.createElement("meta");
  charset.setAttribute("charset", "utf-8");
  const viewport = output.createElement("meta");
  viewport.name = "viewport";
  viewport.content = "width=device-width, initial-scale=1";
  const policy = output.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content =
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";
  const style = output.createElement("style");
  style.nonce = document.querySelector('meta[name="csp-nonce"]')?.content || "";
  style.textContent = stylesheet;
  output.head.prepend(charset, viewport, policy);
  output.head.append(style);
  const content = article.cloneNode(true);
  for (const link of content.querySelectorAll("a[href]")) {
    const href = link.getAttribute("href");
    if (href && !href.startsWith("#")) link.setAttribute("href", link.href);
  }
  const images = new Map();
  await Promise.all(
    Array.from(content.querySelectorAll("img"), async (image) => {
      const source = image.getAttribute("src");
      if (!source || source.startsWith("data:")) return;
      const url = new URL(source, location.href);
      if (
        url.origin === location.origin &&
        url.pathname.startsWith("/preview/")
      ) {
        if (!images.has(url.href)) images.set(url.href, imageData(url.href));
        const data = await images.get(url.href);
        if (data) {
          image.src = data;
          return;
        }
      }
      image.replaceWith(image.alt);
    }),
  );
  output.body.append(content);
  return output;
}

export async function downloadMarkdownHtml(article, filename) {
  const output = await createDocument(article, filename);
  output.querySelector("style").removeAttribute("nonce");
  const html = new Blob(
    ["<!doctype html>\n", output.documentElement.outerHTML],
    {
      type: "text/html;charset=utf-8",
    },
  );
  const url = URL.createObjectURL(html);
  const link = document.createElement("a");
  link.href = url;
  link.download = output.title + ".html";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
