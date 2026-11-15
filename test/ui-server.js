import express from "express";
import { openDB } from "../server/core.js";
import { Service } from "../server/service.js";
import { createApp } from "../server/app.js";
import { FakeStore } from "./fake.js";
const store = new FakeStore();
store.sign = async (key, id, part) =>
  `http://127.0.0.1:3001/fake/${id}/${part}`;
const service = new Service(openDB(":memory:"), store);
const host = express();
host.post("/__shutdown", (req, res) => {
  res.end();
  clearInterval(timer);
  server.close();
  setTimeout(() => process.exit(0), 50);
});
host.put(
  "/fake/:id/:part",
  express.raw({ type: () => true, limit: "9mb" }),
  async (req, res) => {
    const u = store.uploads.get(req.params.id);
    if (!u) return res.sendStatus(404);
    await store.send("UploadPart", {
      Key: u.key,
      UploadId: req.params.id,
      PartNumber: Number(req.params.part),
      Body: req.body,
    });
    res.set("ETag", '"part"').end();
  },
);
host.use(
  createApp(service, {
    PUBLIC_URL: "http://127.0.0.1:3001",
    ADMIN_PASSWORD: "123456",
    S3_ENDPOINT: "http://127.0.0.1:3001",
  }),
);
const server = host.listen(3001, "127.0.0.1");
const timer = setInterval(() => service.tick(), 1000);
