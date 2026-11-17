import test from "node:test";
import assert from "node:assert/strict";
import { createApi } from "#src/shared/api/client.js";
const json = (status, value) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
test("GET survives a temporary non-JSON proxy 404 and does not report a parser failure", async () => {
  let requests = 0;
  const waits = [];
  const api = createApi({
    fetch: async () =>
      ++requests < 3
        ? new Response("404 page not found", { status: 404 })
        : json(200, { ok: true }),
    sleep: async (delay) => waits.push(delay),
  });
  assert.deepEqual(await api("/api/transfers"), { ok: true });
  assert.equal(requests, 3);
  assert.deepEqual(waits, [250, 500]);
});
test("real JSON 404s and mutations are never replayed; network failures have a bounded retry", async () => {
  let requests = 0;
  const original = console.error;
  console.error = () => {};
  try {
    const api = createApi({
      fetch: async () => {
        requests++;
        return json(404, { error: "Transfer deleted" });
      },
      sleep: async () => assert.fail("must not retry"),
    });
    await assert.rejects(
      () => api("/public/deleted"),
      (error) => error.status === 404 && error.message === "Transfer deleted",
    );
    assert.equal(requests, 1);
    requests = 0;
    const mutate = createApi({
      fetch: async () => {
        requests++;
        return new Response("Bad Gateway", { status: 502 });
      },
      sleep: async () => assert.fail("must not replay mutations"),
    });
    await assert.rejects(
      () => mutate("/api/transfers", { files: [] }),
      (error) => error.status === 502 && !error.message.includes("JSON"),
    );
    assert.equal(requests, 1);
    requests = 0;
    const offline = createApi({
      fetch: async () => {
        requests++;
        throw Error("offline");
      },
      sleep: async () => {},
    });
    await assert.rejects(() => offline("/api/session"), /Could not connect/);
    assert.equal(requests, 5);
  } finally {
    console.error = original;
  }
});
