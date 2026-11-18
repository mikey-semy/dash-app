import { once } from "node:events";
import { setTimeout as wait } from "node:timers/promises";
import express from "express";
import { createApp } from "../server/app.js";
import { openDB } from "../server/core.js";
import { Service } from "../server/service.js";
import { FakeStore } from "../test/fake.js";
import { createUploadTransport } from "#src/features/upload-files/model/transport.js";

const app = express();
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const origin = "http://127.0.0.1:" + server.address().port;
const db = openDB(":memory:");
const store = new FakeStore();
const service = new Service(db, store);
let profile, interrupted, attempts;
store.sign = async (_key, id, part) => origin + "/fake/" + id + "/" + part;
app.put(
  "/fake/:id/:part",
  express.raw({ type: () => true, limit: "9mb" }),
  async (req, res) => {
    attempts++;
    await wait(profile.delay);
    if (profile.interrupt && !interrupted) {
      interrupted = true;
      return res.sendStatus(503);
    }
    const upload = store.uploads.get(req.params.id);
    await store.send("UploadPart", {
      Key: upload.key,
      UploadId: req.params.id,
      PartNumber: Number(req.params.part),
      Body: req.body,
    });
    res.sendStatus(200);
  },
);
app.use(
  createApp(service, {
    PUBLIC_URL: origin,
    ADMIN_PASSWORD: "123456",
    S3_ENDPOINT: origin,
  }),
);
const login = await fetch(origin + "/api/login", {
  method: "POST",
  headers: { origin, "content-type": "application/json" },
  body: JSON.stringify({ password: "123456" }),
});
if (!login.ok) throw new Error("Fixture login failed");
const cookie = login.headers
  .getSetCookie()
  .map((value) => value.split(";")[0])
  .join("; ");
async function api(path, body, method = "POST", { signal } = {}) {
  const response = await fetch(origin + path, {
    method,
    signal,
    headers: { origin, cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(path + " returned " + response.status);
  return response.json();
}
function createXHR() {
  const controller = new AbortController();
  return {
    upload: {},
    open(method, url) {
      this.method = method;
      this.url = url;
    },
    send(body) {
      fetch(this.url, {
        method: this.method,
        body,
        signal: controller.signal,
      }).then(
        (response) => {
          this.status = response.status;
          this.onload?.();
        },
        () => this.onerror?.(),
      );
    },
    abort() {
      controller.abort();
      this.onabort?.();
    },
  };
}
const cases = [
  { label: "large", count: 1, bytes: 64 * 1024 * 1024 },
  { label: "small-files", count: 24, bytes: 64 * 1024 },
];
const profiles = [
  { label: "loopback", delay: 0 },
  { label: "120ms + one 503", delay: 120, interrupt: true },
];
const round = (ms) => Math.round(ms);
const results = [];
try {
  for (profile of profiles) {
    for (const fixture of cases) {
      const files = Array.from(
        { length: fixture.count },
        (_, i) =>
          new File([Buffer.alloc(fixture.bytes, i + 1)], "file-" + i + ".bin"),
      );
      for (const concurrency of [1, 2, 4, 6]) {
        interrupted = false;
        attempts = 0;
        const start = performance.now();
        const { id } = await api("/api/transfers", {
          files: files.map(({ name, size }) => ({ name, size })),
          ttl: 3600,
        });
        const transport = createUploadTransport({
          api,
          concurrency,
          control: { current: {} },
          onProgress() {},
          createXHR,
        });
        let first;
        await transport.sendParts(
          { id, files },
          {
            onFirstSend: () => {
              first = performance.now();
            },
          },
        );
        const transferred = performance.now();
        await api("/api/transfers/" + id + "/complete", {});
        await service.tick();
        const ready = performance.now();
        const record = service.get(id);
        if (record.state !== "ready")
          throw new Error("Fixture was not published");
        const downloadStart = performance.now();
        const download = await fetch(
          origin + "/public/" + record.token + "/download",
        );
        const headers = performance.now();
        if (
          !download.ok ||
          (await download.arrayBuffer()).byteLength !== record.output.size
        )
          throw new Error("Fixture download failed");
        const downloaded = performance.now();
        results.push({
          profile: profile.label,
          fixture: fixture.label,
          concurrency,
          firstPutMs: round(first - start),
          transferMs: round(transferred - first),
          finalizeMs: round(ready - transferred),
          readyMs: round(ready - start),
          putAttempts: attempts,
          downloadHeadersMs: round(headers - downloadStart),
          downloadMs: round(downloaded - downloadStart),
        });
        service.delete(id);
        await service.tick();
      }
    }
  }
  console.table(results);
} finally {
  server.close();
  db.close();
}
