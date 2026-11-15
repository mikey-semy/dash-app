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
