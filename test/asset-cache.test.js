import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { cacheBuildAssets } from "../server/asset-cache.js";
import { createApp } from "../server/app.js";
import { Service } from "../server/service.js";
import { openDB } from "../server/core.js";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "du-assets-"));
  assert.equal(path.dirname(root), tmpdir());
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source"),
    directory = path.join(root, "cache");
  await mkdir(source);
  return { root, source, directory };
}

test("retained build graphs survive releases; pruning keeps shared dependencies and never touches source files", async (t) => {
  const { root, source, directory } = await fixture(t);
  const shared = "runtime-Shared01.js",
    old = "settings-OldFile1.js",
    next = "settings-NewFile2.js",
    latest = "settings-LastFile.js";
  await writeFile(path.join(source, shared), "export const shared=1");
  await writeFile(path.join(source, old), "old");
  await writeFile(path.join(source, ".env"), "private");
  await cacheBuildAssets({ source, directory, build: "1".repeat(40), keep: 2 });
  await rm(path.join(source, old));
  await writeFile(path.join(source, next), "next");
  await cacheBuildAssets({ source, directory, build: "2".repeat(40), keep: 2 });
  assert.equal(await readFile(path.join(directory, old), "utf8"), "old");
  await rm(path.join(source, next));
  await writeFile(path.join(source, latest), "latest");
  await cacheBuildAssets({ source, directory, build: "3".repeat(40), keep: 2 });
  assert.deepEqual(
    (await readdir(directory)).filter((name) => !name.startsWith(".")).sort(),
    [shared, next, latest].sort(),
  );
  assert.equal(await readFile(path.join(source, ".env"), "utf8"), "private");
  assert.equal(
    await readFile(path.join(source, shared), "utf8"),
    "export const shared=1",
  );
  await assert.rejects(
    cacheBuildAssets({ source, directory, build: "../../escape" }),
  );
  assert.equal((await readdir(root)).includes("escape"), false);
});

test("actual app serves retained chunks with JS MIME, HEAD and Range while metadata stays private", async (t) => {
  const { source, directory } = await fixture(t),
    name = "settings-OldFile1.js",
    bytes = "export const value = 42;";
  await writeFile(path.join(source, name), bytes);
  await cacheBuildAssets({ source, directory, build: "a".repeat(40) });
  const db = openDB(":memory:");
  t.after(() => db.close());
  const app = createApp(
    new Service(db, {}),
    {
      PUBLIC_URL: "http://localhost",
      ADMIN_PASSWORD: "123456",
      S3_ENDPOINT: "https://storage.invalid",
    },
    { assetDirectory: directory },
  );
  const response = await request(app)
    .get("/assets/" + name)
    .expect(200);
  assert.equal(response.text, bytes);
  assert.match(response.headers["content-type"], /javascript/);
  assert.match(response.headers["cache-control"], /immutable/);
  await request(app)
    .head("/assets/" + name)
    .expect(200)
    .expect("Content-Length", String(Buffer.byteLength(bytes)));
  const partial = await request(app)
    .get("/assets/" + name)
    .set("Range", "bytes=0-5")
    .expect(206);
  assert.equal(partial.text, "export");
  await request(app)
    .get("/assets/.releases/" + "a".repeat(40) + ".json")
    .expect(404);
  await request(app).get("/assets/.env").expect(404);
  await request(app).get("/api/transfers").expect(401);
});
