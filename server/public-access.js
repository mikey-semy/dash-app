import { copy } from "../shared/copy.js";
import { verify, token, archiveName, safeNames } from "./core.js";
import { siteEntry } from "./site-policy.js";

export function createPublicAccess({ service, isOwner, cookieOptions }) {
  const db = service.db;
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
        !(req.path.startsWith("/preview/") && isOwner(req))) ||
      !["ready", "empty"].includes(t.state) ||
      (t.expires !== null && t.expires <= Date.now())
    )
      throw Object.assign(new Error(copy.transferUnavailableOrExpired), {
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
  const downloadClaims = new Map();
  function claimDownload(t, res, complete = true) {
    if (!t.one_time) return;
    if (downloadClaims.has(t.id))
      throw Object.assign(new Error(copy.downloadAlreadyInProgress), {
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
  const rawCookie = (req, res, t, grant) => {
    res.cookie("grant_" + t.id, grant, {
      ...cookieOptions,
      path: "/preview/" + req.params.token,
      maxAge: Math.max(0, grants.get(grant).expires - Date.now()),
    });
    return res.cookie("grant_" + t.id, grant, {
      ...cookieOptions,
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
  function unlock(req, res) {
    const t = transfer(req);
    if (
      typeof req.body.password !== "string" ||
      req.body.password.length > 256 ||
      !verify(req.body.password, t.password || "")
    )
      return res.status(401).json({ error: copy.incorrectPassword });
    const grant = token();
    for (const [k, v] of grants) if (v.expires <= Date.now()) grants.delete(k);
    if (grants.size > 10000)
      return res.status(503).json({ error: copy.tryAgainLater });
    grants.set(grant, {
      id: t.id,
      password: t.password,
      expires: Math.min(t.expires ?? Infinity, Date.now() + 12 * 3600000),
    });
    res.cookie("grant_" + t.id, grant, {
      ...cookieOptions,
      path: "/public/" + req.params.token,
    });
    rawCookie(req, res, t, grant);
    res.json({ ok: true });
  }
  return { transfer, allowed, rawCookie, claimDownload, unlock };
}
