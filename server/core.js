import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
export const PART = 8 * 1024 * 1024,
  LIMIT = 2_000_000_000,
  QUOTA = 20_000_000_000;
export const revision = (t) =>
  createHash("sha256")
    .update(t.output?.key || "empty")
    .digest("base64url");
export const token = () => randomBytes(32).toString("base64url");
const alphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const shareToken = () =>
  Array.from({ length: 6 }, () => alphabet[randomInt(62)]).join("");
function uniqueShareToken(db) {
  let value;
  do {
    value = shareToken();
  } while (
    db
      .prepare(
        "SELECT 1 FROM transfers WHERE token=? UNION ALL SELECT 1 FROM share_aliases WHERE token=?",
      )
      .get(value, value)
  );
  return value;
}
const archiveDateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
export function archiveName(created) {
  const date = new Date(created),
    p = Object.fromEntries(
      archiveDateFormat
        .formatToParts(date)
        .map(({ type, value }) => [type, value]),
    );
  return `files-${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}${String(date.getUTCMilliseconds()).padStart(3, "0")}.zip`;
}
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
  const segment = (value) => {
    let name =
      value
        .normalize("NFC")
        .replace(/[\\:*?"<>|\x00-\x1f\x7f]/g, "_")
        .replace(/[. ]+$/, "") || "file";
    name = Array.from(name).slice(0, 180).join("");
    return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
      ? "_" + name
      : name;
  };
  return files.map((f) => {
    const directory = f.directory === true && f.size === 0;
    const raw = f.name.replace(/\/$/, "");
    const parts = raw.split("/");
    const safe =
      parts.length <= 64 && !parts.some((p) => !p || p === "." || p === "..");
    const clean = safe
      ? parts.map(segment)
      : [segment(raw.replace(/[\\/]/g, "_").replace(/^\.+/, "_"))];
    const leaf = clean.pop(),
      prefix = clean.length ? clean.join("/") + "/" : "";
    let name = prefix + leaf + (directory ? "/" : ""),
      n = 1;
    while (used.has(name.toLowerCase()))
      name = prefix + `${n++}_${leaf}` + (directory ? "/" : "");
    used.add(name.toLowerCase());
    return { ...f, name, ...(directory ? { directory: true } : {}) };
  });
}
export function reservation(files) {
  const sum = files.reduce((n, f) => n + f.size, 0);
  return (
    sum +
    (files.length > 1 || files[0]?.directory
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
  const columns = db
    .prepare("PRAGMA table_info(transfers)")
    .all()
    .map((c) => c.name);
  for (const [name, type] of [
    ["title", "TEXT"],
    ["demo", "INTEGER NOT NULL DEFAULT 0"],
    ["one_time", "INTEGER NOT NULL DEFAULT 0"],
    ["consumed", "INTEGER NOT NULL DEFAULT 0"],
  ])
    if (!columns.includes(name))
      db.exec(`ALTER TABLE transfers ADD COLUMN ${name} ${type}`);
  if (!columns.includes("password_cipher"))
    db.exec("ALTER TABLE transfers ADD COLUMN password_cipher TEXT");
  if (!columns.includes("parent"))
    db.exec("ALTER TABLE transfers ADD COLUMN parent TEXT");
  if (!columns.includes("base"))
    db.exec("ALTER TABLE transfers ADD COLUMN base TEXT");
  if (!columns.includes("hidden"))
    db.exec(
      "ALTER TABLE transfers ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0",
    );
  db.exec("CREATE INDEX IF NOT EXISTS transfers_parent ON transfers(parent)");
  db.exec(
    "CREATE TABLE IF NOT EXISTS share_aliases(token TEXT PRIMARY KEY, transfer_id TEXT NOT NULL)",
  );
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const t of db
      .prepare(
        "SELECT id,token FROM transfers WHERE parent IS NULL AND length(token)>6 AND state NOT IN ('deleted','expired')",
      )
      .all()) {
      const short = uniqueShareToken(db);
      db.prepare(
        "INSERT OR IGNORE INTO share_aliases(token,transfer_id) VALUES(?,?)",
      ).run(t.token, t.id);
      db.prepare("UPDATE transfers SET token=? WHERE id=?").run(short, t.id);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    db.close();
    throw e;
  }
  return db;
}
export function insertTransfer(db, files, ttl, password, append = null) {
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
  if (![0, 3600, 21600, 86400, 259200, 604800].includes(ttl))
    throw Object.assign(new Error("Неверный срок"), { status: 400 });
  const clean = safeNames(
    files.map(({ name, size, directory }) => ({
      name,
      size,
      ...(directory === true && size === 0 ? { directory: true } : {}),
    })),
  );
  const id = token(),
    reserved = append
      ? clean.length === 1 && !clean[0].directory
        ? clean[0].size
        : reservation(clean) -
          (append.reuseFiles || append.files).reduce((n, f) => n + f.size, 0)
      : reservation(clean);
  db.exec("BEGIN IMMEDIATE");
  try {
    const used = db
      .prepare("SELECT coalesce(sum(reserved),0) n FROM transfers")
      .get().n;
    if (used + reserved > QUOTA)
      throw Object.assign(new Error("Недостаточно места"), { status: 409 });
    db.prepare(
      "INSERT INTO transfers(id,token,state,created,ttl,password,files,reserved,parent,base) VALUES(?,?,?,?,?,?,?,?,?,?)",
    ).run(
      id,
      uniqueShareToken(db),
      "uploading",
      Date.now(),
      ttl,
      password ? hash(password) : null,
      JSON.stringify(
        clean.map((f, i) => ({
          ...f,
          key:
            append && i < (append.reuseFiles || append.files).length
              ? (append.reuseFiles || append.files)[i].key
              : `${id}/source/${i}`,
          upload: null,
          done: !!append && i < (append.reuseFiles || append.files).length,
          reused: !!append && i < (append.reuseFiles || append.files).length,
        })),
      ),
      reserved,
      append?.id ?? null,
      append
        ? JSON.stringify({
            output: append.output,
            files: append.baseFiles || append.files,
            created: append.created,
          })
        : null,
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
      base: r.base ? JSON.parse(r.base) : null,
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
