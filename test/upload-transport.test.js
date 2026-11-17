import test from "node:test";
import assert from "node:assert/strict";
import { createUploadTransport } from "#src/features/upload-files/model/transport.js";

test("resumed multipart uploads preserve byte offsets and append indices", async () => {
  const progress = [],
    sent = [],
    calls = [];
  const transport = createUploadTransport({
    control: { current: {} },
    onProgress: (value) => progress.push(value),
    api: async (path) => {
      calls.push(path);
      if (path.endsWith("/init"))
        return { partSize: 3, parts: [{ PartNumber: 1, Size: 3 }] };
      return { url: path };
    },
    createXHR: () => ({
      upload: {},
      status: 200,
      open(method, url) {
        assert.equal(method, "PUT");
        this.url = url;
      },
      send(blob) {
        sent.push(blob.text());
        this.upload.onprogress({ loaded: blob.size });
        this.onload();
      },
    }),
  });
  await transport.sendParts({
    id: "transfer",
    offset: 2,
    files: [new Blob(["abcdefg"])],
  });
  assert.deepEqual(await Promise.all(sent), ["def", "g"]);
  assert.deepEqual(progress, [3, 6, 7]);
  assert.deepEqual(calls, [
    "/api/transfers/transfer/files/2/init",
    "/api/transfers/transfer/files/2/parts/2",
    "/api/transfers/transfer/files/2/parts/3",
    "/api/transfers/transfer/files/2/complete",
  ]);
});

test("transient part failures retry with fresh URLs and stop after cancellation", async () => {
  const control = { current: {} },
    delays = [];
  let requests = 0,
    sends = 0,
    completed = false;
  const transport = createUploadTransport({
    control,
    onProgress() {},
    sleep: async (delay) => delays.push(delay),
    api: async (path) => {
      if (path.endsWith("/init")) return { partSize: 3, parts: [] };
      if (path.endsWith("/complete")) {
        completed = true;
        return {};
      }
      return { url: String(++requests) };
    },
    createXHR: () => ({
      upload: {},
      status: 200,
      open() {},
      send() {
        sends++;
        if (sends === 1) this.ontimeout();
        else {
          control.current.cancel = true;
          this.onabort();
        }
      },
    }),
  });
  await assert.rejects(
    transport.sendParts({ id: "transfer", files: [new Blob(["abc"])] }),
  );
  assert.equal(requests, 2);
  assert.deepEqual(delays, [500]);
  assert.equal(completed, false);
});
