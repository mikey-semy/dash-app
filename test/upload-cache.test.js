import test from "node:test";
import assert from "node:assert/strict";
import {
  fingerprint,
  matchUpload,
  rememberUpload,
} from "#src/features/upload-files/model/upload-cache.js";
test("resume checks every byte and matches duplicate filenames by content rather than selection order", async () => {
  const bytes = new Uint8Array(8 * 1024 * 1024 + 1).fill(7),
    changed = bytes.slice();
  changed[4000000] = 8;
  const original = new File([bytes], "same.bin"),
    other = new File([changed], "same.bin");
  const first = await fingerprint(original),
    second = await fingerprint(other);
  assert.notEqual(first, second);
  const upload = {
    manifest: [
      { name: original.name, size: original.size, fingerprint: first },
      { name: other.name, size: other.size, fingerprint: second },
    ],
  };
  const result = await matchUpload(upload, [other, original]);
  assert.equal(result.files[0], original);
  assert.equal(result.files[1], other);
  await assert.rejects(
    () => matchUpload(upload, [other, other]),
    /File contents/,
  );
});

test("fingerprints reuse immutable objects but never trust matching names and sizes", async () => {
  const file = new File(["original"], "same.txt"),
    slice = file.slice.bind(file);
  let reads = 0;
  file.slice = (...args) => {
    reads++;
    return slice(...args);
  };
  const [first, second] = await Promise.all([
    fingerprint(file),
    fingerprint(file),
  ]);
  assert.equal(first, second);
  assert.equal(reads, 1);
  const changed = new File(["modified"], "same.txt");
  assert.equal(changed.size, file.size);
  assert.notEqual(await fingerprint(changed), first);
});

test("source persistence overlaps fingerprinting and metadata commits only after hashing", async (t) => {
  const previousDB = globalThis.indexedDB,
    previousStorage = globalThis.localStorage;
  t.after(() => {
    if (previousDB === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = previousDB;
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  });
  let persisted = false,
    metadata,
    release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const file = new File(["immutable bytes"], "source.txt"),
    slice = file.slice.bind(file);
  file.slice = (...args) => ({
    async arrayBuffer() {
      await gate;
      return slice(...args).arrayBuffer();
    },
  });
  globalThis.localStorage = {
    setItem(key, value) {
      metadata = JSON.parse(value);
    },
  };
  globalThis.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          close() {},
          transaction() {
            const tx = {
              objectStore: () => ({
                put(value) {
                  assert.equal(value.files[0], file);
                  persisted = true;
                  return {};
                },
              }),
            };
            queueMicrotask(() => tx.oncomplete());
            return tx;
          },
        };
        request.onsuccess();
      });
      return request;
    },
  };
  const pending = rememberUpload({ id: "fixture", files: [file] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(persisted, true);
  assert.equal(metadata, undefined);
  release();
  assert.equal(await pending, true);
  assert.equal(metadata.files[0].fingerprint, await fingerprint(file));
});
