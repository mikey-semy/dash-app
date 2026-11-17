import { copy } from "#common/copy.js";
import { hash, verify, token } from "./core.js";

export function installAuthentication(
  app,
  { db, password, cookieOptions, limited },
) {
  const adminHash = hash(password);
  const isOwner = (req) =>
    !!req.cookies.owner &&
    !!db
      .prepare("SELECT 1 FROM sessions WHERE id=? AND expires>?")
      .get(req.cookies.owner, Date.now());
  function requireOwner(req, res, next) {
    if (!isOwner(req))
      return res.status(401).json({ error: copy.signInRequired });
    next();
  }
  app.post("/api/login", limited, (req, res) => {
    if (
      typeof req.body.password !== "string" ||
      req.body.password.length > 256 ||
      !verify(req.body.password, adminHash)
    )
      return res.status(401).json({ error: copy.incorrectPassword });
    const id = token();
    db.prepare("INSERT INTO sessions VALUES(?,?)").run(
      id,
      Date.now() + cookieOptions.maxAge,
    );
    res.cookie("owner", id, cookieOptions).json({ ok: true });
  });
  app.post("/api/logout", requireOwner, (req, res) => {
    db.prepare("DELETE FROM sessions WHERE id=?").run(req.cookies.owner);
    res.clearCookie("owner", cookieOptions).json({ ok: true });
  });
  return { requireOwner, isOwner };
}
