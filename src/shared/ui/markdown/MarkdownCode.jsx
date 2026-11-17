import hljs from "#src/shared/lib/code/highlight.js";
export default function MarkdownCode({ source, className }) {
  const language = /\blanguage-([^\s]+)/.exec(className)?.[1];
  if (language && hljs.getLanguage(language)) {
    try {
      return (
        <code
          className={className}
          dangerouslySetInnerHTML={{
            __html: hljs.highlight(source, { language, ignoreIllegals: true })
              .value,
          }}
        />
      );
    } catch {}
  }
  return <code className={className}>{source}</code>;
}
