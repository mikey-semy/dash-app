export function highlightedParts(value, pattern) {
  const parts = [];
  let offset = 0;
  if (pattern) {
    for (const match of value.matchAll(pattern)) {
      if (match.index > offset)
        parts.push({ text: value.slice(offset, match.index), match: false });
      parts.push({ text: match[0], match: true });
      offset = match.index + match[0].length;
    }
  }
  if (offset < value.length)
    parts.push({ text: value.slice(offset), match: false });
  return parts;
}

export function HighlightedText({ value, pattern }) {
  return highlightedParts(value, pattern).map(({ text, match }, index) =>
    match ? (
      <mark className="search-match" key={index}>
        {text}
      </mark>
    ) : (
      text
    ),
  );
}
