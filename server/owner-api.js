import express from "express";
import { copy } from "../shared/copy.js";
import {
  DEFAULT_RETENTION,
  RETENTION_SECONDS,
  PIN_PATTERN,
} from "../shared/config.js";
import { hash, revision } from "./core.js";
import { mediaType } from "./media.js";
import { fileTextCandidate, textCandidate } from "./text.js";
import { siteEntry, sitePublished } from "./site-policy.js";
import { generateSiteTitle } from "./site-names.js";

export function createOwnerApi({
  service,
  origin,
  hosting,
  vault,
  requireOwner,
  readText,
}) {
  const db = service.db;
  const api = express.Router();
  api.use(requireOwner);
  api.get("/session", (req, res) => res.json({ ok: true }));
  function publicOwner(t) {
    const pending = db
      .prepare(
        "SELECT state,error FROM transfers WHERE parent=? AND state NOT IN ('deleted','merged','deleting') ORDER BY created DESC LIMIT 1",
      )
      .get(t.id);
    return {
      appendState: pending?.state || null,
      appendError: pending?.error || null,
      id: t.id,
      revision: revision(t),
      preview: textCandidate(t),
      media: t.files.length === 1 ? mediaType(t.files[0])?.[0] || null : null,
      etag: t.output?.etag,
      state: t.state,
      created: t.created,
      ready: t.ready,
      expires: t.expires,
      ttl: t.ttl,
      hasPassword: !!t.password,
      title: t.title || "",
      name: t.output?.name || "",
      demo: !!t.demo,
      hasSite: !!siteEntry(t),
      published: sitePublished(t),
      spa: !!t.site_spa,
      domain: t.site_domain || "",
      domainState: hosting.status(t),
      oneTime: !!t.one_time,
      consumed: !!t.consumed,
      files: t.files.map(({ name, size }) => ({
        name,
        size,
        preview: fileTextCandidate({ name, size }),
        media: mediaType({ name })?.[0] || null,
      })),
      size: t.files.reduce((n, f) => n + f.size, 0),
      error: t.error,
      shareUrl:
        ["ready", "empty"].includes(t.state) &&
        (t.expires === null || t.expires > Date.now())
          ? hosting.shareURL(t)
          : null,
      url:
        ["ready", "empty"].includes(t.state) &&
        (t.expires === null || t.expires > Date.now())
          ? `${origin}/${t.token}`
          : null,
    };
  }
  api.get("/transfers", (req, res) =>
    res.json(
      db
        .prepare(
          "SELECT id FROM transfers WHERE parent IS NULL AND hidden=0 AND state NOT IN ('deleted','deleting') AND (expires IS NULL OR expires>?) ORDER BY created DESC",
        )
        .all(Date.now())
        .map((r) => publicOwner(service.get(r.id))),
    ),
  );
  api.get("/uploads/:id", (req, res) => {
    const t = service.get(req.params.id);
    service.uploadable(t);
    res.json({
      id: t.id,
      parentId: t.parent || null,
      offset: t.files.filter((file) => file.reused).length,
      files: t.files
        .filter((file) => !file.reused)
        .map(({ name, size }) => ({ name, size })),
    });
  });
  api.delete("/history", (req, res) => {
    const ids = req.body?.ids;
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 1000 ||
      ids.some((id) => typeof id !== "string" || id.length > 64)
    )
      return res.status(400).json({ error: copy.invalidTransferList });
    const unique = [...new Set(ids)];
    if (
      unique.some(
        (id) =>
          !db
            .prepare("SELECT 1 FROM transfers WHERE id=? AND parent IS NULL")
            .get(id),
      )
    )
      return res.status(404).json({ error: copy.transferNotFound });
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const id of unique) {
        service.delete(id);
        db.prepare("UPDATE transfers SET hidden=1 WHERE id=?").run(id);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    res.json({ ok: true });
  });
  api.post("/transfers", async (req, res) => {
    const {
      files,
      ttl = DEFAULT_RETENTION,
      password = "",
      oneTime = false,
    } = req.body;
    if (
      typeof password !== "string" ||
      password.length > 256 ||
      typeof oneTime !== "boolean"
    )
      return res.status(400).json({ error: copy.incorrectPassword });
    const id = await service.locked(() =>
      service.create(files, oneTime ? 0 : ttl, password),
    );
    if (oneTime)
      db.prepare("UPDATE transfers SET one_time=1 WHERE id=?").run(id);
    if (password)
      db.prepare("UPDATE transfers SET password_cipher=? WHERE id=?").run(
        vault.seal(id, password),
        id,
      );
    res.status(201).json({ id });
  });
  api.get("/transfers/:id/password", (req, res) => {
    const t = service.get(req.params.id);
    if (
      !t ||
      t.parent ||
      !["ready", "empty"].includes(t.state) ||
      (t.expires !== null && t.expires <= Date.now())
    )
      return res.status(404).json({ error: copy.transferUnavailable });
    res.json({
      password: vault.open(t.id, t.password_cipher),
      hasPassword: !!t.password,
    });
  });
  api.get("/transfers/:id/title-suggestion", (req, res) => {
    const t = service.get(req.params.id);
    if (
      !t ||
      t.parent ||
      !["ready", "empty"].includes(t.state) ||
      (t.expires !== null && t.expires <= Date.now())
    )
      return res.status(404).json({ error: copy.transferUnavailable });
    if (!siteEntry(t))
      return res.status(400).json({ error: copy.thisTransferHasNoSite });
    if (
      req.query.current !== undefined &&
      (typeof req.query.current !== "string" || req.query.current.length > 180)
    )
      return res.status(400).json({ error: copy.invalidName });
    res.json({ title: generateSiteTitle(db, { avoid: [req.query.current] }) });
  });
  api.patch("/transfers/:id/settings", async (req, res) => {
    const {
      ttl,
      password,
      title,
      names,
      revision: expectedRevision,
      oneTime,
      demo,
      published,
      domain,
      spa,
    } = req.body;
    if (
      (ttl === undefined &&
        password === undefined &&
        title === undefined &&
        names === undefined &&
        oneTime === undefined &&
        demo === undefined &&
        published === undefined &&
        domain === undefined &&
        spa === undefined) ||
      (ttl !== undefined && !RETENTION_SECONDS.includes(ttl)) ||
      (password !== undefined &&
        password !== "" &&
        !PIN_PATTERN.test(password)) ||
      (title !== undefined &&
        (typeof title !== "string" || title.length > 180)) ||
      (oneTime !== undefined && typeof oneTime !== "boolean") ||
      (demo !== undefined && typeof demo !== "boolean") ||
      (published !== undefined && typeof published !== "boolean") ||
      (spa !== undefined && typeof spa !== "boolean") ||
      (domain !== undefined && typeof domain !== "string")
    )
      return res.status(400).json({ error: copy.invalidSettings });
    await service.locked(() => {
      const t = service.get(req.params.id);
      if (
        !t ||
        t.parent ||
        !["ready", "empty"].includes(t.state) ||
        (t.expires !== null && t.expires <= Date.now())
      )
        throw Object.assign(new Error(copy.transferUnavailable), {
          status: 404,
        });
      if ((published === true || domain || spa === true) && !siteEntry(t))
        throw Object.assign(new Error(copy.thisTransferHasNoIndexHtml), {
          status: 400,
        });
      if (domain !== undefined) {
        const name = hosting.normalize(domain);
        if (name) {
          const existing = db
            .prepare(
              "SELECT id,expires,state FROM transfers WHERE site_domain=? AND id!=? AND state NOT IN ('deleted','deleting')",
            )
            .get(name, t.id);
          if (
            existing &&
            (existing.expires === null || existing.expires > Date.now())
          )
            throw Object.assign(new Error(copy.domainAlreadyAssigned), {
              status: 409,
            });
          if (existing)
            db.prepare("UPDATE transfers SET site_domain=NULL WHERE id=?").run(
              existing.id,
            );
        }
        db.prepare("UPDATE transfers SET site_domain=? WHERE id=?").run(
          name,
          t.id,
        );
      }
      if (published !== undefined)
        db.prepare(
          "UPDATE transfers SET site_epoch=site_epoch+CASE WHEN site_published!=? THEN 1 ELSE 0 END,site_published=?,demo=CASE WHEN ?=1 THEN 1 ELSE demo END WHERE id=?",
        ).run(published ? 1 : 0, published ? 1 : 0, published ? 1 : 0, t.id);
      if (spa !== undefined)
        db.prepare("UPDATE transfers SET site_spa=? WHERE id=?").run(
          spa ? 1 : 0,
          t.id,
        );
      if (names !== undefined) {
        const defaultTitle = !t.title && (t.output?.name || t.files[0]?.name);
        service.rename(t.id, names, expectedRevision);
        if (defaultTitle)
          db.prepare("UPDATE transfers SET title=? WHERE id=?").run(
            defaultTitle,
            t.id,
          );
      }
      if (title !== undefined)
        db.prepare("UPDATE transfers SET title=? WHERE id=?").run(
          title.trim(),
          t.id,
        );
      if (demo !== undefined)
        db.prepare("UPDATE transfers SET demo=? WHERE id=?").run(
          demo ? 1 : 0,
          t.id,
        );
      if (ttl !== undefined && oneTime !== true)
        db.prepare("UPDATE transfers SET one_time=0,consumed=0 WHERE id=?").run(
          t.id,
        );
      if (oneTime !== undefined)
        db.prepare("UPDATE transfers SET one_time=?,consumed=0 WHERE id=?").run(
          oneTime ? 1 : 0,
          t.id,
        );
      if (password !== undefined)
        db.prepare(
          "UPDATE transfers SET password=?,password_cipher=? WHERE id=?",
        ).run(
          password ? hash(password) : null,
          vault.seal(t.id, password),
          t.id,
        );
      if (ttl !== undefined || oneTime === true)
        db.prepare("UPDATE transfers SET ttl=?,expires=? WHERE id=?").run(
          oneTime ? 0 : ttl,
          oneTime ? null : ttl ? Date.now() + ttl * 1000 : null,
          t.id,
        );
    });
    hosting.refresh().catch((error) => console.error("[DU] domains", error));
    res.json(publicOwner(service.get(req.params.id)));
  });
  api.post("/transfers/:id/domain-check", async (req, res) => {
    const t = service.get(req.params.id);
    if (!t || t.parent)
      return res.status(404).json({ error: copy.transferUnavailable });
    await hosting.refresh();
    res.json(publicOwner(service.get(t.id)));
  });
  api.post("/transfers/:id/append", async (req, res) => {
    const result = await service.locked(() =>
      service.append(req.params.id, req.body.files),
    );
    res.status(201).json(result);
  });
  api.get(
    ["/transfers/:id/text", "/transfers/:id/text/:index"],
    async (req, res) => {
      const t = service.get(req.params.id),
        index =
          req.params.index === undefined ? undefined : Number(req.params.index);
      if (
        !t ||
        t.parent ||
        t.state !== "ready" ||
        (t.expires !== null && t.expires <= Date.now())
      )
        throw Object.assign(new Error(copy.transferUnavailable), {
          status: 404,
        });
      if (
        index !== undefined &&
        (!/^\d+$/.test(req.params.index) ||
          !Number.isSafeInteger(index) ||
          !t.files[index])
      )
        throw Object.assign(new Error(copy.fileNotFound), { status: 404 });
      if (
        !(index === undefined
          ? textCandidate(t)
          : fileTextCandidate(t.files[index]))
      )
        throw Object.assign(new Error(copy.textPreviewUnavailable), {
          status: 415,
        });
      const version = revision(t);
      if (req.headers["if-match"] && req.headers["if-match"] !== `"${version}"`)
        throw Object.assign(new Error(copy.transferChangedReopenTheEditor), {
          status: 409,
        });
      const content = await readText(t, index),
        current = service.get(t.id);
      if (
        !current ||
        current.state !== "ready" ||
        current.output?.key !== t.output.key ||
        (current.expires !== null && current.expires <= Date.now())
      )
        throw Object.assign(new Error(copy.transferChanged), { status: 409 });
      const name = t.files[index ?? 0].name;
      res.type("text/plain; charset=utf-8").set("ETag", `"${version}"`);
      if (req.query.download === "1")
        res.set(
          "Content-Disposition",
          `attachment; filename="text.txt"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16))}`,
        );
      res.send(content);
    },
  );
  api.post("/transfers/:id/replace", async (req, res) => {
    if (
      !Array.isArray(req.body.files) ||
      req.body.files.length !== 1 ||
      typeof req.body.revision !== "string"
    )
      throw Object.assign(new Error(copy.invalidTextData), { status: 400 });
    res
      .status(201)
      .json(
        await service.locked(() =>
          service.replaceText(
            req.params.id,
            req.body.files[0],
            req.body.revision,
          ),
        ),
      );
  });
  api.delete("/transfers/:id/files", async (req, res) => {
    if (typeof req.body.revision !== "string")
      return res
        .status(409)
        .json({ error: copy.refreshHistoryBeforeSelectingFiles });
    const result = await service.locked(() =>
      service.removeFiles(req.params.id, req.body.indices, req.body.revision),
    );
    res.json(result);
  });
  const action = (fn) => async (req, res) => {
    await service.locked(async () => {
      try {
        await fn(req, res);
      } catch (error) {
        db.prepare(
          "UPDATE transfers SET error=? WHERE id=? AND state='uploading'",
        ).run(
          error.status ? error.message : copy.s3UploadFailedTryAgain,
          req.params.id,
        );
        throw error;
      }
    });
  };
  api.post(
    "/transfers/:id/files/:index/init",
    action(async (req, res) =>
      res.json(await service.init(req.params.id, Number(req.params.index))),
    ),
  );
  api.post(
    "/transfers/:id/files/:index/parts/:part",
    action(async (req, res) =>
      res.json(
        await service.sign(
          req.params.id,
          Number(req.params.index),
          Number(req.params.part),
        ),
      ),
    ),
  );
  api.post(
    "/transfers/:id/files/:index/complete",
    action(async (req, res) => {
      await service.finishFile(req.params.id, Number(req.params.index));
      res.json({ ok: true });
    }),
  );
  api.post(
    "/transfers/:id/complete",
    action(async (req, res) => {
      await service.finish(req.params.id);
      res.json({ ok: true });
    }),
  );
  api.delete("/transfers/:id", (req, res) => {
    service.delete(req.params.id);
    res.json({ ok: true });
  }); // immediate logical denial, even during ZIP
  return api;
}
