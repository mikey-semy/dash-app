import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import request from "supertest";
import { unzipSync } from "fflate";
import {
  archiveName,
  openDB,
  PART,
  range,
  safeNames,
  reservation,
  revision,
} from "../server/core.js";
import { Service } from "../server/service.js";
import { createApp } from "../server/app.js";
import { FakeStore } from "./fake.js";
const env = {
  PUBLIC_URL: "http://localhost",
  ADMIN_PASSWORD: "a-long-owner-password",
  S3_ENDPOINT: "https://s3.test",
};
async function setup() {
  const db = openDB(":memory:"),
    store = new FakeStore(),
    service = new Service(db, store),
    app = createApp(service, env),
    agent = request.agent(app);
  await agent
    .post("/api/login")
    .set("Origin", env.PUBLIC_URL)
    .send({ password: env.ADMIN_PASSWORD })
    .expect(200);
  return { db, store, service, app, agent };
}
function post(agent, url, body = {}) {
  return agent.post(url).set("Origin", env.PUBLIC_URL).send(body);
}
async function upload(service, store, contents, password = "") {
  const id = service.create(
    contents.map(([name, b]) => ({ name, size: b.length })),
    3600,
    password,
  );
  for (let i = 0; i < contents.length; i++) {
    await service.init(id, i);
    const t = service.get(id),
      f = t.files[i],
      b = contents[i][1];
    if (b.length) {
      for (let p = 1; p <= Math.ceil(b.length / PART); p++)
        await store.send("UploadPart", {
          Key: f.key,
          UploadId: f.upload,
          PartNumber: p,
          Body: b.subarray((p - 1) * PART, p * PART),
        });
      await service.finishFile(id, i);
    }
  }
  await service.finish(id);
  return id;
}
test("auth, origin protection and password privacy", async () => {
  const { app, agent, service, store } = await setup();
  await request(app).get("/api/transfers").expect(401);
  await agent.post("/api/transfers").send({}).expect(403);
  const id = await upload(
      service,
      store,
      [["secret.txt", Buffer.from("private")]],
      "recipient-password",
    ),
    t = service.get(id),
    url = "/public/" + t.token;
  const locked = await request(app).get(url).expect(200);
  assert.deepEqual(locked.body, { locked: true });
  await request(app)
    .get(url + "/download")
    .expect(401);
  await post(request(app), url + "/unlock", {
    password: env.ADMIN_PASSWORD,
  }).expect(401);
  const recipient = request.agent(app);
  await post(recipient, url + "/unlock", {
    password: "recipient-password",
  }).expect(200);
  assert.equal((await recipient.get(url)).body.files[0].name, "secret.txt");
  await recipient.get("/api/transfers").expect(401);
  assert.ok(
    !JSON.stringify((await agent.get("/api/transfers")).body).includes(
      "recipient-password",
    ),
  );
});
test("HEAD, suffix and regular Range, If-Range, validators and 416", async () => {
  const { app, store, service } = await setup();
  const id = await upload(service, store, [
      ["a.txt", Buffer.from("0123456789")],
    ]),
    t = service.get(id),
    url = "/public/" + t.token + "/download";
  let r = await request(app).head(url).set("Range", "bytes=1-2").expect(200);
  assert.equal(r.headers["content-length"], "10");
  r = await request(app).get(url).set("Range", "bytes=2-4").expect(206);
  assert.equal(r.body.toString(), "234");
  assert.equal(r.headers["content-range"], "bytes 2-4/10");
  r = await request(app).get(url).set("Range", "bytes=-3").expect(206);
  assert.equal(r.body.toString(), "789");
  await request(app).get(url).set("Range", "bytes=99-").expect(416);
  await request(app)
    .get(url)
    .set("Range", "bytes=0-1")
    .set("If-Range", '"old"')
    .expect(200);
  await request(app)
    .get(url)
    .set("Range", "bytes=0-1")
    .set("If-Range", t.output.etag)
    .expect(206);
  await request(app).get(url).set("If-None-Match", t.output.etag).expect(304);
  await request(app).get(url).set("If-Match", '"old"').expect(412);
});
test("expiry denies new downloads before cleanup and S3 failure retains quota", async () => {
  const { app, db, store, service } = await setup();
  const id = await upload(service, store, [["x", Buffer.from("test")]]),
    t = service.get(id);
  db.prepare("UPDATE transfers SET expires=? WHERE id=?").run(
    Date.now() - 1,
    id,
  );
  await request(app)
    .get("/public/" + t.token)
    .expect(404);
  await request(app)
    .get("/public/" + t.token + "/download")
    .expect(404);
  store.failDelete = true;
  await service.tick();
  assert.equal(service.get(id).state, "deleting");
  assert.equal(service.get(id).reserved, 4);
  store.failDelete = false;
  await service.tick();
  assert.equal(service.get(id).reserved, 0);
  assert.equal(store.objects.size, 0);
});
test("atomic quota admission with competing HTTP requests; failed deletes do not release space", async () => {
  const { agent, service } = await setup();
  const results = await Promise.all(
    Array.from({ length: 6 }, () =>
      post(agent, "/api/transfers", {
        files: [
          { name: "a", size: 1e9 },
          { name: "b", size: 1e9 },
        ],
        ttl: 3600,
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 201).length, 4);
  assert.equal(results.filter((r) => r.status === 409).length, 2);
  const ids = results.filter((r) => r.status === 201).map((r) => r.body.id);
  for (const id of ids) service.delete(id);
  await post(agent, "/api/transfers", {
    files: [{ name: "a", size: 2e9 }],
    ttl: 3600,
  }).expect(201);
  await post(agent, "/api/transfers", {
    files: [{ name: "a", size: 2e9 }],
    ttl: 3600,
  }).expect(409);
});
test("multipart interruption, resume, size validation and complete response loss", async () => {
  const { service, store } = await setup();
  const id = service.create([{ name: "large", size: PART + 3 }], 3600, "");
  await service.init(id, 0);
  const f = service.get(id).files[0];
  await store.send("UploadPart", {
    Key: f.key,
    UploadId: f.upload,
    PartNumber: 1,
    Body: Buffer.alloc(PART),
  });
  await assert.rejects(() => service.finishFile(id, 0));
  const resume = await service.init(id, 0);
  assert.equal(resume.parts.length, 1);
  await assert.rejects(() => service.sign(id, 0, 3));
  await store.send("UploadPart", {
    Key: f.key,
    UploadId: f.upload,
    PartNumber: 2,
    Body: Buffer.from("end"),
  });
  const complete = store.complete.bind(store);
  store.complete = async (...args) => {
    await complete(...args);
    throw new Error("response lost");
  };
  await assert.rejects(() => service.finishFile(id, 0));
  store.complete = complete;
  await service.finishFile(id, 0);
  await service.finish(id);
  assert.equal(service.get(id).state, "ready");
});
test("ZIP restart recovers orphan multipart, preserves Unicode, duplicate and empty files", async () => {
  const { db, service, store } = await setup();
  const inputs = [
    ["../ёж.txt", Buffer.from("Привет")],
    ["../ёж.txt", Buffer.from("second")],
    ["empty", Buffer.alloc(0)],
  ];
  const id = await upload(service, store, inputs);
  db.prepare(
    "UPDATE transfers SET state='archiving',attempts=1 WHERE id=?",
  ).run(id);
  await store.create(id + "/bundle.zip");
  const restarted = new Service(db, store);
  await restarted.tick();
  const t = restarted.get(id);
  assert.equal(t.state, "ready");
  assert.equal(store.uploads.size, 0);
  const zip = unzipSync(store.objects.get(t.output.key));
  assert.deepEqual(
    Object.keys(zip),
    t.files.map((f) => f.name),
  );
  for (let i = 0; i < inputs.length; i++)
    assert.deepEqual(Buffer.from(zip[t.files[i].name]), inputs[i][1]);
  assert.ok(t.files.every((f) => !f.name.includes("/")));
  await restarted.tick();
  assert.equal(store.objects.size, 1);
  assert.equal(restarted.get(id).reserved, t.output.size);
});
test("cancel aborts partial upload and blocks issuing more permissions immediately", async () => {
  const { service, store } = await setup();
  const id = service.create([{ name: "x", size: 20 }], 3600, "");
  await service.init(id, 0);
  service.delete(id);
  await assert.rejects(() => service.sign(id, 0, 1));
  await service.tick();
  assert.equal(store.uploads.size, 0);
  assert.equal(service.get(id).reserved, 0);
});
test("ZIP failure retries are bounded and visible; deletion during ZIP cannot resurrect a link", async () => {
  const { service, store } = await setup();
  const id = await upload(service, store, [
    ["a", Buffer.from("a")],
    ["b", Buffer.from("b")],
  ]);
  store.failGet = true;
  await service.tick();
  await service.tick();
  await service.tick();
  assert.equal(service.get(id).state, "failed");
  assert.equal(service.get(id).attempts, 3);
  assert.ok(service.get(id).error);
  store.failGet = false;
  const id2 = await upload(service, store, [
    ["a", Buffer.from("a")],
    ["b", Buffer.from("b")],
  ]);
  const get = store.get.bind(store);
  store.get = async (...args) => {
    service.delete(id2);
    return get(...args);
  };
  await service.tick();
  assert.equal(service.get(id2).state, "deleting");
  await service.tick();
  assert.equal(service.get(id2).state, "deleted");
});
test("unfinished uploads expire after 24 hours; zero-byte original works", async () => {
  const { service, db, store, app } = await setup();
  const id = service.create([{ name: "x", size: 1 }], 3600, "");
  await service.init(id, 0);
  db.prepare("UPDATE transfers SET created=? WHERE id=?").run(
    Date.now() - 86400001,
    id,
  );
  await service.tick();
  assert.equal(service.get(id).state, "deleted");
  const empty = await upload(service, store, [["empty", Buffer.alloc(0)]]);
  await request(app)
    .get("/public/" + service.get(empty).token + "/download")
    .expect(200)
    .expect("Content-Length", "0");
});
test("S3 download failures produce 503, names and reservation are safe", async () => {
  const { service, store, app } = await setup();
  const id = await upload(service, store, [["файл.txt", Buffer.from("x")]]);
  store.failGet = true;
  await request(app)
    .get("/public/" + service.get(id).token + "/download")
    .expect(503);
  assert.equal(range("bytes=-0", 10), false);
  assert.equal(range("bytes=2-1", 10), false);
  assert.ok(
    reservation(
      safeNames([
        { name: "a", size: 1 },
        { name: "a", size: 1 },
      ]),
    ) > 4,
  );
});

test("ZIP names use stable Moscow upload timestamp with milliseconds, including existing archives", async () => {
  assert.equal(
    archiveName(Date.parse("2026-11-01T10:24:54.123Z")),
    "files-20261101-132454123.zip",
  );
  assert.equal(
    archiveName(Date.parse("2026-12-31T22:00:00.007Z")),
    "files-20270101-010000007.zip",
  );
  const { db, store, service, app } = await setup();
  const id = await upload(service, store, [
    ["a", Buffer.from("a")],
    ["b", Buffer.from("b")],
  ]);
  await service.tick();
  const t = service.get(id),
    expected = archiveName(t.created);
  assert.equal(t.output.name, expected);
  db.prepare("UPDATE transfers SET output=? WHERE id=?").run(
    JSON.stringify({ ...t.output, name: "Файлы.zip" }),
    id,
  );
  const url = "/public/" + t.token;
  assert.equal((await request(app).get(url)).body.name, expected);
  const head = await request(app)
    .head(url + "/download")
    .expect(200);
  assert.ok(
    head.headers["content-disposition"].includes('filename="' + expected + '"'),
  );
  assert.ok(
    head.headers["content-disposition"].includes(
      "filename*=UTF-8''" + expected,
    ),
  );
  const range = await request(app)
    .get(url + "/download")
    .set("Range", "bytes=0-3")
    .expect(206);
  assert.equal(
    range.headers["content-disposition"],
    head.headers["content-disposition"],
  );
});

test("infinite transfer stays available until manual deletion, including protected access", async () => {
  const { service, store, db, app, agent } = await setup();
  const id = service.create([{ name: "keep.txt", size: 0 }], 0, "123456");
  await service.init(id, 0);
  await service.finish(id);
  db.prepare("UPDATE transfers SET created=?,ready=? WHERE id=?").run(0, 0, id);
  await service.tick();
  const t = service.get(id);
  assert.equal(t.expires, null);
  assert.equal(t.state, "ready");
  const history = await agent.get("/api/transfers");
  assert.ok(history.body.find((x) => x.id === id).url);
  const recipient = request.agent(app),
    url = "/public/" + t.token;
  await post(recipient, url + "/unlock", { password: "123456" }).expect(200);
  assert.equal((await recipient.get(url).expect(200)).body.expires, null);
  await recipient.head(url + "/download").expect(200);
  service.delete(id);
  await recipient.get(url).expect(404);
  await service.tick();
  assert.equal(service.get(id).state, "deleted");
});

async function appendUpload(service, store, parent, contents) {
  const { id, offset } = service.append(
    parent,
    contents.map(([name, b]) => ({ name, size: b.length })),
  );
  for (let i = 0; i < contents.length; i++) {
    await service.init(id, i + offset);
    const f = service.get(id).files[i + offset],
      b = contents[i][1];
    if (b.length) {
      for (let p = 1; p <= Math.ceil(b.length / PART); p++)
        await store.send("UploadPart", {
          Key: f.key,
          UploadId: f.upload,
          PartNumber: p,
          Body: b.subarray((p - 1) * PART, p * PART),
        });
      await service.finishFile(id, i + offset);
    }
  }
  await service.finish(id);
  return id;
}
test("append preserves original link/password/expiry, atomically replaces flat ZIP and retains quota until cleanup", async () => {
  const { db, store, service, app, agent } = await setup();
  const parent = await upload(
      service,
      store,
      [["same.txt", Buffer.from("old")]],
      "123456",
    ),
    original = service.get(parent),
    oldKey = original.output.key;
  const child = await appendUpload(service, store, parent, [
    ["same.txt", Buffer.from("new")],
    ["empty", Buffer.alloc(0)],
  ]);
  assert.equal(service.get(parent).output.key, oldKey);
  assert.equal((await agent.get("/api/transfers")).body.length, 1);
  assert.throws(
    () => service.append(parent, [{ name: "other", size: 0 }]),
    /уже выполняется/,
  );
  const restarted = new Service(db, store);
  await restarted.tick();
  const merged = service.get(parent);
  assert.equal(merged.token, original.token);
  assert.equal(merged.password, original.password);
  assert.equal(merged.expires, original.expires);
  assert.equal(merged.created, original.created);
  assert.equal(service.get(child).state, "merged");
  const files = unzipSync(store.objects.get(merged.output.key));
  assert.deepEqual(Object.keys(files), ["same.txt", "1_same.txt", "empty"]);
  assert.equal(Buffer.from(files["same.txt"]).toString(), "old");
  assert.equal(Buffer.from(files["1_same.txt"]).toString(), "new");
  assert.ok(merged.reserved > merged.output.size);
  store.failDelete = true;
  await restarted.tick();
  assert.ok(service.get(parent).reserved > merged.output.size);
  store.failDelete = false;
  await restarted.tick();
  assert.equal(service.get(parent).reserved, merged.output.size);
  assert.equal(store.objects.size, 1);
  await appendUpload(service, store, parent, [
    ["third.txt", Buffer.from("third")],
  ]);
  await restarted.tick();
  const again = service.get(parent);
  assert.equal(again.files.length, 4);
  assert.equal(
    Buffer.from(
      unzipSync(store.objects.get(again.output.key))["third.txt"],
    ).toString(),
    "third",
  );
  await restarted.tick();
  assert.equal(store.objects.size, 1);
  service.delete(parent);
  await restarted.tick();
  assert.equal(store.objects.size, 0);
});
test("cancelled/failed append never deletes or replaces the original; parent deletion cancels pending append", async () => {
  const { service, store } = await setup();
  const parent = await upload(service, store, [
      ["original", Buffer.from("keep")],
    ]),
    key = service.get(parent).output.key;
  let child = service.append(parent, [{ name: "new", size: 1 }]).id;
  await service.init(child, 1);
  service.delete(child);
  await service.tick();
  assert.equal(store.objects.get(key).toString(), "keep");
  assert.equal(service.get(parent).state, "ready");
  child = await appendUpload(service, store, parent, [
    ["new", Buffer.from("new")],
  ]);
  store.failGet = true;
  await service.tick();
  await service.tick();
  await service.tick();
  assert.equal(service.get(child).state, "failed");
  assert.equal(service.get(parent).output.key, key);
  assert.equal(service.get(parent).state, "ready");
  store.failGet = false;
  assert.throws(
    () => service.append(parent, [{ name: "retry", size: 1 }]),
    /очищается/,
  );
  await service.tick();
  assert.equal(store.objects.get(key).toString(), "keep");
  child = await appendUpload(service, store, parent, [
    ["new", Buffer.from("new")],
  ]);
  service.delete(parent);
  await service.tick();
  assert.equal(service.get(parent).state, "deleted");
  assert.equal(service.get(child).state, "deleted");
  assert.equal(store.objects.size, 0);
});
test("append enforces combined size/count quota, and expiry of the parent prevents further multipart permissions", async () => {
  const { service, store, db } = await setup();
  const parent = await upload(service, store, [["old", Buffer.from("x")]]);
  assert.throws(() =>
    service.append(
      parent,
      Array.from({ length: 100 }, () => ({ name: "x", size: 0 })),
    ),
  );
  assert.throws(() =>
    service.append(parent, [{ name: "huge", size: 2_000_000_000 }]),
  );
  const child = service.append(parent, [{ name: "new", size: 1 }]).id;
  await service.init(child, 1);
  db.prepare("UPDATE transfers SET expires=? WHERE id=?").run(
    Date.now() - 1,
    parent,
  );
  await assert.rejects(() => service.sign(child, 1, 1));
  await service.tick();
  assert.equal(service.get(child).reserved, 0);
  assert.equal(store.objects.size, 0);
});

test("deleting parent while append reads old archive cannot hang or publish the staged ZIP", async () => {
  const { service, store } = await setup();
  const parent = await upload(service, store, [
    ["a", Buffer.from("a")],
    ["b", Buffer.from("b")],
  ]);
  await service.tick();
  await service.tick();
  const child = await appendUpload(service, store, parent, [
    ["c", Buffer.from("c")],
  ]);
  const get = store.get.bind(store);
  store.get = async (...args) => {
    service.delete(parent);
    return get(...args);
  };
  await service.tick();
  assert.equal(service.get(parent).state, "deleting");
  assert.equal(service.get(child).state, "deleting");
  await service.tick();
  assert.equal(store.objects.size, 0);
  assert.equal(service.get(parent).reserved, 0);
  assert.equal(service.get(child).reserved, 0);
});

test("selected files can be removed to a single original, then emptied and repopulated under the same protected link", async () => {
  const { service, store, app } = await setup();
  const parent = await upload(
    service,
    store,
    [
      ["a.txt", Buffer.from("aaa")],
      ["b.txt", Buffer.from("bbb")],
      ["c.txt", Buffer.from("ccc")],
    ],
    "123456",
  );
  await service.tick();
  await service.tick();
  const original = service.get(parent),
    url = "/public/" + original.token;
  const recipient = request.agent(app);
  await post(recipient, url + "/unlock", { password: "123456" }).expect(200);
  service.removeFiles(parent, [0, 2]);
  assert.equal(service.get(parent).files.length, 3);
  await service.tick();
  const single = service.get(parent);
  assert.equal(single.files.length, 1);
  assert.equal(single.files[0].name, "b.txt");
  assert.equal(single.output.name, "b.txt");
  assert.equal(single.files[0].key, single.output.key);
  assert.equal(store.objects.get(single.output.key).toString(), "bbb");
  assert.equal(single.expires, original.expires);
  await service.tick();
  assert.equal(store.objects.size, 1);
  service.removeFiles(parent, [0]);
  assert.equal(service.get(parent).state, "empty");
  assert.equal((await recipient.get(url).expect(200)).body.files.length, 0);
  await recipient.get(url + "/download").expect(409);
  await service.tick();
  assert.equal(store.objects.size, 0);
  assert.equal(service.get(parent).reserved, 0);
  await appendUpload(service, store, parent, [
    ["replacement.txt", Buffer.from("replacement")],
  ]);
  await service.tick();
  const restored = service.get(parent);
  assert.equal(restored.token, original.token);
  assert.equal(restored.password, original.password);
  assert.equal(restored.files.length, 1);
  assert.equal(restored.output.name, "replacement.txt");
  assert.equal(
    store.objects.get(restored.output.key).toString(),
    "replacement",
  );
  await recipient.get(url + "/download").expect(200);
  await service.tick();
  assert.equal(store.objects.size, 1);
  await appendUpload(service, store, parent, [
    ["next.txt", Buffer.from("next")],
  ]);
  await service.tick();
  const zip = unzipSync(store.objects.get(service.get(parent).output.key));
  assert.deepEqual(Object.keys(zip), ["replacement.txt", "next.txt"]);
  service.delete(parent);
  await service.tick();
  assert.equal(store.objects.size, 0);
});
test("partial removal produces a flat ZIP and clearing holds quota until S3 confirms deletion", async () => {
  const { service, store } = await setup();
  const parent = await upload(service, store, [
    ["a", Buffer.from("a")],
    ["b", Buffer.from("b")],
    ["c", Buffer.from("c")],
  ]);
  await service.tick();
  await service.tick();
  service.removeFiles(parent, [1]);
  await service.tick();
  let t = service.get(parent);
  assert.deepEqual(Object.keys(unzipSync(store.objects.get(t.output.key))), [
    "a",
    "c",
  ]);
  await service.tick();
  const before = service.get(parent).reserved;
  service.removeFiles(parent, [0, 1]);
  store.failDelete = true;
  await service.tick();
  assert.equal(service.get(parent).state, "empty");
  assert.equal(service.get(parent).reserved, before);
  store.failDelete = false;
  await service.tick();
  assert.equal(service.get(parent).reserved, 0);
  assert.equal(store.objects.size, 0);
});

test("stale selected-file revisions cannot delete files from a newer transfer composition", async () => {
  const { service, store, agent } = await setup();
  const parent = await upload(service, store, [
    ["a", Buffer.from("a")],
    ["b", Buffer.from("b")],
  ]);
  await service.tick();
  const first = (await agent.get("/api/transfers")).body.find(
    (t) => t.id === parent,
  );
  await appendUpload(service, store, parent, [["c", Buffer.from("c")]]);
  await service.tick();
  await agent
    .delete("/api/transfers/" + parent + "/files")
    .set("Origin", env.PUBLIC_URL)
    .send({ indices: [0], revision: first.revision })
    .expect(409);
  assert.equal(service.get(parent).files.length, 3);
});

test("an emptied zero-byte transfer can be deleted without invalid S3 keys", async () => {
  const { service, store } = await setup();
  const parent = await upload(service, store, [["empty", Buffer.alloc(0)]]);
  service.removeFiles(parent, [0]);
  await service.tick();
  const purge = store.purge.bind(store);
  store.purge = async (id, keys) => {
    assert.ok(keys.every((k) => typeof k === "string" && k.length));
    return purge(id, keys);
  };
  service.delete(parent);
  await service.tick();
  assert.equal(service.get(parent).state, "deleted");
  assert.equal(store.objects.size, 0);
});

test("removing files after an earlier source-cleanup failure cannot orphan the removed source or free its quota early", async () => {
  const { service, store } = await setup();
  const parent = await upload(service, store, [
    ["a", Buffer.from("a")],
    ["b", Buffer.from("b")],
    ["c", Buffer.from("c")],
  ]);
  await service.tick();
  const blocked = service.get(parent).files[1].key,
    remove = store.remove.bind(store);
  store.remove = async (key) => {
    if (key === blocked) throw new Error("blocked deletion");
    return remove(key);
  };
  service.removeFiles(parent, [1]);
  await service.tick();
  assert.equal(service.get(parent).files.length, 2);
  assert.ok(store.objects.has(blocked));
  assert.ok(service.get(parent).reserved > service.get(parent).output.size);
  store.remove = remove;
  await service.tick();
  assert.equal(store.objects.size, 1);
  assert.ok(!store.objects.has(blocked));
  assert.equal(service.get(parent).reserved, service.get(parent).output.size);
});

test("interrupted reads of a previous ZIP keep the original available and can be retried", async () => {
  const { Readable } = await import("node:stream");
  const { service, store } = await setup();
  const parent = await upload(service, store, [
    ["a", Buffer.from("a")],
    ["b", Buffer.from("b")],
  ]);
  await service.tick();
  await service.tick();
  const key = service.get(parent).output.key,
    contents = store.objects.get(key);
  const child = await appendUpload(service, store, parent, [
      ["c", Buffer.from("c")],
    ]),
    get = store.get.bind(store);
  store.get = async (k, ...args) =>
    k === key
      ? {
          Body: Readable.from(
            (async function* () {
              yield contents.subarray(0, 25);
              throw new Error("connection interrupted");
            })(),
          ),
        }
      : get(k, ...args);
  await service.tick();
  assert.equal(service.get(parent).output.key, key);
  assert.equal(service.get(child).state, "queued");
  store.get = get;
  await service.tick();
  assert.equal(service.get(child).state, "merged");
  assert.deepEqual(
    Object.keys(unzipSync(store.objects.get(service.get(parent).output.key))),
    ["a", "b", "c"],
  );
});

test("short public codes migrate old links once and preserve protected alias access", async () => {
  const { mkdtempSync, mkdirSync } = await import("node:fs");
  mkdirSync("work", { recursive: true });
  const { join } = await import("node:path");
  const path = join(mkdtempSync("work/short-links-"), "flash.db");
  let db = openDB(path);
  let service = new Service(db, new FakeStore());
  const id = service.create([{ name: "file", size: 0 }], 0, "123456");
  assert.match(service.get(id).token, /^[A-Za-z0-9]{6}$/);
  assert.equal(id.length, 43);
  const old = "A".repeat(43);
  db.prepare(
    "UPDATE transfers SET token=?,state='ready',expires=NULL,output=? WHERE id=?",
  ).run(
    old,
    JSON.stringify({ key: id + "/source/0", size: 0, name: "file" }),
    id,
  );
  db.close();
  db = openDB(path);
  service = new Service(db, new FakeStore());
  const short = service.get(id).token;
  assert.match(short, /^[A-Za-z0-9]{6}$/);
  assert.equal(
    db.prepare("SELECT transfer_id FROM share_aliases WHERE token=?").get(old)
      .transfer_id,
    id,
  );
  const app = createApp(service, env),
    guest = request.agent(app);
  await guest
    .get("/public/" + old)
    .expect(200)
    .expect((r) => assert.equal(r.body.locked, true));
  const unlock = await post(guest, "/public/" + old + "/unlock", {
    password: "123456",
  }).expect(200);
  assert.ok(unlock.headers["set-cookie"][0].includes("Path=/public/" + old));
  await guest
    .get("/public/" + old)
    .expect(200)
    .expect((r) => assert.equal(r.body.files[0].name, "file"));
  db.close();
  db = openDB(path);
  assert.equal(
    db.prepare("SELECT token FROM transfers WHERE id=?").get(id).token,
    short,
  );
  assert.equal(db.prepare("SELECT count(*) n FROM share_aliases").get().n, 1);
  db.close();
});

test("bulk history removal hides records and denies downloads while preserving quota until cleanup", async () => {
  const { db, service, store, app, agent } = await setup();
  const first = await upload(service, store, [["first", Buffer.from("first")]]);
  const second = await upload(service, store, [
    ["second", Buffer.from("second")],
  ]);
  const keep = await upload(service, store, [["keep", Buffer.from("keep")]]);
  const url = "/public/" + service.get(first).token;
  const reserved = db.prepare("SELECT sum(reserved) n FROM transfers").get().n;
  await request(app)
    .delete("/api/history")
    .set("Origin", env.PUBLIC_URL)
    .send({ ids: [first] })
    .expect(401);
  await agent
    .delete("/api/history")
    .send({ ids: [first] })
    .expect(403);
  await agent
    .delete("/api/history")
    .set("Origin", env.PUBLIC_URL)
    .send({ ids: [first, "missing"] })
    .expect(404);
  assert.equal(service.get(first).state, "ready");
  await agent
    .delete("/api/history")
    .set("Origin", env.PUBLIC_URL)
    .send({ ids: [first, second, first] })
    .expect(200);
  await request(app).get(url).expect(404);
  assert.equal(
    db.prepare("SELECT sum(reserved) n FROM transfers").get().n,
    reserved,
  );
  const history = await agent.get("/api/transfers").expect(200);
  assert.deepEqual(
    history.body.map((t) => t.id),
    [keep],
  );
  await service.tick();
  assert.equal(service.get(first).state, "deleted");
  assert.equal(service.get(second).state, "deleted");
  assert.equal(service.get(keep).state, "ready");
  await agent
    .delete("/api/history")
    .set("Origin", env.PUBLIC_URL)
    .send({ ids: [first, second] })
    .expect(200);
  assert.equal((await agent.get("/api/transfers")).body.length, 1);
  db.close();
});

test("Raw preserves UTF-8 bytes, validates content and obeys password, aliases, ranges, expiry and deletion", async () => {
  const { db, service, store, app } = await setup();
  const source = Buffer.from(
    '\ufeff{\r\n\t"message": "Привет 🌍",\r\n\r\n\t"html": "<script>alert(1)</script>"\r\n}\r\n',
  );
  const id = await upload(service, store, [["package.json", source]], "123456"),
    t = service.get(id),
    url = "/raw/" + t.token,
    publicURL = "/public/" + t.token;
  const guest = request.agent(app);
  await guest
    .get(publicURL)
    .expect(200)
    .expect((r) => assert.deepEqual(r.body, { locked: true }));
  await guest
    .get(url)
    .expect(401)
    .expect("Content-Type", /text\/plain/);
  await post(guest, publicURL + "/unlock", { password: "123456" }).expect(200);
  const info = await guest.get(publicURL).expect(200);
  assert.equal(info.body.preview, true);
  assert.equal(info.body.etag, t.output.etag);
  const raw = await guest
    .get(url)
    .buffer(true)
    .parse((res, cb) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    })
    .expect(200)
    .expect("Content-Type", /text\/plain; charset=utf-8/)
    .expect("X-Content-Type-Options", "nosniff");
  assert.deepEqual(raw.body, source);
  await guest
    .head(url)
    .expect(200)
    .expect("Content-Length", String(source.length));
  await guest
    .get(url)
    .set("Range", "bytes=0-2")
    .expect(206)
    .expect("Content-Range", `bytes 0-2/${source.length}`);
  await guest.get(url).set("If-Match", '"stale"').expect(412);
  await guest.get(url).set("If-None-Match", t.output.etag).expect(304);
  const old = "L".repeat(43);
  db.prepare("INSERT INTO share_aliases(token,transfer_id) VALUES(?,?)").run(
    old,
    id,
  );
  const alias = request.agent(app);
  await post(alias, "/public/" + old + "/unlock", {
    password: "123456",
  }).expect(200);
  await alias.get("/raw/" + old).expect(200);
  db.prepare("UPDATE transfers SET expires=? WHERE id=?").run(
    Date.now() - 1,
    id,
  );
  await guest.get(url).expect(404);
  db.prepare("UPDATE transfers SET expires=NULL WHERE id=?").run(id);
  service.delete(id);
  await guest.get(url).expect(404);
  const binary = await upload(service, store, [
    ["not-text.txt", Buffer.from([0, 255, 1])],
  ]);
  await request(app)
    .get("/raw/" + service.get(binary).token)
    .expect(415);
  const huge = await upload(service, store, [
    ["huge.txt", Buffer.alloc(5 * 1024 * 1024 + 1, 65)],
  ]);
  await request(app)
    .get("/public/" + service.get(huge).token)
    .expect(200)
    .expect((r) => assert.equal(r.body.preview, false));
  await request(app)
    .get("/raw/" + service.get(huge).token)
    .expect(415);
  const multi = await upload(service, store, [
    ["a.txt", Buffer.from("a")],
    ["b.txt", Buffer.from("b")],
  ]);
  await service.tick();
  await request(app)
    .get("/raw/" + service.get(multi).token)
    .expect(415);
  db.close();
});

test("deleting a transfer while Raw is reading cannot disclose cached or newly read content", async () => {
  const { db, service, store, app } = await setup();
  const id = await upload(service, store, [
    ["code.py", Buffer.from("print(1)")],
  ]);
  const original = store.get.bind(store);
  let release, started;
  const reading = new Promise((r) => (started = r)),
    gate = new Promise((r) => (release = r));
  store.get = async (...args) => {
    started();
    await gate;
    return original(...args);
  };
  const result = request(app)
    .get("/raw/" + service.get(id).token)
    .then((r) => r);
  await reading;
  service.delete(id);
  release();
  assert.equal((await result).status, 404);
  db.close();
});

test("archive text preview reads only directory and selected member ranges with protected access and immutable checks", async () => {
  const { db, service, store, app } = await setup();
  const source = Buffer.from("# Заметки\r\n\r\n- пункт 🌍\r\n");
  const id = await upload(
    service,
    store,
    [
      ["large.bin", Buffer.alloc(9 * 1024 * 1024, 2)],
      ["notes.md", source],
      ["empty.txt", Buffer.alloc(0)],
    ],
    "123456",
  );
  await service.tick();
  await service.tick();
  const t = service.get(id),
    token = t.token,
    guest = request.agent(app);
  await guest.get("/raw/" + token + "/1").expect(401);
  await post(guest, "/public/" + token + "/unlock", {
    password: "123456",
  }).expect(200);
  const metadata = await guest.get("/public/" + token).expect(200);
  assert.deepEqual(
    metadata.body.files.map((f) => f.preview),
    [false, true, true],
  );
  const get = store.get.bind(store),
    ranges = [];
  store.get = async (key, options = {}) => {
    ranges.push(options.Range);
    return get(key, options);
  };
  store.failGet = true;
  await guest
    .get("/raw/" + token + "/1")
    .timeout({ deadline: 2000 })
    .expect(503);
  store.failGet = false;
  const raw = await guest
    .get("/raw/" + token + "/1")
    .buffer(true)
    .parse((res, cb) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    })
    .expect(200)
    .expect("Content-Type", /text\/plain/);
  assert.deepEqual(raw.body, source);
  assert.ok(ranges.length >= 3);
  assert.ok(ranges.every(Boolean));
  assert.ok(
    ranges.reduce((sum, r) => {
      const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(r);
      return sum + Number(end) - Number(start) + 1;
    }, 0) < 200000,
    "should not fetch the large binary member",
  );
  await guest
    .head("/raw/" + token + "/1")
    .expect(200)
    .expect("Content-Length", String(source.length));
  await guest
    .get("/raw/" + token + "/1")
    .set("Range", "bytes=0-3")
    .expect(206)
    .expect("# З");
  await guest
    .get("/public/" + token + "/files/1/download")
    .expect(200)
    .expect("Content-Disposition", /notes.md/);
  await guest
    .get("/raw/" + token + "/2")
    .expect(200)
    .expect("Content-Length", "0");
  await guest.get("/raw/" + token + "/0").expect(415);
  await guest.get("/raw/" + token + "/999").expect(404);
  await guest.get("/raw/" + token + "/-1").expect(404);
  await guest
    .get("/raw/" + token + "/1")
    .set("If-Match", '"stale"')
    .expect(412);
  service.delete(id);
  await guest.get("/raw/" + token + "/1").expect(404);
  db.close();
});

