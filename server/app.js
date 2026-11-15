import { passwordVault } from "./password-vault.js";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { fileTextCandidate, textCandidate, textReader } from "./text.js";
import express from "express";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { pipeline } from "node:stream/promises";
import { hash, verify, token, range, archiveName, revision } from "./core.js";
export function createApp(service, env, { authLimit = 15 } = {}) {
  const app = express(),
    db = service.db,
    origin = new URL(env.PUBLIC_URL).origin,
    adminHash = hash(env.ADMIN_PASSWORD),
    secure = origin.startsWith("https:");
  const vault = passwordVault(env);
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
        "; img-src 'self' data:; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
    if (secure) res.set("Strict-Transport-Security", "max-age=31536000");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== origin
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
      etag: t.output?.etag,
      state: t.state,
      created: t.created,
      ready: t.ready,
      expires: t.expires,
      ttl: t.ttl,
      hasPassword: !!t.password,
      files: t.files.map(({ name, size }) => ({
        name,
        size,
        preview: fileTextCandidate({ name, size }),
      })),
      size: t.files.reduce((n, f) => n + f.size, 0),
      error: t.error,
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
          "SELECT id FROM transfers WHERE parent IS NULL AND hidden=0 ORDER BY created DESC",
        )
        .all()
        .map((r) => publicOwner(service.get(r.id))),
    ),
  );
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
    const { files, ttl = 86400, password = "" } = req.body;
    if (typeof password !== "string" || password.length > 256)
      return res.status(400).json({ error: "Неверный пароль" });
    const id = await service.locked(() => service.create(files, ttl, password));
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
    const { ttl, password } = req.body;
    if (
      (ttl === undefined && password === undefined) ||
      (ttl !== undefined &&
        ![0, 3600, 21600, 86400, 259200, 604800].includes(ttl)) ||
      (password !== undefined && password !== "" && !/^\d{6}$/.test(password))
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
      if (password !== undefined)
        db.prepare(
          "UPDATE transfers SET password=?,password_cipher=? WHERE id=?",
        ).run(
          password ? hash(password) : null,
          vault.seal(t.id, password),
          t.id,
        );
      if (ttl !== undefined)
        db.prepare("UPDATE transfers SET ttl=?,expires=? WHERE id=?").run(
          ttl,
          ttl ? Date.now() + ttl * 1000 : null,
          t.id,
        );
    });
    res.json(publicOwner(service.get(req.params.id)));
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
      !["ready", "empty"].includes(t.state) ||
      (t.expires !== null && t.expires <= Date.now())
    )
      throw Object.assign(new Error("Передача недоступна или срок истёк"), {
        status: 404,
      });
    if (t.files.length > 1) t.output.name = archiveName(t.created);
    return t;
  }
  const grants = new Map();
  const readText = textReader(service.store);
  const rawCookie = (req, res, t, grant) =>
    res.cookie("grant_" + t.id, grant, {
      ...options,
      path: "/raw/" + req.params.token,
      maxAge: Math.max(0, grants.get(grant).expires - Date.now()),
    });
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
            preview: textCandidate(t),
            etag: t.output?.etag,
            files: t.files.map(({ name, size }) => ({
              name,
              size,
              preview: fileTextCandidate({ name, size }),
            })),
            expires: t.expires,
            size: t.output.size,
            name: t.output.name,
          }
        : { locked: true },
    );
  });
  app.all(
    [
      "/public/:token/download",
      "/raw/:token",
      "/raw/:token/:index",
      "/public/:token/files/:index/download",
    ],
    async (req, res) => {
      const raw = req.path.startsWith("/raw/");
      if (!["GET", "HEAD"].includes(req.method))
        return raw
          ? res.status(405).type("text/plain").send("Method Not Allowed")
          : res.sendStatus(405);
      const t = transfer(req);
      if (!allowed(req, t))
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
      if (raw || member) {
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
        "Accept-Ranges": "bytes",
        ETag: out.etag,
        "Last-Modified": modified,
        "Content-Type": raw
          ? "text/plain; charset=utf-8"
          : "application/octet-stream",
        "Content-Disposition": `${raw ? "inline" : "attachment"}; filename="${t.files.length > 1 ? out.name : "download"}"; filename*=UTF-8''${encodeURIComponent(out.name).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16))}`,
      });
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
      if (raw || member)
        return res.end(r ? text.subarray(r.start, r.end + 1) : text);
      const object = await service.store.get(
        out.key,
        r ? { Range: `bytes=${r.start}-${r.end}` } : {},
      );
      try {
        await pipeline(object.Body, res);
      } catch {
        res.destroy();
      }
    },
  );
  let index;
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
    res.type("html").send(index.replace("__CSP_NONCE__", nonce));
  }
  app.get(["/", "/index.html", "/t/:token"], html);
  app.get(/^\/[A-Za-z0-9]{6}$/, html);
  app.use(express.static("dist", { index: false }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return res.destroy();
    if (req.path.startsWith("/raw/"))
      return res
        .status(err.status || 503)
        .type("text/plain")
        .send(err.status ? err.message : "Повторите позже");
    res.status(err.status || 503).json({
      error: err.status
        ? err.message
        : "Операция временно недоступна. Повторите позже.",
    });
  });
  return app;
}
