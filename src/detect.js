import hljs from "./highlight.js";
import languages from "./text-languages.json" with { type: "json" };
const subset = [...new Set(languages.map((l) => l.id))];
function markdownEvidence(text) {
  const outside = text.replace(
    /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[ \t]*$/gm,
    "",
  );
  const gherkin =
    /^\s*(?:Feature|Функция|Функционал|Возможность)\s*:/im.test(outside) &&
    /^\s*(?:Scenario(?: Outline)?|Сценарий(?:\s+\S+)?)\s*:/im.test(outside);
  if (gherkin) return false;
  if (
    /^(?: {0,3})(?:import\s+|from\s+\S+\s+import|(?:async\s+)?def\s+|class\s+|(?:export\s+)?(?:const|let|var|function)\s+|fn\s+|package\s+|[\w$]+\s*=(?!=))/m.test(
      outside,
    )
  )
    return false;
  const headings = (outside.match(/^ {0,3}#{1,6}[ \t]+\S/gm) || []).length;
  const lists = (outside.match(/^ {0,3}(?:[-+*]|\d+[.)])[ \t]+\S/gm) || [])
    .length;
  const markup =
    /!?\[[^\]\n]+\]\([^)\n]+\)|\*\*[^*\n]+\*\*|^ {0,3}>[ \t]+\S|^ {0,3}[-*+][ \t]+\[[ xX]\]/m.test(
      outside,
    );
  const fences = (text.match(/^ {0,3}(?:`{3,}|~{3,})/gm) || []).length;
  const table = /^\s*\|[^\n]+\|\s*\n\s*\|?\s*:?-{3,}/m.test(outside);
  return (
    fences >= 2 ||
    table ||
    headings >= 2 ||
    (headings > 0 &&
      (lists > 0 ||
        markup ||
        /^\s*#{1,6}[ \t]+[^\n]+\n[ \t]*\n/.test(outside))) ||
    lists >= 2
  );
}
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
  if (language) {
    if (
      language.name === "Gherkin" &&
      /^text-\d{8}-\d{9}\.feature$/i.test(base) &&
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
  if (result.language === "gherkin" && markdownEvidence(first)) {
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
