import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
export const PART = 8 * 1024 * 1024,
  LIMIT = 2_000_000_000,
  QUOTA = 20_000_000_000;
export const token = () => randomBytes(32).toString("base64url");
export function hash(password) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 32).toString("hex");
}
export function verify(password, value) {
  try {
    const [s, h] = value.split(":");
    return timingSafeEqual(Buffer.from(h, "hex"), scryptSync(password, s, 32));
  } catch {
    return false;
  }
}
export function safeNames(files) {
  const used = new Set();
  return files.map((f) => {
    let name =
      f.name
        .normalize("NFC")
        .replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, "_")
        .replace(/^\.+/, "_")
        .replace(/[. ]+$/, "") || "file";
    name = Array.from(name).slice(0, 180).join("");
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
      name = "_" + name;
    const base = name;
    let n = 1;
    while (used.has(name.toLowerCase())) name = `${n++}_${base}`;
    used.add(name.toLowerCase());
    return { ...f, name };
  });
}
export function reservation(files) {
  const sum = files.reduce((n, f) => n + f.size, 0);
  return (
    sum +
    (files.length > 1
      ? sum +
        files.reduce((n, f) => n + Buffer.byteLength(f.name) * 2 + 256, 0) +
        65536
      : 0)
  );
}
export function openDB(path) {
  const db = new DatabaseSync(path);
  db.exec(
    `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS transfers(id TEXT PRIMARY KEY, token TEXT UNIQUE, state TEXT, created INTEGER, ready INTEGER, expires INTEGER, ttl INTEGER, password TEXT, files TEXT, reserved INTEGER, output TEXT, error TEXT, attempts INTEGER DEFAULT 0); CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, expires INTEGER);`,
  );
  return db;
}
export function insertTransfer(db, files, ttl, password) {
  if (
    !Array.isArray(files) ||
    !files.length ||
    files.length > 100 ||
    files.some(
      (f) =>
        !f ||
        typeof f.name !== "string" ||
        !Number.isSafeInteger(f.size) ||
        f.size < 0,
    ) ||
    files.reduce((n, f) => n + f.size, 0) > LIMIT
  )
    throw Object.assign(new Error("До 100 файлов, суммарно до 2 ГБ"), {
      status: 400,
    });
  if (![3600, 21600, 86400, 259200, 604800].includes(ttl))
    throw Object.assign(new Error("Неверный срок"), { status: 400 });
  const clean = safeNames(files.map(({ name, size }) => ({ name, size })));
  const id = token(),
    reserved = reservation(clean);
  db.exec("BEGIN IMMEDIATE");
  try {
    const used = db
      .prepare("SELECT coalesce(sum(reserved),0) n FROM transfers")
      .get().n;
    if (used + reserved > QUOTA)
      throw Object.assign(new Error("Недостаточно места"), { status: 409 });
    db.prepare(
      "INSERT INTO transfers(id,token,state,created,ttl,password,files,reserved) VALUES(?,?,?,?,?,?,?,?)",
    ).run(
      id,
      token(),
      "uploading",
      Date.now(),
      ttl,
      password ? hash(password) : null,
      JSON.stringify(
        clean.map((f, i) => ({
          ...f,
          key: `${id}/source/${i}`,
          upload: null,
          done: false,
        })),
      ),
      reserved,
    );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return id;
}
export function row(db, id) {
  const r = db.prepare("SELECT * FROM transfers WHERE id=?").get(id);
  return (
    r && {
      ...r,
      files: JSON.parse(r.files),
      output: r.output ? JSON.parse(r.output) : null,
    }
  );
}
export function range(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!m || !size || (!m[1] && !m[2])) return false;
  let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  let end = m[1]
    ? m[2]
      ? Math.min(Number(m[2]), size - 1)
      : size - 1
    : size - 1;
  return Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start <= end &&
    start < size
    ? { start, end }
    : false;
}