test("owner text replacement preserves link, password, name and expiry; stale saves and cancelled drafts keep originals", async () => {
  const { app, agent, service, store } = await setup();
  const id = await upload(
    service,
    store,
    [["source.py", Buffer.from("print('old')\n")]],
    "123456",
  );
  const original = service.get(id),
    path = "/api/transfers/" + id;
  const owner = (await agent.get("/api/transfers")).body.find(
    (t) => t.id === id,
  );
  await request(app)
    .get(path + "/text")
    .expect(401);
  assert.equal(
    (
      await agent
        .get(path + "/text")
        .set("If-Match", '"' + owner.revision + '"')
        .expect(200)
    ).text,
    "print('old')\n",
  );
  const create = () =>
    post(agent, path + "/replace", {
      files: [{ name: "ignored.txt", size: 13 }],
      revision: owner.revision,
    });
  const draft = (await create().expect(201)).body;
  await create().expect(409);
  assert.equal(service.get(id).output.key, original.output.key);
  service.delete(draft.id);
  await service.tick();
  const next = (await create().expect(201)).body;
  const bytes = Buffer.from("print('new')\n");
  await service.init(next.id, 0);
  const f = service.get(next.id).files[0];
  await store.send("UploadPart", {
    Key: f.key,
    UploadId: f.upload,
    PartNumber: 1,
    Body: bytes,
  });
  await service.finishFile(next.id, 0);
  await service.finish(next.id);
  await service.tick();
  const updated = service.get(id);
  for (const key of ["token", "password", "expires", "created"])
    assert.equal(updated[key], original[key]);
  assert.equal(updated.files[0].name, "source.py");
  assert.equal(
    (await agent.get(path + "/text").expect(200)).text,
    bytes.toString(),
  );
  await create().expect(409);
  await agent
    .get(path + "/text")
    .set("If-Match", '"' + owner.revision + '"')
    .expect(409);
  await request(app)
    .get("/raw/" + updated.token)
    .expect(401);
  const reader = request.agent(app);
  await post(reader, "/public/" + updated.token + "/unlock", {
    password: "123456",
  }).expect(200);
  assert.equal(
    (await reader.get("/raw/" + updated.token).expect(200)).text,
    bytes.toString(),
  );
  const rev = (await agent.get("/api/transfers")).body.find(
    (t) => t.id === id,
  ).revision;
  await post(agent, path + "/replace", {
    files: [{ name: "x", size: 5242881 }],
    revision: rev,
  }).expect(400);
});

