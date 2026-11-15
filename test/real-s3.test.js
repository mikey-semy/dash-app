import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { openDB, PART } from "../server/core.js";
import { Service } from "../server/service.js";
import { Store } from "../server/s3.js";
test(
  "real S3: multipart, restart, ZIP bytes, Range and cleanup",
  { skip: !process.env.TEST_S3_ENDPOINT },
  async () => {
    for (const key of [
      "TEST_S3_BUCKET",
      "TEST_S3_ACCESS_KEY",
      "TEST_S3_SECRET_KEY",
    ])
      assert.ok(process.env[key], key + " is required");
    const store = new Store({
      S3_ENDPOINT: process.env.TEST_S3_ENDPOINT,
      S3_BUCKET: process.env.TEST_S3_BUCKET,
      S3_REGION: process.env.TEST_S3_REGION || "us-east-1",
      S3_ACCESS_KEY: process.env.TEST_S3_ACCESS_KEY,
      S3_SECRET_KEY: process.env.TEST_S3_SECRET_KEY,
    });
    mkdirSync("work", { recursive: true });
    const path = join(mkdtempSync("work/real-s3-"), "test.db");
    let db = openDB(path),
      service = new Service(db, store),
      id;
    const payload = Buffer.alloc(9 * 1024 * 1024, 0x71);
    try {
      id = service.create(
        [
          { name: "данные.bin", size: payload.length },
          { name: "empty", size: 0 },
        ],
        3600,
        "",
      );
      await service.init(id, 0);
      let f = service.get(id).files[0];
      for (let n = 1; n <= Math.ceil(payload.length / PART); n++) {
        const body = payload.subarray((n - 1) * PART, n * PART);
        await store.send("UploadPart", {
          Key: f.key,
          UploadId: f.upload,
          PartNumber: n,
          Body: body,
          ContentLength: body.length,
        });
      }
      assert.equal((await service.init(id, 0)).parts.length, 2);
      await service.finishFile(id, 0);
      await service.init(id, 1);
      await service.finish(id);
      db.close();
      db = openDB(path);
      service = new Service(db, store);
      await store.create(id + "/bundle.zip");
      await service.tick();
      const t = service.get(id);
      assert.equal(t.state, "ready");
      const obj = await store.get(t.output.key);
      const chunks = [];
      for await (const c of obj.Body) chunks.push(c);
      const zip = Buffer.concat(chunks),
        contents = unzipSync(zip);
      assert.deepEqual(Buffer.from(contents["данные.bin"]), payload);
      assert.equal(contents.empty.length, 0);
      assert.equal((await store.head(t.output.key)).ContentLength, zip.length);
      const range = await store.get(t.output.key, { Range: "bytes=2-11" });
      assert.deepEqual(
        Buffer.from(await range.Body.transformToByteArray()),
        zip.subarray(2, 12),
      );
      await service.tick();
      assert.equal(service.get(id).reserved, zip.length);
    } finally {
      if (id) {
        service.delete(id);
        await service.tick();
        assert.equal(service.get(id).state, "deleted");
      }
      db.close();
      store.client.destroy();
    }
  },
);
