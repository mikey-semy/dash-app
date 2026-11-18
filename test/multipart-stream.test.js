import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { uploadMultipartStream } from "../server/multipart-stream.js";

const turn = () => new Promise((resolve) => setImmediate(resolve));
function storage() {
  const requests = [];
  return {
    requests,
    send(command, input) {
      assert.equal(command, "UploadPart");
      return new Promise((resolve, reject) => {
        requests.push({ ...input, resolve, reject });
      });
    },
  };
}

test("multipart stream bounds parallel writes and completes parts in byte order", async () => {
  const store = storage(),
    input = Buffer.from("abcdefghijklmnopq");
  const result = uploadMultipartStream(
    Readable.from([input.subarray(0, 3), input.subarray(3)]),
    store,
    "bundle",
    "upload",
    { partSize: 4, concurrency: 2 },
  );
  await turn();
  assert.equal(store.requests.length, 2);
  store.requests[1].resolve({ ETag: "two" });
  await turn();
  assert.equal(store.requests.length, 3);
  store.requests[2].resolve({ ETag: "three" });
  await turn();
  assert.equal(store.requests.length, 4);
  store.requests[0].resolve({ ETag: "one" });
  await turn();
  assert.equal(store.requests.length, 5);
  store.requests[4].resolve({ ETag: "five" });
  store.requests[3].resolve({ ETag: "four" });
  const output = await result;
  assert.equal(output.size, input.length);
  assert.deepEqual(
    output.parts.map((part) => part.ETag),
    ["one", "two", "three", "four", "five"],
  );
  assert.deepEqual(
    Buffer.concat(store.requests.map((part) => part.Body)),
    input,
  );
  assert.deepEqual(
    store.requests.map((part) => part.ContentLength),
    [4, 4, 4, 4, 1],
  );
  assert.deepEqual(
    output.parts.map((part) => part.PartNumber),
    [1, 2, 3, 4, 5],
  );
});

test("multipart failure stops queued writes and drains active writes before abort", async () => {
  const store = storage(),
    failure = new Error("storage unavailable");
  let settled = false;
  const result = uploadMultipartStream(
    Readable.from([Buffer.alloc(40)]),
    store,
    "bundle",
    "upload",
    { partSize: 4, concurrency: 2 },
  );
  const rejected = assert.rejects(result, (error) => error === failure);
  result.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await turn();
  store.requests[0].reject(failure);
  await turn();
  assert.equal(settled, false);
  assert.equal(store.requests.length, 2);
  store.requests[1].resolve({ ETag: "two" });
  await rejected;
  assert.equal(settled, true);
  assert.equal(store.requests.length, 2);
});

test("source failure is preserved and no incomplete stream is finalized", async () => {
  const failure = new Error("source truncated"),
    store = storage();
  const stream = Readable.from(
    (async function* () {
      yield Buffer.from("abc");
      throw failure;
    })(),
  );
  await assert.rejects(
    uploadMultipartStream(stream, store, "bundle", "upload", {
      partSize: 4,
      concurrency: 2,
    }),
    (error) => error === failure,
  );
  assert.equal(store.requests.length, 0);
});
