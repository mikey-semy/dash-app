import express from "express";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { copy } from "#common/copy.js";
import { installAuthentication } from "./auth.js";
import { createOwnerApi } from "./owner-api.js";
import { registerPublicApi } from "./public-api.js";
import { installHttpPolicy } from "./http-policy.js";
import { createPageRenderer } from "./pages.js";
import { legacyAssets } from "./asset-cache.js";
import { hosting as createHosting } from "./hosting.js";
import { passwordVault } from "./password-vault.js";
import { textReader } from "./text.js";
export function createApp(
  service,
  env,
  {
    authLimit = 15,
    indexHTML,
    hostingOptions,
    assetDirectory = "assets-cache",
  } = {},
) {
  const app = express(),
    db = service.db,
    origin = new URL(env.PUBLIC_URL).origin,
    secure = origin.startsWith("https:");
  const vault = passwordVault(env);
  const hosting = createHosting(service, env, hostingOptions);
  app.locals.hosting = hosting;
  app.disable("x-powered-by");
  app.set("trust proxy", Number(env.TRUST_PROXY_HOPS || 0));
  app.use(express.json({ limit: "64kb" }), cookieParser());
  const html = createPageRenderer(indexHTML);
  installHttpPolicy(app, { env, hosting, renderPage: html });
  const limited = rateLimit({
    windowMs: 15 * 60000,
    limit: authLimit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: copy.tooManyAttemptsWait15Minutes },
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
  const { requireOwner, isOwner } = installAuthentication(app, {
    db,
    password: env.ADMIN_PASSWORD,
    cookieOptions: options,
    limited,
  });
  const readText = textReader(service.store);
  app.use(
    "/api",
    createOwnerApi({ service, origin, hosting, vault, requireOwner, readText }),
  );

  const site = registerPublicApi(app, {
    service,
    env,
    hosting,
    isOwner,
    requireOwner,
    cookieOptions: options,
    limited,
    readText,
  });
  app.get(["/", "/index.html", "/t/:token"], html);
  app.get(/^\/[A-Za-z0-9]{6}$/, html);
  app.use(express.static("dist", { index: false }));
  app.use("/assets", legacyAssets(assetDirectory));
  app.use((req, res) => res.status(404).json({ error: copy.pageNotFound }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return res.destroy();
    if (req.path.startsWith("/raw/"))
      return res
        .status(err.status || 503)
        .type("text/plain")
        .send(err.status ? err.message : copy.tryAgainLater);
    res.status(err.status || 503).json({
      code: err.name || "Error",
      error: err.status ? err.message : copy.operationUnavailable,
    });
  });
  return app;
}