test("owner can update retention and a recoverable encrypted PIN; old grants are revoked and public data never exposes PIN", async () => {
  const { app, agent, service, store, db } = await setup();
  const id = await upload(service, store, [
      ["settings.txt", Buffer.from("content")],
    ]),
    t = service.get(id),
    path = "/api/transfers/" + id;
  await request(app)
    .get(path + "/password")
    .expect(401);
  await request(app)
    .patch(path + "/settings")
    .set("Origin", env.PUBLIC_URL)
    .send({ password: "123456" })
    .expect(401);
  const patch = (body) =>
    agent
      .patch(path + "/settings")
      .set("Origin", env.PUBLIC_URL)
      .send(body);
  await patch({ password: "123456", ttl: 0 }).expect(200);
  assert.equal(service.get(id).expires, null);
  assert.equal(
    (await agent.get(path + "/password").expect(200)).body.password,
    "123456",
  );
  assert.ok(
    !db
      .prepare("SELECT password_cipher FROM transfers WHERE id=?")
      .get(id)
      .password_cipher.includes("123456"),
  );
  const reader = request.agent(app),
    url = "/public/" + t.token;
  await post(reader, url + "/unlock", { password: "123456" }).expect(200);
  await reader.get("/raw/" + t.token).expect(200);
  await patch({ password: "654321", ttl: 3600 }).expect(200);
  assert.equal(service.get(id).output.key, t.output.key);
  assert.ok(Math.abs(service.get(id).expires - Date.now() - 3600000) < 2000);
  assert.equal((await reader.get(url).expect(200)).body.locked, true);
  await reader.get("/raw/" + t.token).expect(401);
  await post(reader, url + "/unlock", { password: "123456" }).expect(401);
  await post(reader, url + "/unlock", { password: "654321" }).expect(200);
  assert.equal(
    (await reader.get("/raw/" + t.token).expect(200)).text,
    "content",
  );
  const data = (await reader.get(url)).body;
  assert.ok(!JSON.stringify(data).includes("654321"));
  assert.ok(!("hasPassword" in data));
  await patch({ password: "" }).expect(200);
  assert.equal((await agent.get(path + "/password")).body.hasPassword, false);
  await request(app)
    .get("/raw/" + t.token)
    .expect(200);
  await patch({ password: "bad" }).expect(400);
  await patch({ ttl: 123 }).expect(400);
  db.prepare("UPDATE transfers SET expires=? WHERE id=?").run(
    Date.now() - 1,
    id,
  );
  await patch({ ttl: 0 }).expect(404);
});

