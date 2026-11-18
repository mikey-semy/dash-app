import { copy } from "#common/copy.js";
const key = "du.upload.v1";
const fingerprints = new WeakMap();
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("du-uploads", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("uploads");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function stored(mode, operation) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("uploads", mode),
        request = operation(tx.objectStore("uploads"));
      tx.oncomplete = () => resolve(request?.result);
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export function fingerprint(file) {
  // File/Blob bytes are immutable. Reuse only the exact object, never name/size.
  if (!fingerprints.has(file)) {
    const pending = hashFile(file).catch((error) => {
      fingerprints.delete(file);
      throw error;
    });
    fingerprints.set(file, pending);
  }
  return fingerprints.get(file);
}
async function hashFile(file) {
  const hashes = [];
  for (let offset = 0; offset < file.size; offset += 8 * 1024 * 1024)
    hashes.push(
      ...new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          await file.slice(offset, offset + 8 * 1024 * 1024).arrayBuffer(),
        ),
      ),
    );
  const result = await crypto.subtle.digest("SHA-256", new Uint8Array(hashes));
  return Array.from(new Uint8Array(result), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export async function rememberUpload(upload) {
  // Persist the immutable sources while hashing instead of doing both serially.
  const persisted = stored("readwrite", (store) =>
    store.put({ id: upload.id, files: upload.files }, "active"),
  ).then(
    () => true,
    () => false,
  );
  const files = [];
  for (const file of upload.files)
    files.push({
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      fingerprint: await fingerprint(file),
    });
  const metadata = { ...upload, files };
  localStorage.setItem(key, JSON.stringify(metadata));
  return persisted;
}
export async function recoverUpload() {
  let metadata;
  try {
    metadata = JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
  if (!metadata?.id || !Array.isArray(metadata.files)) return null;
  try {
    const cache = await stored("readonly", (store) => store.get("active"));
    if (
      cache?.id === metadata.id &&
      cache.files?.length === metadata.files.length
    ) {
      for (let i = 0; i < cache.files.length; i++)
        if (
          cache.files[i].size !== metadata.files[i].size ||
          (await fingerprint(cache.files[i])) !== metadata.files[i].fingerprint
        )
          throw new Error("Cache changed");
      return {
        ...metadata,
        manifest: metadata.files,
        files: cache.files.map(
          (file, i) =>
            new File([file], metadata.files[i].name, {
              lastModified: metadata.files[i].lastModified,
            }),
        ),
        missing: false,
      };
    }
  } catch {}
  return { ...metadata, manifest: metadata.files, missing: true };
}
export async function forgetUpload(id) {
  try {
    const current = JSON.parse(localStorage.getItem(key));
    if (current?.id !== id) return;
    localStorage.removeItem(key);
    await stored("readwrite", (store) => store.delete("active"));
  } catch {}
}
export async function matchUpload(upload, files) {
  if (files.length !== upload.manifest.length)
    throw new Error(copy.selectAllOriginalUploadFiles);
  const remaining = Array.from(files),
    ordered = [];
  for (const expected of upload.manifest) {
    let index = -1;
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      if (
        candidate.name === expected.name &&
        candidate.size === expected.size &&
        (await fingerprint(candidate)) === expected.fingerprint
      ) {
        index = i;
        break;
      }
    }
    if (index < 0)
      throw new Error(copy.sourceFilesChangedPrefix + expected.name);
    const file = remaining.splice(index, 1)[0];
    ordered.push(file);
  }
  return { ...upload, files: ordered, missing: false };
}
