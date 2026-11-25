import { copy } from "#common/copy.js";
import {
  createContext,
  isValidElement,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useRef,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
const HighlightedCode = lazy(() => import("./MarkdownCode.jsx"));
const MermaidDiagram = lazy(() => import("./MermaidDiagram.jsx"));
const LinkContext = createContext(null);
// Keep component identities stable when the transfer's metadata is polled.
const components = {
  table: ({ children }) => (
    <div
      className="markdown-overflow"
      role="region"
      aria-label={copy.markdownTable}
      tabIndex={0}
    >
      <table>{children}</table>
    </div>
  ),
  pre: ({ children }) => {
    if (
      !isValidElement(children) ||
      !children.props.className?.split(/\s+/).includes("language-mermaid")
    )
      return <pre>{children}</pre>;
    const diagram = String(children.props.children);
    const code = <code>{diagram}</code>;
    const pending = <pre data-markdown-pending>{code}</pre>;
    return (
      <Suspense fallback={pending}>
        <MermaidDiagram
          source={diagram}
          pending={pending}
          fallback={<pre>{code}</pre>}
        />
      </Suspense>
    );
  },
  a: function MarkdownLink({ href, children }) {
    const resolve = useContext(LinkContext);
    const local = resolve(href);
    return (
      <a
        href={local || href}
        target={local || href?.startsWith("#") ? undefined : "_blank"}
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  },
  img: function MarkdownImage({ src, alt }) {
    const resolve = useContext(LinkContext);
    const local = resolve(src, true);
    return local ||
      (src && /^data:image\/(?:png|jpeg|gif|webp|avif);base64,/i.test(src)) ? (
      <img src={local || src} alt={alt || ""} />
    ) : (
      <a href={src} target="_blank" rel="noopener noreferrer">
        {alt || "↗"}
      </a>
    );
  },
  code: ({ className, children }) =>
    className?.includes("language-") ? (
      <Suspense fallback={<code className={className}>{children}</code>}>
        <HighlightedCode className={className} source={String(children)} />
      </Suspense>
    ) : (
      <code>{children}</code>
    ),
};
export default function MarkdownPreview({
  source,
  filename = "",
  files = [],
  token = "",
  onExportDocument,
}) {
  const article = useRef(null);
  useEffect(() => {
    if (!onExportDocument) return;
    const element = article.current;
    const update = () =>
      onExportDocument(
        element.querySelector("[data-markdown-pending]") ? null : element,
      );
    const observer = new MutationObserver(update);
    observer.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-markdown-pending"],
    });
    update();
    return () => {
      observer.disconnect();
      onExportDocument(null);
    };
  }, [onExportDocument]);
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
      <article ref={article} className="markdown-document">
        <LinkContext.Provider value={resolve}>
          <Markdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSlug]}
            skipHtml
            components={components}
          >
            {source}
          </Markdown>
        </LinkContext.Provider>
      </article>
    </div>
  );
}