test("media previews and general members respect password, Range, exact bytes and streamed subset ZIPs", async () => {
  const { app, agent, service, store } = await setup();
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082",
    "hex",
  );
  const large = Buffer.alloc(6 * 1024 * 1024, 65);
  const id = await upload(
    service,
    store,
    [
      ["photo.png", png],
      ["данные.bin", large],
      ["note.txt", Buffer.from("note")],
    ],
    "123456",
  );
  await service.tick();
  const t = service.get(id),
    url = "/public/" + t.token,
    reader = request.agent(app);
  await reader.get("/preview/" + t.token + "/0").expect(401);
  await post(reader, url + "/unlock", { password: "123456" }).expect(200);
  const info = (await reader.get(url)).body;
  assert.equal(info.files[0].media, "image");
  assert.equal(info.files[0].preview, false);
  await reader
    .head("/preview/" + t.token + "/0")
    .expect(200)
    .expect("Content-Type", /image\/png/)
    .expect("Content-Length", String(png.length));
  const bytes = await reader
    .get(url + "/files/1/download")
    .set("Range", "bytes=1024-2047")
    .expect(206);
  assert.deepEqual(bytes.body, large.subarray(1024, 2048));
  const image = await reader
    .get("/preview/" + t.token + "/0")
    .set("Range", "bytes=0-7")
    .expect(206);
  assert.deepEqual(image.body, png.subarray(0, 8));
  await reader.get("/preview/" + t.token + "/2").expect(415);
  const parse = (res, cb) => {
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => cb(null, Buffer.concat(chunks)));
  };
  const selection = await post(reader, url + "/selection", { indices: [2, 0] })
    .buffer(true)
    .parse(parse)
    .expect(200);
  const selected = unzipSync(selection.body);
  assert.deepEqual(Object.keys(selected), ["note.txt", "photo.png"]);
  assert.deepEqual(Buffer.from(selected["photo.png"]), png);
  await post(reader, url + "/selection", { indices: [-1] }).expect(400);
  await post(reader, url + "/selection", { indices: [0, 0] }).expect(400);
  await post(request(app), url + "/selection", { indices: [0, 2] }).expect(401);
  await agent
    .get("/api/transfers/" + id + "/media/0?download=1")
    .expect(200)
    .expect("Content-Disposition", /attachment/);
});
test("renaming a transfer and its files preserves its link, PIN and expiry and atomically rebuilds archives", async () => {
  const { agent, service, store } = await setup();
  const id = await upload(
    service,
    store,
    [
      ["a.txt", Buffer.from("a")],
      ["b.txt", Buffer.from("b")],
    ],
    "123456",
  );
  await service.tick();
  const original = service.get(id),
    record = (await agent.get("/api/transfers")).body.find((t) => t.id === id);
  await agent
    .patch("/api/transfers/" + id + "/settings")
    .set("Origin", env.PUBLIC_URL)
    .send({
      title: "Документы",
      names: ["first.py", "second.md"],
      revision: record.revision,
    })
    .expect(200);
  assert.equal(service.get(id).output.key, original.output.key);
  await service.tick();
  const updated = service.get(id);
  assert.deepEqual(
    updated.files.map((f) => f.name),
    ["first.py", "second.md"],
  );
  for (const key of ["token", "password", "expires"])
    assert.equal(updated[key], original[key]);
  assert.deepEqual(
    Object.keys(unzipSync(store.objects.get(updated.output.key))),
    ["first.py", "second.md"],
  );
  await agent
    .patch("/api/transfers/" + id + "/settings")
    .set("Origin", env.PUBLIC_URL)
    .send({ names: ["bad", "bad"], revision: record.revision })
    .expect(409);
  const single = await upload(service, store, [
    ["old.txt", Buffer.from("data")],
  ]);
  const r = (await agent.get("/api/transfers")).body.find(
    (t) => t.id === single,
  );
  await agent
    .patch("/api/transfers/" + single + "/settings")
    .set("Origin", env.PUBLIC_URL)
    .send({ names: ["new.md"], revision: r.revision })
    .expect(200);
  assert.equal(service.get(single).output.name, "new.md");
});
test("one-time links survive HEAD, Raw, previews and failed downloads, then close after a completed download", async () => {
  const { app, agent, service, store } = await setup();
  const id = await upload(service, store, [
      ["note.txt", Buffer.from("content")],
    ]),
    t = service.get(id),
    url = "/public/" + t.token;
  const settings = (oneTime) =>
    agent
      .patch("/api/transfers/" + id + "/settings")
      .set("Origin", env.PUBLIC_URL)
      .send({ oneTime });
  await settings(true).expect(200);
  await request(app)
    .head(url + "/download")
    .expect(200);
  await request(app)
    .get("/raw/" + t.token)
    .expect(200);
  assert.equal(service.get(id).consumed, 0);
  store.failGet = true;
  await request(app)
    .get(url + "/download")
    .expect(503);
  assert.equal(service.get(id).consumed, 0);
  store.failGet = false;
  await request(app)
    .get("/raw/" + t.token)
    .set("Range", "bytes=0-2")
    .expect(206);
  assert.equal(service.get(id).consumed, 0);
  await request(app)
    .get(url + "/download")
    .set("Range", "bytes=3-6")
    .expect(200)
    .expect("Accept-Ranges", "none");
  assert.equal(service.get(id).consumed, 1);
  await request(app).get(url).expect(404);
  await request(app)
    .get("/raw/" + t.token)
    .expect(404);
  await settings(false).expect(200);
  await request(app).get(url).expect(200);
  await settings(true).expect(200);
  await request(app)
    .get(url + "/download")
    .expect(200);
  await request(app)
    .get(url + "/download")
    .expect(404);
});

