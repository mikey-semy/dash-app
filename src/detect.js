import hljs from "./highlight.js";
import languages from "./text-languages.json" with { type: "json" };
const subset = [...new Set(languages.map((l) => l.id))];
export function detect(text, filename = "") {
  const base = filename.split(/[\\/]/).pop();
  let language = languages.find(
    (l) =>
      l.extensions.some((ext) =>
        base.toLowerCase().endsWith("." + ext.toLowerCase()),
      ) ||
      (l.filename &&
        new RegExp(l.filename.source, l.filename.flags).test(base)),
  );
  if (language) return { ...language, label: language.name };
  const first = text.slice(0, 65536),
    shebang = first.match(/^#![^\n]*\b(python\d*|bash|sh|node|ruby|perl)\b/);
  if (shebang) {
    const id =
      {
        sh: "bash",
        bash: "bash",
        node: "javascript",
        ruby: "ruby",
        perl: "perl",
      }[shebang[1]] || "python";
    language = languages.find((l) => l.id === id);
    if (language) return { ...language, label: language.name };
  }
  if (/^\s*[\[{]/.test(first) && text.length <= 65536) {
    try {
      JSON.parse(text);
      language = languages.find((l) => l.name === "JSON");
      return { ...language, label: "JSON" };
    } catch {}
  }
  const result = hljs.highlightAuto(first, subset);
  if (!result.language || result.relevance < 5)
    return { name: null, label: "?" };
  language = languages.find((l) => l.id === result.language);
  return language
    ? {
        ...language,
        label:
          language.name +
          (result.relevance - (result.secondBest?.relevance || 0) >= 2
            ? ""
            : "?"),
      }
    : { name: null, label: "?" };
}
