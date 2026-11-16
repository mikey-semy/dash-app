import { readFileSync } from "node:fs";
import { UI, LANGUAGE } from "../shared/config.js";

const styles =
  readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8") +
  "\n" +
  readFileSync(
    new URL("../src/styles/status-page.css", import.meta.url),
    "utf8",
  );
const svg = (content) =>
  `<svg width="${UI.iconSize}" height="${UI.iconSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${UI.iconStroke}" aria-hidden="true">${content}</svg>`;
export const statusIcons = Object.freeze({
  cross: svg('<path d="m6 6 12 12M18 6 6 18"/>'),
  eye: svg(
    '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path id="slash" d="m3 3 18 18" visibility="hidden"/>',
  ),
  enter: svg('<path d="M5 12h14m-6-6 6 6-6 6"/>'),
});
export const statusPage = ({ nonce, title, body, script = "" }) =>
  `<!doctype html><html lang="${LANGUAGE}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style nonce="${nonce}">${styles}</style></head><body>${body}<script nonce="${nonce}">${script}</script></body></html>`;