test("upload recovery metadata is owner-only and rejects completed or expired uploads", async () => {
  const { app, agent, service, store, db } = await setup();
  const id = service.create([{ name: "resume.bin", size: 8 }], 3600, "");
  await request(app)
    .get("/api/uploads/" + id)
    .expect(401);
  const result = (await agent.get("/api/uploads/" + id).expect(200)).body;
  assert.deepEqual(result, {
    id,
    parentId: null,
    offset: 0,
    files: [{ name: "resume.bin", size: 8 }],
  });
  db.prepare("UPDATE transfers SET created=? WHERE id=?").run(
    Date.now() - 86400001,
    id,
  );
  await agent.get("/api/uploads/" + id).expect(409);
  const complete = await upload(service, store, [
    ["done.txt", Buffer.from("done")],
  ]);
  await agent.get("/api/uploads/" + complete).expect(409);
});

test("an incomplete one-time response does not consume the link and can be retried", async () => {
  const { app, agent, service, store } = await setup();
  const id = await upload(service, store, [
    ["file.bin", Buffer.from("complete")],
  ]);
  const t = service.get(id);
  await agent
    .patch("/api/transfers/" + id + "/settings")
    .set("Origin", env.PUBLIC_URL)
    .send({ oneTime: true })
    .expect(200);
  const get = store.get.bind(store),
    { Readable } = await import("node:stream");
  store.get = async () => ({ Body: Readable.from([Buffer.from("bad")]) });
  await assert.rejects(
    async () => request(app).get("/public/" + t.token + "/download"),
    /aborted|reset|socket|closed/i,
  );
  assert.equal(service.get(id).consumed, 0);
  store.get = get;
  await request(app)
    .get("/public/" + t.token + "/download")
    .expect(200);
  assert.equal(service.get(id).consumed, 1);
});

