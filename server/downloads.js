import express from "express";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { ZipArchive } from "archiver";
import { copy } from "#common/copy.js";
import { MAX_FILES } from "#common/config.js";
import { range, archiveName } from "./core.js";
import { mediaType } from "./media.js";
import { archiveTextObject } from "./archive-text.js";
import { fileTextCandidate, textCandidate } from "./text.js";
function exactLength(expected) {
  let seen = 0;
  return new Transform({
    transform(chunk, encoding, done) {
      seen += chunk.length;
      done(seen > expected ? new Error("Object size changed") : null, chunk);
    },
    flush(done) {
      done(seen === expected ? null : new Error("Incomplete object"));
    },
  });
}
export function registerDownloads(
  app,
  { service, transfer, allowed, claimDownload, readText, requireOwner },
) {
  const download = async (req, res) => {
    const raw = req.path.startsWith("/raw/"),
      privateFile = req.path.startsWith("/api/"),
      preview =
        req.path.startsWith("/preview/") ||
        (privateFile && req.query.download !== "1");
    if (!["GET", "HEAD"].includes(req.method))
      return raw
        ? res.status(405).type("text/plain").send("Method Not Allowed")
        : res.sendStatus(405);
    const t = privateFile ? service.get(req.params.id) : transfer(req);
    if (
      privateFile &&
      (!t ||
        t.parent ||
        t.state !== "ready" ||
        (t.expires !== null && t.expires <= Date.now()))
    )
      throw Object.assign(new Error(copy.transferUnavailable), {
        status: 404,
      });
    if (!privateFile && !allowed(req, t))
      return raw
        ? res.status(401).type("text/plain").send(copy.transferPasswordRequired)
        : res.status(401).json({ error: copy.transferPasswordRequired });
    if (!t.output?.key)
      return raw
        ? res
            .status(409)
            .type("text/plain")
            .send(copy.thisTransferHasNoFilesYet)
        : res.status(409).json({ error: copy.thisTransferHasNoFilesYet });
    let text;
    const member = req.params.index !== undefined;
    const index = member ? Number(req.params.index) : undefined;
    if (
      member &&
      (!/^\d+$/.test(req.params.index) ||
        !Number.isSafeInteger(index) ||
        !t.files[index])
    )
      throw Object.assign(new Error(copy.fileNotFound), { status: 404 });
    if (
      preview &&
      ((index === undefined && t.files.length !== 1) ||
        !mediaType(t.files[index ?? 0]))
    )
      throw Object.assign(new Error(copy.noPreview), { status: 415 });
    if (raw) {
      if (!(member ? fileTextCandidate(t.files[index]) : textCandidate(t)))
        throw Object.assign(new Error(copy.textPreviewUnavailable), {
          status: 415,
        });
      text = await readText(t, index);
      const current = transfer(req);
      if (current.output?.key !== t.output.key)
        throw Object.assign(new Error(copy.transferUpdated), {
          status: 412,
        });
    }
    const out = member
        ? {
            ...t.output,
            size: t.files[index].size,
            name: t.files[index].name,
          }
        : t.output,
      modified = new Date(t.ready).toUTCString();
    res.set({
      "Accept-Ranges":
        t.one_time && !raw && !preview && !privateFile ? "none" : "bytes",
      ETag: out.etag,
      "Last-Modified": modified,
      "Content-Type": raw
        ? "text/plain; charset=utf-8"
        : preview
          ? mediaType(t.files[index ?? 0])[1]
          : "application/octet-stream",
      "Content-Disposition": `${raw || preview ? "inline" : "attachment"}; filename="${/^[\x20-\x7e]+$/.test(out.name) ? out.name : "download"}"; filename*=UTF-8''${encodeURIComponent(out.name).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16))}`,
    });
    if (preview)
      res.set(
        "Content-Security-Policy",
        "default-src 'none'; frame-ancestors 'self'",
      );
    const match = (h, strong = false) =>
      h
        ?.split(",")
        .map((v) => v.trim())
        .some(
          (v) =>
            v === "*" ||
            (strong ? v === out.etag : v.replace(/^W\//, "") === out.etag),
        );
    if (req.headers["if-match"] && !match(req.headers["if-match"], true))
      return res.sendStatus(412);
    if (
      !req.headers["if-match"] &&
      req.headers["if-unmodified-since"] &&
      Date.parse(req.headers["if-unmodified-since"]) <
        Math.floor(t.ready / 1000) * 1000
    )
      return res.sendStatus(412);
    if (
      match(req.headers["if-none-match"]) ||
      (!req.headers["if-none-match"] &&
        req.headers["if-modified-since"] &&
        Date.parse(req.headers["if-modified-since"]) >=
          Math.floor(t.ready / 1000) * 1000)
    )
      return res.status(304).end();
    let r = null;
    const ir = req.headers["if-range"];
    if (
      req.method === "GET" &&
      (!t.one_time || raw || preview || privateFile) &&
      (!ir ||
        ir === out.etag ||
        (!ir.startsWith("W/") &&
          Date.parse(ir) >= Math.floor(t.ready / 1000) * 1000))
    )
      r = range(req.headers.range, out.size);
    if (r === false)
      return res.status(416).set("Content-Range", `bytes */${out.size}`).end();
    const length = r ? r.end - r.start + 1 : out.size;
    res.status(r ? 206 : 200).set("Content-Length", String(length));
    if (r) res.set("Content-Range", `bytes ${r.start}-${r.end}/${out.size}`);
    if (req.method === "HEAD") return res.end();
    if (!raw && !preview && !privateFile)
      claimDownload(t, res, !r || r.end === out.size - 1);
    if (raw) return res.end(r ? text.subarray(r.start, r.end + 1) : text);
    const object =
      member && t.files.length > 1
        ? await archiveTextObject(service.store, t, index, r)
        : await service.store.get(out.key, {
            IfMatch: out.etag,
            ...(r ? { Range: `bytes=${r.start}-${r.end}` } : {}),
          });
    try {
      await pipeline(object.Body, exactLength(length), res);
    } catch {
      res.destroy();
    }
  };
  app.all(
    "/public/:token/selection",
    express.urlencoded({ extended: false, limit: "2kb" }),
    async (req, res) => {
      if (!["GET", "POST", "HEAD"].includes(req.method))
        return res.sendStatus(405);
      const t = transfer(req);
      if (!allowed(req, t)) return res.sendStatus(401);
      const chosen =
        req.method === "POST" ? req.body?.indices : req.query.indices;
      let indices;
      try {
        indices = typeof chosen === "string" ? JSON.parse(chosen) : chosen;
      } catch {}
      if (
        !Array.isArray(indices) ||
        !indices.length ||
        indices.length > MAX_FILES ||
        new Set(indices).size !== indices.length ||
        indices.some((i) => !Number.isInteger(i) || !t.files[i])
      )
        return res.sendStatus(400);
      if (req.method === "HEAD") return res.type("application/zip").end();
      if (indices.length === 1)
        return res.redirect(
          303,
          "/public/" + req.params.token + "/files/" + indices[0] + "/download",
        );
      claimDownload(t, res);
      const zip = new ZipArchive({ store: true, forceZip64: true });
      let body;
      const close = () => {
        body?.destroy();
        zip.destroy();
      };
      res.once("close", close);
      res
        .attachment(t.output.name || archiveName(t.created))
        .type("application/zip");
      const sending = pipeline(zip, res);
      sending.catch(() => {});
      try {
        for (const index of indices) {
          const object =
            t.files.length > 1
              ? await archiveTextObject(service.store, t, index)
              : await service.store.get(t.output.key);
          const original = object.Body;
          const checked = exactLength(t.files[index].size);
          body = checked;
          original.once("error", (error) => checked.destroy(error));
          checked.once("close", () => original.destroy());
          original.pipe(checked);
          zip.append(body, { name: t.files[index].name });
          await new Promise((resolve, reject) => {
            const cancelled = () => {
              cleanup();
              reject(new Error("Cancelled"));
            };
            const cleanup = () => res.off("close", cancelled);
            body.once("end", () => {
              cleanup();
              resolve();
            });
            body.once("error", (error) => {
              cleanup();
              reject(error);
            });
            res.once("close", cancelled);
          });
        }
        await zip.finalize();
        await sending;
      } catch {
        close();
        res.destroy();
      } finally {
        res.off("close", close);
      }
    },
  );
  app.all(
    [
      "/public/:token/download",
      "/raw/:token",
      "/raw/:token/:index",
      "/public/:token/files/:index/download",
      "/preview/:token",
      "/preview/:token/:index",
    ],
    download,
  );
  app.all("/api/transfers/:id/media/:index", requireOwner, download);
}
