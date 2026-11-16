import { copy } from "../shared/copy.js";

export function installHttpPolicy(app, { env, hosting, renderPage }) {
  const origin = new URL(env.PUBLIC_URL).origin,
    secure = origin.startsWith("https:");
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
      renderPage(req, res).catch(next);
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
      return res.status(403).json({ error: copy.invalidOrigin });
    next();
  });
}