test("known Office and binary formats are not offered as text editors, and one-time lifetime is exclusive", async () => {
  const { fileTextCandidate } = await import("../server/text.js");
  for (const name of [
    "book.xlsx",
    "book.xls",
    "book.xlsm",
    "letter.doc",
    "letter.docx",
    "show.pptx",
    "book.ods",
    "archive.zip",
    "data.bin",
    "file.unknown",
  ])
    assert.equal(fileTextCandidate({ name, size: 50 }), false, name);
  for (const name of [
    "readme.md",
    "README",
    "main.py",
    "config.json",
    "table.csv",
    ".env.example",
    "Dockerfile",
    "Cargo.lock",
  ])
    assert.equal(fileTextCandidate({ name, size: 50 }), true, name);
  const { app, agent, service, store } = await setup();
  const id = await upload(service, store, [["a.txt", Buffer.from("a")]]);
  await agent
    .patch("/api/transfers/" + id + "/settings")
    .set("Origin", env.PUBLIC_URL)
    .send({ oneTime: true, demo: true })
    .expect(200);
  const t = service.get(id);
  assert.equal(t.expires, null);
  assert.equal(t.ttl, 0);
  const info = (
    await request(app)
      .get("/public/" + t.token)
      .expect(200)
  ).body;
  assert.equal(info.demo, true);
  assert.equal(info.oneTime, true);
  await agent
    .patch("/api/transfers/" + id + "/settings")
    .set("Origin", env.PUBLIC_URL)
    .send({ ttl: 3600 })
    .expect(200);
  assert.equal(service.get(id).one_time, 0);
  assert.ok(service.get(id).expires > Date.now());
  const created = (
    await post(agent, "/api/transfers", {
      files: [{ name: "new.txt", size: 0 }],
      ttl: 3600,
      oneTime: true,
    }).expect(201)
  ).body;
  assert.equal(service.get(created.id).one_time, 1);
  assert.equal(service.get(created.id).ttl, 0);
});

