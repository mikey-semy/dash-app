import { copy } from "#common/copy.js";
import { lazy, Suspense } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
const HighlightedCode = lazy(() => import("./MarkdownCode.jsx"));
export default function MarkdownPreview({
  source,
  filename = "",
  files = [],
  token = "",
}) {
  const resolve = (href, image = false) => {
    if (!href || !token || /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href))
      return null;
    try {
      const base = new URL(
        "/" + filename.split("/").map(encodeURIComponent).join("/"),
        "https://files.invalid",
      );
      const url = new URL(href, base);
      if (url.origin !== base.origin) return null;
      const path = decodeURIComponent(url.pathname.slice(1));
      const index = files.findIndex((file) => file.name === path);
      if (index < 0) return null;
      if (image)
        return files[index].media === "image"
          ? "/preview/" + token + "/" + index
          : null;
      return files[index].preview || files[index].media
        ? "/" + token + "?file=" + encodeURIComponent(path) + url.hash
        : "/public/" + token + "/files/" + index + "/download";
    } catch {
      return null;
    }
  };
  return (
    <div className="markdown-preview" aria-label={copy.markdownPreview}>
      <article className="markdown-document">
        <Markdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSlug]}
          skipHtml
          components={{
            a: ({ href, children }) => (
              <a
                href={resolve(href) || href}
                target={
                  resolve(href) || href?.startsWith("#") ? undefined : "_blank"
                }
                rel="noopener noreferrer"
              >
                {children}
              </a>
            ),
            img: ({ src, alt }) =>
              resolve(src, true) ||
              (src &&
                /^data:image\/(?:png|jpeg|gif|webp|avif);base64,/i.test(
                  src,
                )) ? (
                <img src={resolve(src, true) || src} alt={alt || ""} />
              ) : (
                <a href={src} target="_blank" rel="noopener noreferrer">
                  {alt || "↗"}
                </a>
              ),
            code: ({ className, children }) =>
              className?.includes("language-") ? (
                <Suspense
                  fallback={<code className={className}>{children}</code>}
                >
                  <HighlightedCode
                    className={className}
                    source={String(children)}
                  />
                </Suspense>
              ) : (
                <code>{children}</code>
              ),
          }}
        >
          {source}
        </Markdown>
      </article>
    </div>
  );
}
