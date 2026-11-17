import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/s3.js";
test("holder prefix applies exactly once to every S3 request and signed upload; purge never escapes transfer", async () => {
  const store = new Store({
      S3_ENDPOINT: "https://s3.example.com",
      S3_BUCKET: "example-bucket",
      S3_PREFIX: "holder/",
      S3_ACCESS_KEY: "fake",
      S3_SECRET_KEY: "fake",
    }),
    calls = [];
  store.client.send = async (command) => {
    calls.push(command.input);
    return command.constructor.name === "ListMultipartUploadsCommand"
      ? { Uploads: [{ Key: "holder/transfer/bundle.zip", UploadId: "u" }] }
      : {};
  };
  await store.create("transfer/source/0");
  await store.head("transfer/source/0");
  await store.empty("transfer/source/1");
  await store.get("transfer/source/0");
  await store.purge("transfer", ["transfer/bundle.zip"]);
  assert.ok(calls.every((c) => !c.Key || c.Key.startsWith("holder/transfer/")));
  assert.ok(calls.every((c) => !c.Key?.includes("holder/holder/")));
  assert.equal(calls.find((c) => c.Prefix).Prefix, "holder/transfer/");
  const signed = new URL(await store.sign("transfer/source/0", "u", 1, 5));
  assert.equal(signed.pathname, "/example-bucket/holder/transfer/source/0");
  await assert.rejects(() => store.remove("../outside"));
  store.client.send = async () => ({
    Uploads: [{ Key: "other/data", UploadId: "u" }],
  });
  await assert.rejects(() => store.purge("transfer", []));
  store.client.destroy();
});