test("unknown navigations use the app error page while API and Raw errors keep machine-readable formats", async () => {
  const { service } = await setup();
  const app = createApp(service, env, {
    indexHTML: await readFile(
      new URL("../index.html", import.meta.url),
      "utf8",
    ),
  });
  const page = await request(app)
    .get("/missing-page/relative-link")
    .set("Accept", "text/html")
    .expect(404);
  assert.match(page.headers["content-type"], /text\/html/);
  assert.match(page.text, /du-error-status/);
  assert.ok(!page.text.includes("Cannot GET"));
  assert.match(page.headers["content-security-policy"], /nonce-/);
  const raw = await request(app)
    .get("/raw/missing")
    .set("Accept", "text/html")
    .expect(404);
  assert.match(raw.headers["content-type"], /text\/html/);
  assert.ok(!raw.headers["content-disposition"]);
  await request(app)
    .get("/raw/missing")
    .expect(404)
    .expect("Content-Type", /text\/plain/);
  await request(app)
    .get("/missing-page")
    .set("Accept", "application/json")
    .expect(404)
    .expect("Content-Type", /application\/json/);
});

test("folder paths remain addressable and sandboxed static sites preserve originals, password, expiry and deletion", async () => {
  const { app, service, store, agent, db } = await setup();
  const html = Buffer.from(
    '<!doctype html><html><head><link rel="stylesheet" href="/assets/a.css"></head><body><h1>Site</h1><script type="module" src="/assets/a.js"></script><script>document.body.dataset.inline="yes"</script><a href="docs/page.html">Next</a></body></html>',
  );
  const id = await upload(
    service,
    store,
    [
      ["project/index.html", html],
      [
        "project/assets/a.css",
        Buffer.from('body{background:url("/assets/a.png")}'),
      ],
      [
        "project/assets/a.js",
        Buffer.from(
          'import value from "/assets/data.js";document.body.dataset.asset="/assets/a.png";',
        ),
      ],
      ["project/assets/data.js", Buffer.from("export default 1;")],
      ["project/assets/a.png", Buffer.from([1, 2, 3, 4])],
      ["project/docs/page.html", Buffer.from("<p>Next page</p>")],
      ["project/README.md", Buffer.from("# Docs\n\n[Next](docs/next.md)")],
      ["project/docs/next.md", Buffer.from("# Next\n")],
    ],
    "123456",
  );
  await service.tick();
  const t = service.get(id),
    url = "/public/" + t.token;
  assert.equal(t.files[0].name, "project/index.html");
  assert.deepEqual(
    Object.keys(unzipSync(store.objects.get(t.output.key))),
    t.files.map((file) => file.name),
  );
  await agent
    .patch("/api/transfers/" + id + "/settings")
    .set("Origin", env.PUBLIC_URL)
    .send({ published: true })
    .expect(200);
  assert.equal((await request(app).get(url)).body.locked, true);
  await post(agent, url + "/unlock", { password: "123456" }).expect(200);
  await agent
    .patch("/api/transfers/" + id + "/settings")
    .set("Origin", env.PUBLIC_URL)
    .send({ published: true })
    .expect(200);
  const meta = (await agent.get(url).expect(200)).body;
  assert.ok(meta.site);
  const page = await request(app).get(meta.site).expect(200);
  assert.match(
    page.headers["content-security-policy"],
    /sandbox allow-scripts/,
  );
  assert.ok(
    !page.headers["content-security-policy"].includes("allow-same-origin"),
  );
  assert.ok(!page.headers["content-security-policy"].includes("unsafe-inline"));
  assert.match(page.headers["content-security-policy"], /sha256-/);
  const base = meta.site.slice(0, -"index.html".length);
  assert.ok(page.text.includes(base + "assets/a.css"));
  const css = await request(app)
    .get(base + "assets/a.css")
    .expect(200);
  assert.ok(css.text.includes(base + "assets/a.png"));
  const js = await request(app)
    .get(base + "assets/a.js")
    .expect(200);
  assert.ok(js.text.includes(base + "assets/data.js"));
  assert.equal(js.headers["access-control-allow-origin"], "*");
  await request(app).head(meta.site).expect(200);
  const range = await request(app)
    .get(base + "assets/a.png")
    .set("Range", "bytes=1-2")
    .expect(206);
  assert.deepEqual(range.body, Buffer.from([2, 3]));
  const original = await agent.get(url + "/files/0/download").expect(200);
  assert.equal(original.text || original.body.toString(), html.toString());
  await request(app)
    .get(base + "missing.html")
    .expect(404);
  await request(app)
    .get(
      meta.site.replace(
        /\/site\/[^/]+\/[^/]+\//,
        "/site/" + t.token + "/invalid/",
      ),
    )
    .expect(404);
  await agent
    .patch("/api/transfers/" + id + "/settings")
    .set("Origin", env.PUBLIC_URL)
    .send({ password: "654321" })
    .expect(200);
  await request(app).get(meta.site).expect(404);
  await post(agent, url + "/unlock", { password: "654321" }).expect(200);
  const updatedSite = (await agent.get(url).expect(200)).body.site;
  assert.notEqual(updatedSite, meta.site);
  await request(app).get(updatedSite).expect(200);
  db.prepare("UPDATE transfers SET expires=? WHERE id=?").run(
    Date.now() - 1,
    id,
  );
  await request(app).get(updatedSite).expect(404);
  db.prepare(
    "UPDATE transfers SET expires=NULL,state='deleted' WHERE id=?",
  ).run(id);
  await request(app).get(updatedSite).expect(404);
});

