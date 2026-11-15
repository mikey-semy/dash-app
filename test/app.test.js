import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { unzipSync } from "fflate";
import {
  archiveName,
  openDB,
  PART,
  range,
  safeNames,
  reservation,
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
