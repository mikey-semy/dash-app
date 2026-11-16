import test from "node:test";
import assert from "node:assert/strict";
import {
  fingerprint,
  matchUpload,
} from "../src/features/upload-files/model/upload-cache.js";
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
