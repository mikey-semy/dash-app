import React, { lazy, Suspense } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
const HighlightedCode = lazy(() => import("./MarkdownCode.jsx"));
export default function MarkdownPreview({ source }) {
  return (
    <div className="markdown-preview" aria-label="Превью Markdown">
      <article className="markdown-document">
        <Markdown
          remarkPlugins={[remarkGfm]}
          skipHtml
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
            img: ({ src, alt }) =>
              src &&
              /^data:image\/(?:png|jpeg|gif|webp|avif);base64,/i.test(src) ? (
                <img src={src} alt={alt || ""} />
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
