import { MAX_FILES, LIMIT } from "../shared/config.js";
import { copy } from "../shared/copy.js";
import ignore from "ignore";

const directories =
  /^(?:node_modules|\.git|\.hg|\.svn|__pycache__|\.venv|venv|env|\.pytest_cache|\.mypy_cache|\.ruff_cache|\.tox|\.nox|\.cache|\.gradle|\.dart_tool|\.pub-cache|\.bundle|\.terraform|\.next|\.nuxt|\.svelte-kit|\.angular|\.parcel-cache|\.turbo|target|\.vs)$/i;
export function defaultExcluded(name, directory) {
  if (directory) return directories.test(name) || /\.egg-info$/i.test(name);
  return (
    /(?:\.py[co]$|^\.coverage(?:\.|$)|\.(?:pem|key|p12|pfx)$|^id_(?:rsa|ed25519|ecdsa)(?:$|\.pub$))/i.test(
      name,
    ) ||
    (/^\.env(?:\.|$)/i.test(name) &&
      !/\.(?:example|sample|template)$/i.test(name))
  );
}
export function captureFiles(data) {
  // Entries must be captured while the native drop/paste event is active.
  const entries = Array.from(data.items || [])
    .filter((item) => item.kind === "file")
    .map((item) => item.webkitGetAsEntry?.())
    .filter(Boolean);
  return {
    entries,
    files: Array.from(data.files || []),
    folders: entries.some((entry) => entry.isDirectory),
  };
}
const children = async (entry) => {
  const reader = entry.createReader(),
    result = [];
  for (;;) {
    const batch = await new Promise((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (!batch.length)
      return result.sort((a, b) => a.name.localeCompare(b.name));
    result.push(...batch);
  }
};
const readFile = (entry) =>
  new Promise((resolve, reject) => entry.file(resolve, reject));
export async function scanFolders(source) {
  const plan = { files: [], excluded: [], loose: [], roots: [] };
  const walk = async (
    entry,
    path,
    root,
    scopes,
    restore = false,
    depth = 0,
  ) => {
    if (depth > 64) throw new Error(copy.folderNestingIsTooDeep);
    const relative = path.join("/"),
      directory = entry.isDirectory;
    let ignored = false;
    for (const scope of scopes) {
      const match = scope.rules.test(
        relative.slice(scope.prefix.length) + (directory ? "/" : ""),
      );
      if (match.ignored) ignored = true;
      else if (match.unignored) ignored = false;
    }
    ignored = defaultExcluded(entry.name, directory) || ignored;
    if (!restore && ignored) {
      plan.excluded.push({
        path: root.name + "/" + relative,
        entry,
        relative: path,
        root,
        scopes,
      });
      return;
    }
    if (!directory) {
      const file = await readFile(entry);
      plan.files.push({ file, path: root.name + "/" + relative, root });
      checkPlan(plan);
      return;
    }
    const entries = await children(entry);
    let nested = scopes;
    const gitignore = entries.find(
      (item) => item.isFile && item.name === ".gitignore",
    );
    if (gitignore && !restore) {
      const file = await readFile(gitignore);
      if (file.size > 1024 * 1024) throw new Error(copy.gitignoreExceeds1Mib);
      nested = [
        ...scopes,
        {
          prefix: relative ? relative + "/" : "",
          rules: ignore().add(await file.text()),
        },
      ];
    }
    if (!entries.length)
      plan.files.push({
        path: root.name + "/" + (relative ? relative + "/" : ""),
        root,
        directory: true,
      });
    for (const child of entries)
      await walk(
        child,
        [...path, child.name],
        root,
        nested,
        restore,
        depth + 1,
      );
  };
  for (const entry of source.entries) {
    if (entry.isDirectory) {
      const root = { name: entry.name };
      plan.roots.push(root);
      // A dropped root is intentional; its contents still obey exclusions.
      await walk(entry, [], root, [], false);
    } else plan.loose.push(await readFile(entry));
  }
  plan.restore = async (item) => {
    const snapshot = plan.files.length;
    try {
      await walk(item.entry, item.relative, item.root, item.scopes, true);
    } catch (error) {
      plan.files.splice(snapshot);
      throw error;
    }
    plan.excluded = plan.excluded.filter((value) => value !== item);
  };
  checkPlan(plan);
  return plan;
}
function checkPlan(plan) {
  if (
    plan.files.filter((item) => !item.directory).length + plan.loose.length >
      MAX_FILES ||
    plan.files.reduce((sum, item) => sum + (item.file?.size || 0), 0) +
      plan.loose.reduce((sum, file) => sum + file.size, 0) >
      LIMIT
  )
    throw new Error(copy.foldersCanContainUpTo100FilesAnd2);
}
export function folderFiles(plan) {
  return [
    ...plan.loose,
    ...plan.files.map(
      (item) =>
        new File(item.file ? [item.file] : [], item.path, {
          type: item.directory ? "application/x-du-directory" : item.file.type,
          lastModified: item.file?.lastModified || Date.now(),
        }),
    ),
  ];
}
const encoder = new TextEncoder();
const crcTable = Array.from({ length: 256 }, (_, i) => {
  for (let bit = 0; bit < 8; bit++)
    i = i & 1 ? 0xedb88320 ^ (i >>> 1) : i >>> 1;
  return i >>> 0;
});
async function crc32(file, cancelled) {
  let crc = -1;
  const reader = file.stream().getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (cancelled()) {
        await reader.cancel();
        throw new Error(copy.cancelled);
      }
      for (const byte of value)
        crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    }
  } finally {
    reader.releaseLock();
  }
  return (crc ^ -1) >>> 0;
}
// STORE ZIP references original File blobs: no full-file copies in JS memory.
export async function folderZip(name, entries, cancelled = () => false) {
  if (entries.length > 65535) throw new Error(copy.tooManyDirectoriesInZip);
  const parts = [],
    central = [];
  let offset = 0,
    directorySize = 0;
  for (const entry of entries) {
    if (cancelled()) throw new Error(copy.cancelled);
    if (
      entry.path.startsWith("/") ||
      entry.path.includes("\\") ||
      entry.path.includes(":") ||
      entry.path.split("/").some((part) => part === ".." || part === ".")
    )
      throw new Error(copy.unsupportedFolderPath);
    const path = encoder.encode(entry.path),
      size = entry.file?.size || 0;
    if (path.length > 65535) throw new Error(copy.folderPathIsTooLong);
    const crc = entry.file ? await crc32(entry.file, cancelled) : 0;
    const date = new Date(entry.file?.lastModified || Date.now());
    const time =
        (date.getHours() << 11) |
        (date.getMinutes() << 5) |
        (date.getSeconds() >> 1),
      day =
        ((Math.max(1980, Math.min(2107, date.getFullYear())) - 1980) << 9) |
        ((date.getMonth() + 1) << 5) |
        date.getDate();
    const header = new Uint8Array(30 + path.length),
      h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x800, true);
    h.setUint16(10, time, true);
    h.setUint16(12, day, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, size, true);
    h.setUint32(22, size, true);
    h.setUint16(26, path.length, true);
    header.set(path, 30);
    parts.push(header);
    if (entry.file) parts.push(entry.file);
    const record = new Uint8Array(46 + path.length),
      c = new DataView(record.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x800, true);
    c.setUint16(12, time, true);
    c.setUint16(14, day, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, size, true);
    c.setUint32(24, size, true);
    c.setUint16(28, path.length, true);
    c.setUint32(38, entry.directory ? 16 : 0, true);
    c.setUint32(42, offset, true);
    record.set(path, 46);
    central.push(record);
    directorySize += record.length;
    offset += header.length + size;
  }
  const end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, entries.length, true);
  e.setUint16(10, entries.length, true);
  e.setUint32(12, directorySize, true);
  e.setUint32(16, offset, true);
  if (cancelled()) throw new Error(copy.cancelled);
  return new File([...parts, ...central, end], name + ".zip", {
    type: "application/zip",
  });
}