test("publication blocks public access, revokes old capabilities and hides deleted or expired history", async () => {
  const { app, service, store, agent, db } = await setup();
  const id = await upload(service, store, [
    ["index.html", Buffer.from("<h1>Site</h1>")],
  ]);
  const token = service.get(id).token;
  const settings = (body) =>
    agent
      .patch("/api/transfers/" + id + "/settings")
      .set("Origin", env.PUBLIC_URL)
      .send(body);
  await request(app)
    .get("/public/" + token)
    .expect(404);
  await settings({ published: true }).expect(200);
  const site = (await request(app).get("/public/" + token)).body.site;
  await request(app).get(site).expect(200);
  await settings({ published: false }).expect(200);
  await request(app).get(site).expect(404);
  await request(app)
    .get("/public/" + token + "/download")
    .expect(404);
  await settings({ published: true }).expect(200);
  const resumed = (await request(app).get("/public/" + token)).body.site;
  assert.notEqual(site, resumed);
  await request(app).get(site).expect(404);
  await request(app).get(resumed).expect(200);
  assert.ok((await agent.get("/api/transfers")).body.some((t) => t.id === id));
  db.prepare("UPDATE transfers SET expires=? WHERE id=?").run(
    Date.now() - 1,
    id,
  );
  assert.ok(!(await agent.get("/api/transfers")).body.some((t) => t.id === id));
  db.prepare(
    "UPDATE transfers SET expires=NULL,state='deleted' WHERE id=?",
  ).run(id);
  assert.ok(!(await agent.get("/api/transfers")).body.some((t) => t.id === id));
  await request(app).get(resumed).expect(404);
});

test("custom domains isolate DU APIs, preserve website bytes and MIME, enforce password and SPA routing", async () => {
  const { app, service, store, agent } = await setup();
  const html = '<!doctype html><h1>Site</h1><script src="/app.js"></script>';
  const id = await upload(
    service,
    store,
    [
      ["project/index.html", Buffer.from(html)],
      ["project/app.js.Без названия", Buffer.from("window.test=1;")],
      ["project/ScriptResource.axd", Buffer.from("window.axd=1;")],
    ],
    "123456",
  );
  await service.tick();
  const settings = (body) =>
    agent
      .patch("/api/transfers/" + id + "/settings")
      .set("Origin", env.PUBLIC_URL)
      .send(body);
  await settings({ domain: "https://site.example.com" }).expect(400);
  await settings({
    published: true,
    domain: "site.example.com",
    spa: true,
  }).expect(200);
  const get = (path) => request(app).get(path).set("Host", "site.example.com");
  await get("/").set("Accept", "text/html").expect(401);
  await get("/api/transfers").expect(401);
  await request(app)
    .post("/.du/unlock")
    .set("Host", "site.example.com")
    .set("Origin", "http://evil.example.com")
    .type("form")
    .send({ password: "123456" })
    .expect(403);
  const unlock = await request(app)
    .post("/.du/unlock")
    .set("Host", "site.example.com")
    .set("Origin", "http://site.example.com")
    .type("form")
    .send({ password: "123456", next: "//evil.example.com" })
    .expect(303);
  assert.equal(unlock.headers.location, "/");
  const cookie = unlock.headers["set-cookie"]
    .map((v) => v.split(";")[0])
    .join("; ");
  const page = await get("/").set("Cookie", cookie).expect(200);
  assert.equal(page.text, html);
  assert.ok(!page.headers["content-security-policy"].includes("sandbox"));
  const js = await get(
    "/app.js.%D0%91%D0%B5%D0%B7%20%D0%BD%D0%B0%D0%B7%D0%B2%D0%B0%D0%BD%D0%B8%D1%8F",
  )
    .set("Cookie", cookie)
    .expect(200);
  assert.match(js.headers["content-type"], /javascript/);
  assert.equal(js.text, "window.test=1;");
  assert.match(
    (await get("/ScriptResource.axd").set("Cookie", cookie).expect(200))
      .headers["content-type"],
    /javascript/,
  );
  const fallback = await get("/nested/route")
    .set("Cookie", cookie)
    .set("Accept", "text/html")
    .expect(200);
  assert.match(fallback.text, /<base href="\/">/);
  await get("/missing.js")
    .set("Cookie", cookie)
    .set("Accept", "text/html")
    .expect(404);
  await get("/api/transfers").set("Cookie", cookie).expect(404);
  await request(app)
    .get("/api/transfers")
    .set("Host", "unknown.example.com")
    .expect(404);
  await settings({ published: false }).expect(200);
  await get("/").set("Cookie", cookie).expect(404);
  await settings({ published: true }).expect(200);
  await get("/").set("Cookie", cookie).expect(401);
  const other = await upload(service, store, [
    ["index.html", Buffer.from("Other")],
  ]);
  await agent
    .patch("/api/transfers/" + other + "/settings")
    .set("Origin", env.PUBLIC_URL)
    .send({ domain: "site.example.com" })
    .expect(409);
});

test("static 404.html keeps its status and assets; paused sites never serve a custom error page", async () => {
  const { app, service, store, agent } = await setup();
  const id = await upload(service, store, [
    ["project/index.html", Buffer.from("<h1>Home</h1>")],
    [
      "project/404.html",
      Buffer.from(
        '<h1>Not found</h1><link rel="stylesheet" href="/error.css">',
      ),
    ],
    ["project/error.css", Buffer.from("h1{color:black}")],
  ]);
  await service.tick();
  const patch = (body) =>
    agent
      .patch("/api/transfers/" + id + "/settings")
      .set("Origin", env.PUBLIC_URL)
      .send(body);
  await patch({ published: true, domain: "site.example.com" }).expect(200);
  const meta = (await request(app).get("/public/" + service.get(id).token))
    .body;
  const root = meta.site.slice(0, -"index.html".length);
  const preview = await request(app)
    .get(root + "missing")
    .set("Accept", "text/html")
    .expect(404);
  assert.match(preview.text, /<h1>Not found<\/h1>/);
  assert.ok(preview.text.includes(root + "error.css"));
  assert.ok(preview.text.includes('<base href="' + root + '">'));
  const direct = await request(app)
    .get("/nested/missing")
    .set("Host", "site.example.com")
    .set("Accept", "text/html")
    .expect(404);
  assert.match(direct.text, /<h1>Not found<\/h1>/);
  assert.match(direct.text, /<base href="\/">/);
  const asset = await request(app)
    .get("/missing.js")
    .set("Host", "site.example.com")
    .expect(404);
  assert.ok(!asset.text.includes("<h1>Not found"));
  await patch({ published: false }).expect(200);
  const paused = await request(app)
    .get("/")
    .set("Host", "site.example.com")
    .set("Accept", "text/html")
    .expect(404);
  assert.ok(!paused.text.includes("<h1>Not found"));
  assert.match(paused.text, /class="unavailable"/);
  await request(app)
    .get("/public/" + service.get(id).token + "/download")
    .expect(404);
});

test("an empty folder remains a directory through append, rename and file removal", async () => {
  const { service, store } = await setup();
  const id = service.create(
    [{ name: "project/empty/", size: 0, directory: true }],
    0,
    "",
  );
  await service.init(id, 0);
  await service.finish(id);
  await service.tick();
  let t = service.get(id);
  assert.equal(t.state, "ready");
  assert.ok(unzipSync(store.objects.get(t.output.key))["project/empty/"]);
  const appended = service.append(id, [{ name: "project/readme.md", size: 0 }]);
  await service.init(appended.id, appended.offset);
  await service.finish(appended.id);
  await service.tick();
  t = service.get(id);
  assert.equal(t.files.length, 2);
  assert.equal(t.files[0].directory, true);
  service.rename(id, ["project/empty/", "project/README.md"], revision(t));
  await service.tick();
  t = service.get(id);
  assert.ok(unzipSync(store.objects.get(t.output.key))["project/empty/"]);
  service.removeFiles(id, [1], revision(t));
  await service.tick();
  t = service.get(id);
  assert.ok(unzipSync(store.objects.get(t.output.key))["project/empty/"]);
});
