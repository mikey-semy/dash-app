import express from "express";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { pipeline } from "node:stream/promises";
import { hash, verify, token, range } from "./core.js";
export function createApp(service, env) {
  const app = express(),
    db = service.db,
    origin = new URL(env.PUBLIC_URL).origin,
    adminHash = hash(env.ADMIN_PASSWORD),
    secure = origin.startsWith("https:");
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
    limit: 15,
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
    return {
      id: t.id,
      state: t.state,
      created: t.created,
      ready: t.ready,
      expires: t.expires,
      ttl: t.ttl,
      files: t.files.map(({ name, size }) => ({ name, size })),
      size: t.files.reduce((n, f) => n + f.size, 0),
      error: t.error,
      url:
        t.state === "ready" && t.expires > Date.now()
          ? `${origin}/t/${t.token}`
          : null,
    };
  }
  api.get("/transfers", (req, res) =>
    res.json(
      db
        .prepare("SELECT id FROM transfers ORDER BY created DESC")
        .all()
        .map((r) => publicOwner(service.get(r.id))),
    ),
  );
  api.post("/transfers", async (req, res) => {
    const { files, ttl = 86400, password = "" } = req.body;
    if (typeof password !== "string" || password.length > 256)
      return res.status(400).json({ error: "Неверный пароль" });
    const id = await service.locked(() => service.create(files, ttl, password));
    res.status(201).json({ id });
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
      .prepare("SELECT id FROM transfers WHERE token=?")
      .get(req.params.token);
    const t = r && service.get(r.id);
    if (!t || t.state !== "ready" || t.expires <= Date.now())
      throw Object.assign(new Error("Передача недоступна или срок истёк"), {
        status: 404,
      });
    return t;
  }
  const grants = new Map();
  function allowed(req, t) {
    const g = grants.get(req.cookies["grant_" + t.id]);
    return !t.password || (g?.id === t.id && g.expires > Date.now());
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
      expires: Math.min(t.expires, Date.now() + 12 * 3600000),
    });
    res
      .cookie("grant_" + t.id, grant, {
        ...options,
        path: "/public/" + t.token,
      })
      .json({ ok: true });
  });
  app.get("/public/:token", (req, res) => {
    const t = transfer(req);
    res.json(
      allowed(req, t)
        ? {
            locked: false,
            files: t.files.map(({ name, size }) => ({ name, size })),
            expires: t.expires,
            size: t.output.size,
            name: t.output.name,
          }
        : { locked: true },
    );
  });
  app.all("/public/:token/download", async (req, res) => {
    if (!["GET", "HEAD"].includes(req.method)) return res.sendStatus(405);
    const t = transfer(req);
    if (!allowed(req, t))
      return res.status(401).json({ error: "Нужен пароль передачи" });
    const out = t.output,
      modified = new Date(t.ready).toUTCString();
    res.set({
      "Accept-Ranges": "bytes",
      ETag: out.etag,
      "Last-Modified": modified,
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="download${t.files.length > 1 ? ".zip" : ""}"; filename*=UTF-8''${encodeURIComponent(out.name).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16))}`,
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
      return res.status(416).set("Content-Range", `bytes */${out.size}`).end();
    const length = r ? r.end - r.start + 1 : out.size;
    res.status(r ? 206 : 200).set("Content-Length", String(length));
    if (r) res.set("Content-Range", `bytes ${r.start}-${r.end}/${out.size}`);
    if (req.method === "HEAD") return res.end();
    const object = await service.store.get(
      out.key,
      r ? { Range: `bytes=${r.start}-${r.end}` } : {},
    );
    try {
      await pipeline(object.Body, res);
    } catch {
      res.destroy();
    }
  });
  app.use(express.static("dist", { index: false }));
  app.get(["/", "/t/:token"], (req, res) =>
    res.sendFile("index.html", { root: "dist" }),
  );
  app.use((err, req, res, next) => {
    if (res.headersSent) return res.destroy();
    res.status(err.status || 503).json({
      error: err.status
        ? err.message
        : "Операция временно недоступна. Повторите позже.",
    });
  });
  return app;
}
