import test from "node:test";
import assert from "node:assert/strict";
import { openDB } from "../server/core.js";
import { Service } from "../server/service.js";
import { FakeStore } from "./fake.js";
import { Store } from "../server/s3.js";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";

test("persisted SQLite restart: ZIP and queued deletion recover after closing and reopening database", async () => {
  mkdirSync("work", { recursive: true });
  const path = join(mkdtempSync("work/restart-"), "flash.db");
  let db = openDB(path);
  const store = new FakeStore();
  let service = new Service(db, store);
  const id = service.create(
    [
      { name: "one", size: 3 },
      { name: "empty", size: 0 },
    ],
    3600,
    "",
  );
  for (let i = 0; i < 2; i++) {
    await service.init(id, i);
    const f = service.get(id).files[i];
    if (f.size) {
      await store.send("UploadPart", {
        UploadId: f.upload,
        PartNumber: 1,
        Body: Buffer.from("abc"),
      });
      await service.finishFile(id, i);
    }
  }
  await service.finish(id);
  db.prepare(
    "UPDATE transfers SET state='archiving',attempts=1 WHERE id=?",
  ).run(id);
  await store.create(id + "/bundle.zip");
  db.close();
  db = openDB(path);
  service = new Service(db, store);
  await service.tick();
  assert.equal(service.get(id).state, "ready");
  assert.deepEqual(
    Buffer.from(unzipSync(store.objects.get(id + "/bundle.zip")).one),
    Buffer.from("abc"),
  );
  assert.equal(store.objects.get(id + "/bundle.zip").readUInt16LE(8), 0);
  service.delete(id);
  db.close();
  db = openDB(path);
  service = new Service(db, store);
  await service.tick();
  assert.equal(service.get(id).state, "deleted");
  assert.equal(service.get(id).reserved, 0);
  assert.equal(store.objects.size, 0);
  db.close();
});
test("S3 presigned upload is scoped to exact part, object, upload, size and five minutes", async () => {
  const store = new Store({
    S3_ENDPOINT: "https://storage.yandexcloud.net",
    S3_BUCKET: "test-bucket",
    S3_ACCESS_KEY: "fake-key",
    S3_SECRET_KEY: "fake-secret",
  });
  const url = new URL(await store.sign("scope/file", "upload-id", 2, 17));
  assert.equal(url.pathname, "/test-bucket/scope/file");
  assert.equal(url.searchParams.get("partNumber"), "2");
  assert.equal(url.searchParams.get("uploadId"), "upload-id");
  assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
  assert.ok(
    url.searchParams.get("X-Amz-SignedHeaders").includes("content-length"),
  );
  store.client.destroy();
});
test("one slow ZIP does not stop expiry cleanup or a second upload", async () => {
  const db = openDB(":memory:"),
    store = new FakeStore(),
    service = new Service(db, store);
  const old = service.create([{ name: "old", size: 0 }], 3600, "");
  await service.init(old, 0);
  await service.finish(old);
  const id = service.create(
    [
      { name: "a", size: 0 },
      { name: "b", size: 0 },
    ],
    3600,
    "",
  );
  await service.init(id, 0);
  await service.init(id, 1);
  await service.finish(id);
  let release, entered;
  const gate = new Promise((r) => (release = r)),
    started = new Promise((r) => (entered = r)),
    get = store.get.bind(store);
  store.get = async (...args) => {
    entered();
    await gate;
    return get(...args);
  };
  const job = service.tick();
  await started;
  db.prepare("UPDATE transfers SET expires=? WHERE id=?").run(
    Date.now() - 1,
    old,
  );
  await service.tick();
  assert.equal(service.get(old).state, "deleted");
  const another = await service.locked(() =>
    service.create([{ name: "new", size: 0 }], 3600, ""),
  );
  await service.locked(() => service.init(another, 0));
  assert.equal(service.get(another).files[0].done, true);
  release();
  await job;
  assert.equal(service.get(id).state, "ready");
  db.close();
});

test("streamed ZIP spans multipart boundaries, retries a failed ZIP part and preserves every byte", async () => {
  const db = openDB(":memory:"),
    store = new FakeStore(),
    service = new Service(db, store),
    payload = Buffer.alloc(9 * 1024 * 1024, 0xa7);
  const id = service.create(
    [
      { name: "large.bin", size: payload.length },
      { name: "empty", size: 0 },
    ],
    3600,
    "",
  );
  await service.init(id, 0);
  const f = service.get(id).files[0];
  await store.send("UploadPart", {
    UploadId: f.upload,
    PartNumber: 1,
    Body: payload.subarray(0, 8 * 1024 * 1024),
  });
  await store.send("UploadPart", {
    UploadId: f.upload,
    PartNumber: 2,
    Body: payload.subarray(8 * 1024 * 1024),
  });
  await service.finishFile(id, 0);
  await service.init(id, 1);
  await service.finish(id);
  let fail = true;
  const send = store.send.bind(store);
  store.send = async (command, args) => {
    if (fail && args.Key?.endsWith("/bundle.zip")) {
      fail = false;
      throw new Error("S3 part failed");
    }
    return send(command, args);
  };
  await service.tick();
  assert.equal(service.get(id).state, "queued");
  assert.equal(store.uploads.size, 0);
  await service.tick();
  const t = service.get(id);
  assert.equal(t.state, "ready");
  const extracted = unzipSync(store.objects.get(t.output.key));
  assert.deepEqual(Buffer.from(extracted["large.bin"]), payload);
  assert.equal(extracted.empty.length, 0);
  db.close();
});
