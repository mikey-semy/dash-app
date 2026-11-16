import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

export function createPageRenderer(indexHTML) {
  let index = indexHTML;
  async function renderPage(req, res) {
    index ??= await readFile("dist/index.html", "utf8");
    const nonce = randomBytes(18).toString("base64");
    res.set(
      "Content-Security-Policy",
      res
        .get("Content-Security-Policy")
        .replace(
          "style-src 'self'",
          `style-src 'self' 'nonce-${nonce}'; worker-src 'self'`,
        ),
    );
    let page = index.replace("__CSP_NONCE__", nonce);
    if (res.locals.httpErrorStatus)
      page = page.replace(
        "</head>",
        `<meta name="du-error-status" content="${res.locals.httpErrorStatus}"></head>`,
      );
    res.type("html").send(page);
  }
  return renderPage;
}
