import { createHmac, createHash, randomBytes } from "node:crypto";
import { parse as htmlParse, serialize } from "parse5";
import valueParser from "postcss-value-parser";
import parseSrcset from "parse-srcset";
import { parse as jsParse } from "acorn";
import { simple } from "acorn-walk";
import { pipeline } from "node:stream/promises";
import { archiveTextObject } from "./archive-text.js";
import { range } from "./core.js";

export function siteRoutes(app, service, env, transfer) {
  const origin = new URL(env.PUBLIC_URL).origin;
  const signature = (t) =>
    createHmac("sha256", env.ADMIN_PASSWORD + "\0" + (env.S3_SECRET_KEY || ""))
      .update(
        JSON.stringify([
          t.id,
          t.token,
          t.password,
          t.output?.key,
          t.output?.etag,
        ]),
      )
      .digest("base64url");
  const site = (t) => {
    const entry = t.files
      .filter((file) => /(?:^|\/)index\.html?$/i.test(file.name))
      .sort((a, b) => a.name.split("/").length - b.name.split("/").length)[0];
    return entry
      ? "/site/" +
          t.token +
          "/" +
          signature(t) +
          "/" +
          entry.name.split("/").map(encodeURIComponent).join("/")
      : null;
  };
  app.get("/site/:token/:key/{*path}", async (req, res) => {
    try {
      const t = transfer(req);
      if (req.params.key !== signature(t))
        throw Object.assign(new Error("Просмотр недоступен"), { status: 404 });
      let name = (req.params.path || []).join("/");
      if (
        name.split("/").some((part) => part === ".." || part === ".") ||
        name.includes("\\")
      )
        throw Object.assign(new Error("Неверный путь"), { status: 404 });
      if (!name || name.endsWith("/")) name += "index.html";
      let index = t.files.findIndex(
        (file) => file.name === name && !file.directory,
      );
      if (
        index < 0 &&
        t.files.some((file) => file.name === name + "/index.html")
      )
        return res.redirect(302, req.path + "/");
      if (index < 0)
        throw Object.assign(new Error("Файл не найден"), { status: 404 });
      const file = t.files[index],
        extension = name.split(".").pop().toLowerCase();
      const root =
        new URL(site(t), origin).pathname.split("/").slice(0, -1).join("/") +
        "/";
      const capability = "/site/" + t.token + "/" + req.params.key + "/";
      const rewrite = (value) =>
        value.startsWith("/") && !value.startsWith("//")
          ? root + value.slice(1)
          : value;
      const css = (text) =>
        valueParser(text)
          .walk((node, index, nodes) => {
            if (
              node.type === "string" &&
              nodes
                .slice(0, index)
                .filter((item) => item.type !== "space")
                .at(-1)?.value === "@import"
            )
              node.value = rewrite(node.value);
            if (
              node.type === "function" &&
              node.value.toLowerCase() === "url" &&
              node.nodes[0]?.value
            )
              node.nodes[0].value = rewrite(node.nodes[0].value);
          })
          .toString();
      const javascript = (text) => {
        try {
          const tree = jsParse(text, {
              ecmaVersion: "latest",
              sourceType: "module",
              allowReturnOutsideFunction: true,
            }),
            edits = [];
          simple(tree, {
            Literal(node) {
              if (
                typeof node.value !== "string" ||
                !node.value.startsWith("/") ||
                node.value.startsWith("//")
              )
                return;
              const target = decodeURIComponent(
                root.slice(capability.length) +
                  node.value.slice(1).split(/[?#]/)[0],
              );
              if (
                t.files.some(
                  (file) =>
                    file.name === target ||
                    (node.value.endsWith("/") && file.name.startsWith(target)),
                )
              )
                edits.push({
                  start: node.start,
                  end: node.end,
                  value: JSON.stringify(rewrite(node.value)),
                });
            },
          });
          for (const edit of edits.sort((a, b) => b.start - a.start))
            text =
              text.slice(0, edit.start) + edit.value + text.slice(edit.end);
        } catch (error) {
          console.error("[DU] static JavaScript parser", name, error.message);
        }
        return text;
      };
      const object =
        t.files.length > 1
          ? await archiveTextObject(service.store, t, index)
          : await service.store.get(t.output.key, { IfMatch: t.output.etag });
      res.set({
        "Access-Control-Allow-Origin": "*",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Accept-Ranges": "bytes",
      });
      res.type(extension);
      const textType =
        ["html", "htm", "css", "js", "mjs"].includes(extension) &&
        file.size <= 5 * 1024 * 1024;
      if (textType) {
        const chunks = [];
        let size = 0;
        for await (const chunk of object.Body) {
          size += chunk.length;
          if (size > file.size) throw Error("Object size changed");
          chunks.push(chunk);
        }
        if (size !== file.size) throw Error("Incomplete object");
        const buffer = Buffer.concat(chunks);
        if (signature(transfer(req)) !== req.params.key)
          throw Object.assign(new Error("Передача обновилась"), {
            status: 412,
          });
        let body = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
        const scriptHashes = [],
          styleHashes = [];
        const digest = (value) =>
          "'sha256-" +
          createHash("sha256").update(value).digest("base64") +
          "'";
        if (extension === "html" || extension === "htm") {
          const tree = htmlParse(body);
          const visit = (node) => {
            for (const attr of node.attrs || []) {
              if (
                ["src", "href", "poster", "action", "data"].includes(attr.name)
              )
                attr.value = rewrite(attr.value);
              if (attr.name === "srcset")
                attr.value = parseSrcset(attr.value)
                  .map(
                    (item) =>
                      rewrite(item.url) +
                      (item.w ? ` ${item.w}w` : item.d ? ` ${item.d}x` : "") +
                      (item.h ? ` ${item.h}h` : ""),
                  )
                  .join(", ");
              if (attr.name === "style") {
                attr.value = css(attr.value);
                styleHashes.push(digest(attr.value));
              }
              if (attr.name.startsWith("on")) {
                attr.value = javascript(attr.value);
                scriptHashes.push(digest(attr.value));
              }
            }
            if (
              node.tagName === "script" &&
              !node.attrs.some((attr) => attr.name === "src")
            ) {
              for (const child of node.childNodes || [])
                if (child.nodeName === "#text") {
                  child.value = javascript(child.value);
                  scriptHashes.push(digest(child.value));
                }
            }
            if (node.tagName === "style")
              for (const child of node.childNodes || [])
                if (child.nodeName === "#text") {
                  child.value = css(child.value);
                  styleHashes.push(digest(child.value));
                }
            for (const child of node.childNodes || []) visit(child);
          };
          visit(tree);
          body = serialize(tree);
        } else body = extension === "css" ? css(body) : javascript(body);
        res.set(
          "Content-Security-Policy",
          `sandbox allow-scripts allow-forms allow-downloads; default-src 'none'; script-src ${origin + capability} https: 'unsafe-hashes' ${scriptHashes.join(" ")}; style-src ${origin + capability} https: 'unsafe-hashes' ${styleHashes.join(" ")}; img-src ${origin + capability} https: data: blob:; font-src ${origin + capability} https: data:; media-src ${origin + capability} blob:; connect-src ${origin + capability}; frame-src 'none'; base-uri ${origin + capability}; form-action 'none'; frame-ancestors 'self'`,
        );
        return res.send(body);
      }
      res.set(
        "Content-Security-Policy",
        "sandbox; default-src 'none'; frame-ancestors 'self'",
      );
      const requested = range(req.headers.range, file.size);
      if (requested === false) {
        object.Body.destroy();
        return res
          .status(416)
          .set("Content-Range", `bytes */${file.size}`)
          .end();
      }
      if (requested) {
        object.Body.destroy();
        res.status(206).set({
          "Content-Range": `bytes ${requested.start}-${requested.end}/${file.size}`,
          "Content-Length": requested.end - requested.start + 1,
        });
        const part =
          t.files.length > 1
            ? await archiveTextObject(service.store, t, index, requested)
            : await service.store.get(t.output.key, {
                Range: `bytes=${requested.start}-${requested.end}`,
                IfMatch: t.output.etag,
              });
        return await pipeline(part.Body, res);
      }
      res.set("Content-Length", file.size);
      await pipeline(object.Body, res);
    } catch (error) {
      console.error(
        "[DU] static preview",
        req.params.token,
        error.status || 503,
        error.message,
      );
      if (res.headersSent) return res.destroy();
      res.locals.errorPage = true;
      const nonce = randomBytes(18).toString("base64");
      res
        .status(error.status || 503)
        .set({
          "Access-Control-Allow-Origin": "*",
          "Content-Security-Policy": `sandbox allow-scripts allow-top-navigation-by-user-activation; default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; frame-ancestors 'self'`,
        })
        .type("html")
        .send(
          `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style nonce="${nonce}">body{margin:0;display:grid;place-items:center;height:100dvh}a{color:#d33434;display:flex}</style><a href="/" target="_top" aria-label="Вернуться к загрузке"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M6 6 18 18M18 6 6 18"/></svg></a><script nonce="${nonce}">console.error('[DU] Static preview HTTP ${error.status || 503}')</script>`,
        );
    }
  });
  return site;
}
