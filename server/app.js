import { mediaType } from "./media.js";
import { siteRoutes } from "./site.js";
import { hosting as createHosting } from "./hosting.js";
import { siteEntry, sitePublished } from "./site-policy.js";
import { archiveTextObject } from "./archive-text.js";
import { ZipArchive } from "archiver";
import { passwordVault } from "./password-vault.js";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { fileTextCandidate, textCandidate, textReader } from "./text.js";
import express from "express";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
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
import {
  hash,
  verify,
  token,
  range,
  archiveName,
  revision,
  safeNames,
} from "./core.js";
export function createApp(
  service,
  env,
  { authLimit = 15, indexHTML, hostingOptions } = {},
) {
  const app = express(),
    db = service.db,
    origin = new URL(env.PUBLIC_URL).origin,
    adminHash = hash(env.ADMIN_PASSWORD),
    secure = origin.startsWith("https:");
  const vault = passwordVault(env);
  const hosting = createHosting(service, env, hostingOptions);
  app.locals.hosting = hosting;
  app.disable("x-powered-by");
  app.set("trust proxy", Number(env.TRUST_PROXY_HOPS || 0));
  app.use(express.json({ limit: "64kb" }), cookieParser());
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'self'; connect-src 'self' " +
        new URL(env.S3_ENDPOINT).origin +
        "; img-src 'self' data:; media-src 'self'; frame-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
    const navigation =
      ["GET", "HEAD"].includes(req.method) &&
      (/text\/html/i.test(req.headers.accept || "") ||
        req.headers["sec-fetch-mode"] === "navigate");
    const originalSend = res.send,
      originalJson = res.json,
      baseCSP = res.get("Content-Security-Policy");
    const showNavigationError = () => {
      res.locals.errorPage = true;
      res.locals.httpErrorStatus = res.statusCode;
      for (const header of [
        "Content-Disposition",
        "Content-Length",
        "Content-Range",
        "Accept-Ranges",
        "ETag",
        "Last-Modified",
      ])
        res.removeHeader(header);
      res.set(
        "Content-Security-Policy",
        req.headers["sec-fetch-dest"] === "iframe"
          ? baseCSP.replace("frame-ancestors 'none'", "frame-ancestors 'self'")
          : baseCSP,
      );
      html(req, res).catch(next);
      return res;
    };
    res.send = function (body) {
      if (
        navigation &&
        res.statusCode >= 400 &&
        !res.headersSent &&
        !res.locals.errorPage
      )
        return showNavigationError();
      return originalSend.call(this, body);
    };
    res.json = function (body) {
      if (
        navigation &&
        res.statusCode >= 400 &&
        !res.headersSent &&
        !res.locals.errorPage
      )
        return showNavigationError();
      return originalJson.call(this, body);
    };
    if (secure) res.set("Strict-Transport-Security", "max-age=31536000");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== origin &&
      !hosting.isCustom(req)
    )
      return res.status(403).json({ error: "Недопустимый Origin" });
    next();
  });
  const limited = rateLimit({
    windowMs: 15 * 60000,
    limit: authLimit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Слишком много попыток. Подождите 15 минут." },
  });
  app.use(
    hosting.middleware(
      (req, res, context) => site.render(req, res, context),
      limited,
    ),
  );
  const options = {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: 12 * 3600000,
  };
  function admin(req, res, next) {
    if (
      !req.cookies.owner ||
      !db
        .prepare("SELECT 1 FROM sessions WHERE id=? AND expires>?")
        .get(req.cookies.owner, Date.now())
    )
      return res.status(401).json({ error: "Нужен вход" });
    next();
  }
  app.post("/api/login", limited, (req, res) => {
    if (
      typeof req.body.password !== "string" ||
      req.body.password.length > 256 ||
      !verify(req.body.password, adminHash)
    )
      return res.status(401).json({ error: "Неверный пароль" });
    const id = token();
    db.prepare("INSERT INTO sessions VALUES(?,?)").run(
      id,
      Date.now() + options.maxAge,
    );
    res.cookie("owner", id, options).json({ ok: true });
  });
  app.post("/api/logout", admin, (req, res) => {
    db.prepare("DELETE FROM sessions WHERE id=?").run(req.cookies.owner);
    res.clearCookie("owner", options).json({ ok: true });
  });
  const api = express.Router();
  api.use(admin);
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
      return res.status(400).json({ error: "Неверный список передач" });
    const unique = [...new Set(ids)];
    if (
      unique.some(
        (id) =>
          !db
            .prepare("SELECT 1 FROM transfers WHERE id=? AND parent IS NULL")
            .get(id),
      )
    )
      return res.status(404).json({ error: "Передача не найдена" });
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
    const { files, ttl = 86400, password = "", oneTime = false } = req.body;
    if (
      typeof password !== "string" ||
      password.length > 256 ||
      typeof oneTime !== "boolean"
    )
      return res.status(400).json({ error: "Неверный пароль" });
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
      return res.status(404).json({ error: "Передача недоступна" });
    res.json({
      password: vault.open(t.id, t.password_cipher),
      hasPassword: !!t.password,
    });
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
      (ttl !== undefined &&
        ![0, 3600, 21600, 86400, 259200, 604800].includes(ttl)) ||
      (password !== undefined &&
        password !== "" &&
        !/^\d{6}$/.test(password)) ||
      (title !== undefined &&
        (typeof title !== "string" || title.length > 180)) ||
      (oneTime !== undefined && typeof oneTime !== "boolean") ||
      (demo !== undefined && typeof demo !== "boolean") ||
      (published !== undefined && typeof published !== "boolean") ||
      (spa !== undefined && typeof spa !== "boolean") ||
      (domain !== undefined && typeof domain !== "string")
    )
      return res.status(400).json({ error: "Неверные настройки" });
    await service.locked(() => {
      const t = service.get(req.params.id);
      if (
        !t ||
        t.parent ||
        !["ready", "empty"].includes(t.state) ||
        (t.expires !== null && t.expires <= Date.now())
      )
        throw Object.assign(new Error("Передача недоступна"), { status: 404 });
      if ((published === true || domain || spa === true) && !siteEntry(t))
        throw Object.assign(new Error("В передаче нет index.html"), {
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
            throw Object.assign(
              new Error("Домен уже привязан к другой передаче"),
              { status: 409 },
            );
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
      return res.status(404).json({ error: "Передача недоступна" });
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
        throw Object.assign(new Error("Передача недоступна"), { status: 404 });
      if (
        index !== undefined &&
        (!/^\d+$/.test(req.params.index) ||
          !Number.isSafeInteger(index) ||
          !t.files[index])
      )
        throw Object.assign(new Error("Файл не найден"), { status: 404 });
      if (
        !(index === undefined
          ? textCandidate(t)
          : fileTextCandidate(t.files[index]))
      )
        throw Object.assign(new Error("Текстовый просмотр недоступен"), {
          status: 415,
        });
      const version = revision(t);
      if (req.headers["if-match"] && req.headers["if-match"] !== `"${version}"`)
        throw Object.assign(
          new Error("Передача изменилась. Откройте редактор заново."),
          { status: 409 },
        );
      const content = await readText(t, index),
        current = service.get(t.id);
      if (
        !current ||
        current.state !== "ready" ||
        current.output?.key !== t.output.key ||
        (current.expires !== null && current.expires <= Date.now())
      )
        throw Object.assign(new Error("Передача изменилась"), { status: 409 });
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
      throw Object.assign(new Error("Неверные данные текста"), { status: 400 });
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
        .json({ error: "Обновите историю перед выбором файлов" });
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
          error.status ? error.message : "Ошибка загрузки S3; можно повторить",
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
  app.use("/api", api);
  function transfer(req) {
    const r = db
      .prepare(
        "SELECT id FROM transfers WHERE token=? UNION ALL SELECT transfer_id AS id FROM share_aliases WHERE token=?",
      )
      .get(req.params.token, req.params.token);
    const t = r && service.get(r.id);
    if (
      !t ||
      (t.one_time && t.consumed) ||
      (siteEntry(t) &&
        !t.site_published &&
        !(
          req.path.startsWith("/preview/") &&
          req.cookies.owner &&
          db
            .prepare("SELECT 1 FROM sessions WHERE id=? AND expires>?")
            .get(req.cookies.owner, Date.now())
        )) ||
      !["ready", "empty"].includes(t.state) ||
      (t.expires !== null && t.expires <= Date.now())
    )
      throw Object.assign(new Error("Передача недоступна или срок истёк"), {
        status: 404,
      });
    if (t.files.length > 1)
      t.output.name = t.title
        ? safeNames([{ name: t.title, size: 0 }])[0].name.replace(
            /(?:\.zip)?$/i,
            ".zip",
          )
        : archiveName(t.created);
    return t;
  }
  const grants = new Map();
  const site = siteRoutes(app, service, env, transfer);
  const downloadClaims = new Map();
  function claimDownload(t, res, complete = true) {
    if (!t.one_time) return;
    if (downloadClaims.has(t.id))
      throw Object.assign(new Error("Скачивание уже выполняется"), {
        status: 409,
      });
    const claim = Symbol();
    downloadClaims.set(t.id, claim);
    const release = () => {
      if (downloadClaims.get(t.id) === claim) downloadClaims.delete(t.id);
    };
    res.once("finish", () => {
      if (complete && res.statusCode >= 200 && res.statusCode < 300) {
        const current = service.get(t.id);
        if (
          current?.output?.key === t.output.key &&
          current.password === t.password
        )
          db.prepare(
            "UPDATE transfers SET consumed=1 WHERE id=? AND one_time=1 AND state='ready'",
          ).run(t.id);
      }
      release();
    });
    res.once("close", release);
  }
  const readText = textReader(service.store);
  const rawCookie = (req, res, t, grant) => {
    res.cookie("grant_" + t.id, grant, {
      ...options,
      path: "/preview/" + req.params.token,
      maxAge: Math.max(0, grants.get(grant).expires - Date.now()),
    });
    return res.cookie("grant_" + t.id, grant, {
      ...options,
      path: "/raw/" + req.params.token,
      maxAge: Math.max(0, grants.get(grant).expires - Date.now()),
    });
  };
  function allowed(req, t) {
    const g = grants.get(req.cookies["grant_" + t.id]);
    return (
      !t.password ||
      (g?.id === t.id && g.password === t.password && g.expires > Date.now())
    );
  }
  app.post("/public/:token/unlock", limited, (req, res) => {
    const t = transfer(req);
    if (
      typeof req.body.password !== "string" ||
      req.body.password.length > 256 ||
      !verify(req.body.password, t.password || "")
    )
      return res.status(401).json({ error: "Неверный пароль" });
    const grant = token();
    for (const [k, v] of grants) if (v.expires <= Date.now()) grants.delete(k);
    if (grants.size > 10000)
      return res.status(503).json({ error: "Повторите позже" });
    grants.set(grant, {
      id: t.id,
      password: t.password,
      expires: Math.min(t.expires ?? Infinity, Date.now() + 12 * 3600000),
    });
    res.cookie("grant_" + t.id, grant, {
      ...options,
      path: "/public/" + req.params.token,
    });
    rawCookie(req, res, t, grant);
    res.json({ ok: true });
  });
  app.get("/public/:token", (req, res) => {
    const t = transfer(req);
    if (t.password && allowed(req, t))
      rawCookie(req, res, t, req.cookies["grant_" + t.id]);
    res.json(
      allowed(req, t)
        ? {
            locked: false,
            title: t.title || "",
            shareUrl: hosting.shareURL(t),
            demo: !!t.demo,
            hasSite: !!siteEntry(t),
            published: sitePublished(t),
            site: sitePublished(t) ? site(t) : null,
            oneTime: !!t.one_time,
            preview: textCandidate(t),
            media:
              t.files.length === 1 ? mediaType(t.files[0])?.[0] || null : null,
            etag: t.output?.etag,
            files: t.files.map(({ name, size }) => ({
              name,
              size,
              preview: fileTextCandidate({ name, size }),
              media: mediaType({ name })?.[0] || null,
            })),
            expires: t.expires,
            size: t.output.size,
            name: t.output.name,
          }
        : { locked: true },
    );
  });
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
        indices.length > 100 ||
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
      "/api/transfers/:id/media/:index",
    ],
    async (req, res) => {
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
        throw Object.assign(new Error("Передача недоступна"), { status: 404 });
      if (!privateFile && !allowed(req, t))
        return raw
          ? res.status(401).type("text/plain").send("Нужен пароль передачи")
          : res.status(401).json({ error: "Нужен пароль передачи" });
      if (!t.output?.key)
        return raw
          ? res
              .status(409)
              .type("text/plain")
              .send("В передаче пока нет файлов")
          : res.status(409).json({ error: "В передаче пока нет файлов" });
      let text;
      const member = req.params.index !== undefined;
      const index = member ? Number(req.params.index) : undefined;
      if (
        member &&
        (!/^\d+$/.test(req.params.index) ||
          !Number.isSafeInteger(index) ||
          !t.files[index])
      )
        throw Object.assign(new Error("Файл не найден"), { status: 404 });
      if (
        preview &&
        ((index === undefined && t.files.length !== 1) ||
          !mediaType(t.files[index ?? 0]))
      )
        throw Object.assign(new Error("Нет предпросмотра"), { status: 415 });
      if (raw) {
        if (!(member ? fileTextCandidate(t.files[index]) : textCandidate(t)))
          throw Object.assign(new Error("Текстовый просмотр недоступен"), {
            status: 415,
          });
        text = await readText(t, index);
        const current = transfer(req);
        if (current.output?.key !== t.output.key)
          throw Object.assign(new Error("Передача обновилась"), {
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
        return res
          .status(416)
          .set("Content-Range", `bytes */${out.size}`)
          .end();
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
    },
  );
  let index = indexHTML;
  async function html(req, res) {
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
  app.get(["/", "/index.html", "/t/:token"], html);
  app.get(/^\/[A-Za-z0-9]{6}$/, html);
  app.use(express.static("dist", { index: false }));
  app.use((req, res) => res.status(404).json({ error: "Страница не найдена" }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return res.destroy();
    if (req.path.startsWith("/raw/"))
      return res
        .status(err.status || 503)
        .type("text/plain")
        .send(err.status ? err.message : "Повторите позже");
    res.status(err.status || 503).json({
      code: err.name || "Error",
      error: err.status
        ? err.message
        : "Операция временно недоступна. Повторите позже.",
    });
  });
  return app;
}
