import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import hljs from "./highlight.js";
import { resourceName } from "#common/resource-name.js";
import languages from "#common/text-languages.json" with { type: "json" };
const subset = [...new Set(languages.map((l) => l.id))];
const parser = unified().use(remarkParse).use(remarkGfm);
function markdownEvidence(text) {
  const tree = parser.parse(text);
  const blocks = tree.children;
  const headings = blocks.filter((node) => node.type === "heading").length;
  const lists = blocks.filter((node) => node.type === "list");
  const fenced = blocks.some((node) => node.type === "code" && node.lang);
  const rich = blocks.some((node) =>
    ["table", "blockquote", "thematicBreak"].includes(node.type),
  );
  const inline = (node) =>
    ["link", "image", "strong", "delete"].includes(node.type) ||
    node.children?.some(inline);
  return (
    headings >= 2 ||
    (headings > 0 && (lists.length || fenced || rich || blocks.some(inline))) ||
    (lists.some((node) => node.children.length >= 2) && blocks.some(inline)) ||
    rich ||
    fenced
  );
}
export function detect(text, filename = "") {
  const base = resourceName(filename).split(/[\\/]/).pop();
  let language = languages.find(
    (l) =>
      l.extensions.some((ext) =>
        base.toLowerCase().endsWith("." + ext.toLowerCase()),
      ) ||
      (l.filename &&
        new RegExp(l.filename.source, l.filename.flags).test(base)),
  );
  if (language) {
    if (
      /^text-\d{8}-\d{9}\.\w+$/i.test(base) &&
      markdownEvidence(text.slice(0, 65536))
    ) {
      const markdown = languages.find((item) => item.name === "Markdown");
      return { ...markdown, label: "Markdown" };
    }
    return { ...language, label: language.name };
  }
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
  if (markdownEvidence(first)) {
    const markdown = languages.find((item) => item.name === "Markdown");
    return { ...markdown, label: "Markdown" };
  }
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
