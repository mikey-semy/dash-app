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
function harness({ concurrency = 4, count = 5, deferSigning = false } = {}) {
  const requests = [],
    calls = [],
    progress = [],
    saved = new Map(),
    signing = [];
  const control = { current: {} };
  const transport = createUploadTransport({
    control,
    concurrency,
    onProgress: (value) => progress.push(value),
    sleep: async () => {},
    api: async (path) => {
      calls.push(path);
      if (path.endsWith("/init"))
        return {
          partSize: 3,
          parts: [...saved].map(([PartNumber, Size]) => ({ PartNumber, Size })),
        };
      if (path.endsWith("/complete")) return {};
      if (deferSigning)
        return new Promise((resolve) =>
          signing.push(() => resolve({ url: path })),
        );
      return { url: path };
    },
    createXHR: () => ({
      upload: {},
      status: 200,
      open(method, url) {
        this.part = Number(url.split("/").at(-1));
      },
      send(blob) {
        this.blob = blob;
        requests.push(this);
      },
      abort() {
        this.aborted = true;
        this.onabort?.();
      },
    }),
  });
  const upload = {
    id: "parallel",
    files: [new Blob(["abcdefghijklmnopqr".slice(0, count * 3)])],
  };
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const finish = (xhr) => {
    saved.set(xhr.part, xhr.blob.size);
    xhr.onload();
  };
  return {
    requests,
    calls,
    progress,
    saved,
    signing,
    control,
    transport,
    upload,
    settle,
    finish,
  };
}

test("parallel parts stay bounded, aggregate progress and complete only after out-of-order success", async () => {
  const h = harness();
  const run = h.transport.sendParts(h.upload);
  await h.settle();
  assert.equal(h.requests.length, 4);
  assert.equal(h.control.current.requests.size, 4);
  h.requests[0].upload.onprogress({ loaded: 2 });
  h.requests[1].upload.onprogress({ loaded: 2 });
  assert.equal(h.progress.at(-1), 4);
  h.finish(h.requests[3]);
  await h.settle();
  assert.equal(h.requests.length, 5);
  assert.equal(h.control.current.requests.size, 4);
  for (const index of [2, 0, 4]) h.finish(h.requests[index]);
  await h.settle();
  assert.equal(
    h.calls.some((path) => path.endsWith("/complete")),
    false,
  );
  h.finish(h.requests[1]);
  await run;
  assert.equal(h.progress.at(-1), 15);
  assert.ok(
    h.progress.every((v, i) => v <= 15 && (i === 0 || v >= h.progress[i - 1])),
  );
  assert.equal(h.control.current.requests.size, 0);
  const pieces = await Promise.all(
    [...h.requests].sort((a, b) => a.part - b.part).map((r) => r.blob.text()),
  );
  assert.equal(pieces.join(""), "abcdefghijklmno");
  assert.equal(h.calls.filter((path) => path.endsWith("/complete")).length, 1);
});

test("pause aborts every active request, ignores late progress and resumes only missing parts", async () => {
  const h = harness({ count: 3 });
  const run = h.transport.sendParts(h.upload);
  await h.settle();
  h.finish(h.requests[0]);
  await h.settle();
  const late = h.requests[1].upload.onprogress;
  h.control.current.paused = true;
  h.transport.abort();
  await assert.rejects(run);
  assert.ok(h.requests.slice(1).every((r) => r.aborted));
  assert.equal(h.control.current.requests.size, 0);
  const before = [...h.progress];
  late({ loaded: 3 });
  assert.deepEqual(h.progress, before);
  h.control.current.paused = false;
  const resumed = h.transport.sendParts(h.upload);
  await h.settle();
  assert.equal(h.requests.filter((r) => r.part === 1).length, 1);
  h.finish(h.requests[3]);
  h.finish(h.requests[4]);
  await resumed;
  assert.equal(h.progress.at(-1), 9);
});

test("exhausted retries abort siblings and never dispatch queued parts or completion", async () => {
  const h = harness({ concurrency: 3 });
  const run = h.transport.sendParts(h.upload);
  const rejected = assert.rejects(run, /S3/);
  await h.settle();
  h.requests[0].onerror();
  await h.settle();
  h.requests[3].onerror();
  await h.settle();
  h.requests[4].onerror();
  await rejected;
  assert.ok(h.requests[1].aborted && h.requests[2].aborted);
  assert.equal(h.control.current.requests.size, 0);
  assert.ok(h.requests.every((r) => r.part <= 3));
  assert.equal(
    h.calls.some((path) => path.endsWith("/complete")),
    false,
  );
  assert.equal(h.calls.filter((path) => path.endsWith("/parts/1")).length, 3);
});

test("cancel during signing cannot start a late PUT or complete the file", async () => {
  const h = harness({ count: 3, deferSigning: true });
  const run = h.transport.sendParts(h.upload);
  const rejected = assert.rejects(run);
  await h.settle();
  assert.equal(h.signing.length, 3);
  h.control.current.cancel = true;
  h.transport.abort();
  for (const resolve of h.signing) resolve();
  await rejected;
  assert.equal(h.requests.length, 0);
  assert.equal(
    h.calls.some((path) => path.endsWith("/complete")),
    false,
  );
});
