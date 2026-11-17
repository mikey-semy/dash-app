import { statusPage, statusIcons } from "./status-page.js";
import { copy } from "#common/copy.js";
import { domainToASCII } from "node:url";
import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";
import https from "node:https";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { writeFile, rename, readFile } from "node:fs/promises";
import express from "express";
import { siteEntry, siteAlive } from "./site-policy.js";
import { verify } from "./core.js";

export function normalizeDomain(value, canonical = "") {
  if (typeof value !== "string")
    throw Object.assign(Error(copy.invalidDomain), { status: 400 });
  if (!value.trim()) return null;
  if (/[\s\/:\\@?#]/.test(value.trim()))
    throw Object.assign(Error(copy.enterADomainOnly), { status: 400 });
  const domain = domainToASCII(value.trim().toLowerCase().replace(/\.$/, ""));
  if (
    !domain ||
    domain.length > 253 ||
    isIP(domain) ||
    domain === canonical ||
    !domain.includes(".") ||
    domain
      .split(".")
      .some((part) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part)) ||
    /^\d+$/.test(domain.split(".").pop())
  )
    throw Object.assign(Error(copy.domainFormatHint), {
      status: 400,
    });
  return domain;
}
const equal = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
async function resolveIPs(domain) {
  const resolver = new Resolver({ timeout: 2000, tries: 1 });
  const results = await Promise.allSettled([
    resolver.resolve4(domain),
    resolver.resolve6(domain),
  ]);
  return results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
}
async function probeDomain(domain, address, proof) {
  return new Promise((resolve) => {
    const request = https.get(
      {
        hostname: address,
        servername: domain,
        port: 443,
        path: "/.well-known/du-site",
        headers: { Host: domain },
        rejectUnauthorized: true,
        timeout: 3000,
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
          if (body.length > 1024) request.destroy();
        });
        response.on("end", () => {
          try {
            resolve(
              response.statusCode === 200 && JSON.parse(body).proof === proof,
            );
          } catch {
            resolve(false);
          }
        });
        response.on("error", () => resolve(false));
      },
    );
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(false));
  });
}
export function hosting(service, env, options = {}) {
  const canonical = new URL(env.PUBLIC_URL),
    states = new Map();
  const mac = (purpose, value) =>
    createHmac("sha256", env.ADMIN_PASSWORD + "\0" + (env.S3_SECRET_KEY || ""))
      .update(purpose + "\0" + JSON.stringify(value))
      .digest("base64url");
  const proof = (t) => mac("domain", [t.id, t.site_domain]);
  const cookieName = (t) => "du_site_" + t.id;
  const cookieValue = (t, expires) =>
    expires +
    "." +
    mac("site-cookie", [t.id, t.site_epoch || 0, t.password, expires]);
  function authorized(req, t) {
    if (!t.password) return true;
    const value = req.cookies?.[cookieName(t)] || "",
      expires = Number(value.split(".")[0]);
    return (
      Number.isSafeInteger(expires) &&
      expires > Date.now() &&
      equal(value, cookieValue(t, expires))
    );
  }
  function host(req) {
    try {
      return new URL("http://" + req.headers.host).hostname.toLowerCase();
    } catch {
      return "";
    }
  }
  function record(domain) {
    const rows = service.db
      .prepare(
        "SELECT id FROM transfers WHERE parent IS NULL AND site_domain=? ORDER BY CASE WHEN state='ready' THEN 0 ELSE 1 END,created DESC",
      )
      .all(domain);
    return rows.length ? service.get(rows[0].id) : null;
  }
  const isCustom = (req) => {
    const name = host(req);
    return (
      !!name &&
      name !== canonical.hostname &&
      name !== "localhost" &&
      !isIP(name)
    );
  };
  const ownPost = (req) =>
    isCustom(req) &&
    req.path === "/.du/unlock" &&
    req.headers.origin === canonical.protocol + "//" + host(req) &&
    !!record(host(req));
  const status = (t) =>
    !t.site_domain
      ? { state: "idle" }
      : states.get(t.id)?.domain === t.site_domain
        ? states.get(t.id)
        : {
            domain: t.site_domain,
            state: env.SITE_DOMAINS_EXPORT ? "dns" : "unconfigured",
          };
  const resolve = options.resolve || resolveIPs,
    probe = options.probe || probeDomain;
  let refreshing,
    dirty = false;
  async function refresh() {
    if (refreshing) {
      dirty = true;
      return refreshing;
    }
    refreshing = (async () => {
      if (!env.SITE_DOMAINS_EXPORT && !options.exportDomains) return;
      const target = env.SITE_TARGET_IPS?.trim()
        ? env.SITE_TARGET_IPS.split(",")
            .map((v) => v.trim())
            .filter(Boolean)
        : await resolve(canonical.hostname);
      const seen = new Set(),
        rows = service.db
          .prepare(
            "SELECT id FROM transfers WHERE parent IS NULL AND site_domain IS NOT NULL ORDER BY CASE WHEN state='ready' THEN 0 ELSE 1 END,created DESC",
          )
          .all();
      const candidates = rows
        .map((row) => service.get(row.id))
        .filter((t) => {
          if (seen.has(t.site_domain)) return false;
          seen.add(t.site_domain);
          return true;
        });
      const accepted = [];
      for (let offset = 0; offset < candidates.length; offset += 4)
        await Promise.all(
          candidates.slice(offset, offset + 4).map(async (t) => {
            let next = { domain: t.site_domain, state: "dns" };
            try {
              const ips = await resolve(t.site_domain);
              if (
                !target.length ||
                !ips.length ||
                ips.some((ip) => !target.includes(ip))
              )
                next.error = copy.domainDnsMustPointOnlyToTheDuServer;
              else {
                accepted.push(t.site_domain);
                let blocked = false;
                if (env.SITE_DOMAINS_STATUS) {
                  try {
                    const data = JSON.parse(
                      await readFile(env.SITE_DOMAINS_STATUS, "utf8"),
                    );
                    blocked = data[t.site_domain] === "reserved";
                  } catch {}
                }
                if (blocked)
                  next = {
                    ...next,
                    state: "error",
                    error: copy.domainReserved,
                  };
                else
                  next = {
                    ...next,
                    state: (await probe(t.site_domain, ips[0], proof(t)))
                      ? "ready"
                      : "tls",
                  };
              }
            } catch (error) {
              next.error = error.message;
            }
            if (service.get(t.id)?.site_domain !== t.site_domain) {
              dirty = true;
              return;
            }
            if (next.error && states.get(t.id)?.error !== next.error)
              console.error("[DU] domain", t.site_domain, next.error);
            states.set(t.id, next);
          }),
        );
      const domains = accepted
        .filter((domain) => record(domain)?.site_domain === domain)
        .sort();
      if (options.exportDomains) await options.exportDomains(domains);
      else {
        const file = env.SITE_DOMAINS_EXPORT,
          content = JSON.stringify({ version: 1, domains });
        if ((await readFile(file, "utf8").catch(() => null)) !== content) {
          await writeFile(file + ".tmp", content, { mode: 0o600 });
          await rename(file + ".tmp", file);
        }
      }
    })().finally(() => {
      refreshing = null;
      if (dirty) {
        dirty = false;
        queueMicrotask(() =>
          refresh().catch((error) =>
            console.error("[DU] domain refresh", error),
          ),
        );
      }
    });
    return refreshing;
  }
  function page(
    req,
    res,
    { status = 404, password = false, error = false } = {},
  ) {
    res.locals.errorPage = true;
    const nonce = randomBytes(18).toString("base64");
    res
      .status(status)
      .set(
        "Content-Security-Policy",
        `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
      )
      .type("html");
    const { cross, eye, enter } = statusIcons;
    const close = `<a class="close" aria-label="${copy.backToUpload}" href="${canonical.origin}/">${cross}</a>`;
    const body = password
      ? `<form method="post" action="/.du/unlock"><input type="hidden" name="next" value="${escape(req.originalUrl || "/")}"><input name="password" id="password" aria-label="${copy.password}" type="password" maxlength="256" inputmode="numeric" autocomplete="current-password" autofocus><span id="error" role="img" aria-label="${copy.incorrectPassword}" ${error ? "" : "hidden"}>${cross}</span><button type="button" id="reveal" aria-label="${copy.showPassword}">${eye}</button><button type="submit" aria-label="${copy.signIn}">${enter}</button></form>`
      : `<a class="unavailable" aria-label="${copy.backToUpload}" href="${canonical.origin}/">${cross}</a>`;
    const script = password
      ? `const p=document.getElementById('password');p.addEventListener('input',()=>document.getElementById('error').hidden=true);document.getElementById('reveal').onclick=()=>{p.type=p.type==='password'?'text':'password';document.getElementById('slash').setAttribute('visibility',p.type==='text'?'visible':'hidden')};${error ? "console.error(" + JSON.stringify("[DU] " + copy.incorrectSitePassword) + ");" : ""}`
      : "console.error(" +
        JSON.stringify("[DU] " + copy.siteUnavailable) +
        ");";
    res.send(
      statusPage({
        nonce,
        title: password ? copy.password : copy.siteUnavailable,
        body: close + body,
        script,
      }),
    );
  }

  function middleware(render, limited) {
    const form = express.urlencoded({ extended: false, limit: "2kb" });
    return (req, res, next) => {
      if (!isCustom(req)) return next();
      const t = record(host(req));
      if (!t) return page(req, res);
      if (
        req.path === "/.well-known/du-site" &&
        ["GET", "HEAD"].includes(req.method)
      )
        return res.json({ proof: proof(t) });
      if (!siteAlive(t) || !siteEntry(t)) return page(req, res);
      if (!t.site_published) return page(req, res);
      if (req.method === "POST" && req.path === "/.du/unlock")
        return limited(req, res, () =>
          form(req, res, () => {
            if (!ownPost(req)) return page(req, res, { status: 403 });
            const pin = req.body?.password;
            if (
              typeof pin !== "string" ||
              pin.length > 256 ||
              !verify(pin, t.password || "")
            )
              return page(req, res, {
                status: 401,
                password: true,
                error: true,
              });
            const expires = Math.min(
              t.expires ?? Infinity,
              Date.now() + 12 * 3600000,
            );
            res.cookie(cookieName(t), cookieValue(t, expires), {
              httpOnly: true,
              secure: canonical.protocol === "https:",
              sameSite: "strict",
              path: "/",
              expires: new Date(expires),
            });
            let path = req.body.next || "/";
            if (
              typeof path !== "string" ||
              !path.startsWith("/") ||
              path.startsWith("//") ||
              /[\\\r\n]/.test(path)
            )
              path = "/";
            return res.redirect(303, path);
          }),
        );
      if (!["GET", "HEAD"].includes(req.method))
        return page(req, res, { status: 405 });
      if (!authorized(req, t))
        return /text\/html/.test(req.headers.accept || "")
          ? page(req, res, { status: 401, password: true })
          : res.status(401).type("text/plain").send(copy.passwordRequired);
      let path;
      try {
        path = decodeURIComponent(req.path).replace(/^\//, "");
      } catch {
        return page(req, res);
      }
      return render(req, res, { transfer: t, path });
    };
  }
  return {
    canonical: canonical.hostname,
    normalize: (value) => normalizeDomain(value, canonical.hostname),
    status,
    shareURL: (t) =>
      t.site_domain && siteEntry(t) && status(t).state === "ready"
        ? "https://" + t.site_domain + "/"
        : canonical.origin + "/" + t.token,
    refresh,
    isCustom,
    ownPost,
    middleware,
    record,
  };
}
