import test from "node:test";
import assert from "node:assert/strict";
import { createTransferUpdateQueue } from "#src/pages/upload/model/transferUpdateQueue.js";
import { copy } from "#common/copy.js";

const record = (id = "one") => ({
  id,
  title: "",
  state: "ready",
  revision: "r0",
  files: [
    { id: id + "/0", name: "first.txt", size: 1 },
    { id: id + "/1", name: "second.txt", size: 1 },
  ],
});
async function until(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, "queue did not reach expected state");
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}
function harness(t, overrides = {}) {
  const records = new Map([
    ["one", record()],
    ["two", record("two")],
  ]);
  const calls = [];
  const queue = createTransferUpdateQueue({
    delay: 5,
    poll: 2,
    read: async (id) => structuredClone(records.get(id)),
    apply: async (current, job) => {
      calls.push({ id: current.id, job });
      const next = structuredClone(current);
      if (job.type === "rename") {
        next.files = next.files.map((file) => ({
          ...file,
          name: job.names[file.id] ?? file.name,
        }));
        if ("title" in job) next.title = job.title;
      } else if (job.type === "append")
        next.files.push(
          ...job.files.map((file, index) => ({
            ...file,
            id: current.id + "/new/" + calls.length + "/" + index,
          })),
        );
      next.revision = "r" + calls.length;
      records.set(next.id, next);
    },
    ...overrides,
  });
  t.after(() => {
    queue.discard("one");
    queue.discard("two");
  });
  return { queue, records, calls };
}

test("rapid renames merge the last name per file and append batches retain every file", async (t) => {
  const { queue, records, calls } = harness(t);
  const current = records.get("one");
  queue.enqueue(current, { type: "rename", names: { "one/0": "old.txt" } });
  queue.enqueue(current, {
    type: "rename",
    names: { "one/1": "other.txt" },
    title: "Title",
  });
  queue.enqueue(current, { type: "rename", names: { "one/0": "final.txt" } });
  queue.enqueue(current, {
    type: "append",
    files: [{ name: "a.txt", size: 1 }],
  });
  queue.enqueue(current, {
    type: "append",
    files: [{ name: "b.txt", size: 1 }],
  });
  assert.deepEqual(
    queue.project([current])[0].files.map((f) => f.name),
    ["final.txt", "other.txt", "a.txt", "b.txt"],
  );
  await until(() => !queue.hasPending());
  assert.equal(calls.length, 2);
  assert.deepEqual(
    records.get("one").files.map((f) => f.name),
    ["final.txt", "other.txt", "a.txt", "b.txt"],
  );
  assert.equal(records.get("one").title, "Title");
});

test("new actions remain accepted during archiving and run in order using the confirmed revision", async (t) => {
  const { queue, records, calls } = harness(t);
  const current = records.get("one");
  current.appendState = "archiving";
  queue.enqueue(current, { type: "rename", names: { "one/0": "renamed.txt" } });
  await new Promise((resolve) => setTimeout(resolve, 15));
  queue.enqueue(current, {
    type: "append",
    files: [{ name: "new.txt", size: 1 }],
  });
  queue.enqueue(current, { type: "rename", names: { "one/1": "last.txt" } });
  assert.equal(calls.length, 0);
  records.get("one").appendState = null;
  records.get("one").revision = "completed-earlier-update";
  await until(() => !queue.hasPending());
  assert.deepEqual(
    calls.map((call) => call.job.type),
    ["rename", "append", "rename"],
  );
  assert.deepEqual(
    records.get("one").files.map((f) => f.name),
    ["renamed.txt", "last.txt", "new.txt"],
  );
});

test("consecutive text replacements are not dropped", async (t) => {
  const seen = [];
  const { queue, records } = harness(t, {
    apply: async (current, job) => seen.push(job.fileId),
  });
  for (const fileId of ["one/0", "one/1"])
    queue.enqueue(records.get("one"), {
      type: "replace",
      fileId,
      files: [{ name: "x", size: 1 }],
    });
  await until(() => !queue.hasPending());
  assert.deepEqual(seen, ["one/0", "one/1"]);
});

test("independent transfers can rename concurrently while uploads share a bounded transport", async (t) => {
  let active = 0,
    max = 0;
  const { queue, records } = harness(t, {
    apply: async () => {
      active++;
      max = Math.max(max, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active--;
    },
  });
  for (const id of ["one", "two"])
    queue.enqueue(records.get(id), { type: "rename", names: {}, title: "new" });
  await until(() => !queue.hasPending());
  assert.equal(max, 2);
  max = 0;
  for (const id of ["one", "two"])
    queue.enqueue(records.get(id), {
      type: "append",
      files: [{ name: "new.txt", size: 1 }],
    });
  await until(() => !queue.hasPending());
  assert.equal(max, 1);
});

test("polling failure pauses the queue and retry never submits an accepted append twice", async (t) => {
  let submitted = 0,
    fail = false;
  const current = record();
  const { queue } = harness(t, {
    read: async () => {
      if (fail) throw new Error("Offline");
      return current;
    },
    apply: async () => {
      submitted++;
      fail = true;
    },
  });
  queue.enqueue(current, {
    type: "append",
    files: [{ name: "new.txt", size: 1 }],
  });
  await until(() => queue.project([current])[0].updates?.error);
  assert.equal(queue.project([current])[0].updates.error, "Offline");
  fail = false;
  queue.retry("one");
  await until(() => !queue.hasPending());
  assert.equal(submitted, 1);
});

test("external changes stop stale jobs and discard restores the server filenames", async (t) => {
  const { queue, records, calls } = harness(t);
  const current = structuredClone(records.get("one"));
  queue.enqueue(current, { type: "rename", names: { "one/0": "draft.txt" } });
  records.get("one").files[0].name = "external.txt";
  await until(() => queue.project([records.get("one")])[0].updates?.error);
  assert.equal(calls.length, 0);
  assert.equal(
    queue.project([records.get("one")])[0].files[0].name,
    "draft.txt",
  );
  queue.discard("one");
  assert.equal(
    queue.project([records.get("one")])[0].files[0].name,
    "external.txt",
  );
});

test("queued additions count toward transfer limits and discarding stops a waiting worker", async (t) => {
  const { queue, records, calls } = harness(t);
  const current = records.get("one");
  current.appendState = "archiving";
  queue.enqueue(current, {
    type: "append",
    files: Array.from({ length: 98 }, (_, i) => ({
      name: i + ".txt",
      size: 1,
    })),
  });
  assert.throws(
    () =>
      queue.enqueue(current, {
        type: "append",
        files: [{ name: "too-many.txt", size: 1 }],
      }),
    { message: copy.upTo100FilesAnd2GbInTotal },
  );
  await new Promise((resolve) => setTimeout(resolve, 15));
  queue.discard("one");
  current.appendState = null;
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(calls.length, 0);
  assert.equal(queue.hasPending(), false);
});

test("retry restarts a failed archive without uploading the accepted files again", async (t) => {
  let applies = 0,
    retries = 0;
  const current = record();
  const { queue } = harness(t, {
    read: async () => current,
    apply: async () => {
      applies++;
      current.appendState = "failed";
    },
    retryFailed: async () => {
      retries++;
      current.appendState = null;
      current.revision = "r1";
    },
  });
  queue.enqueue(current, {
    type: "append",
    files: [{ name: "new.txt", size: 1 }],
  });
  await until(() => queue.project([current])[0].updates?.error);
  queue.retry("one");
  await until(() => !queue.hasPending());
  assert.equal(applies, 1);
  assert.equal(retries, 1);
});

test("a queued new text file can be renamed before it starts uploading without another archive update", async (t) => {
  const { queue, records, calls } = harness(t);
  const current = records.get("one");
  queue.enqueue(current, {
    type: "append",
    files: [{ name: "note.txt", size: 1 }],
  });
  const added = queue.project([current])[0].files.at(-1);
  assert.equal(added.pending, true);
  queue.enqueue(current, {
    type: "rename",
    names: { [added.id]: "renamed-note.txt" },
  });
  assert.equal(
    queue.project([current])[0].files.at(-1).name,
    "renamed-note.txt",
  );
  await until(() => !queue.hasPending());
  assert.equal(calls.length, 1);
  assert.equal(records.get("one").files.at(-1).name, "renamed-note.txt");
});

test("renaming a file during its upload resolves its temporary identity after the append commits", async (t) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let started = false;
  let current = record();
  const jobs = [];
  const { queue } = harness(t, {
    read: async () => structuredClone(current),
    apply: async (before, job) => {
      jobs.push(job);
      if (job.type === "append") {
        started = true;
        await gate;
        current = {
          ...current,
          revision: "r1",
          files: [
            ...current.files,
            { id: "uploaded-id", name: "note.txt", size: 1 },
          ],
        };
      } else {
        current = {
          ...current,
          revision: "r2",
          files: current.files.map((file) => ({
            ...file,
            name: job.names[file.id] ?? file.name,
          })),
        };
      }
    },
  });
  t.after(() => release());
  queue.enqueue(current, {
    type: "append",
    files: [{ name: "note.txt", size: 1 }],
  });
  await until(() => started);
  const pending = queue.project([current])[0].files.at(-1);
  queue.enqueue(current, {
    type: "rename",
    names: { [pending.id]: "during-upload.txt" },
  });
  release();
  await until(() => !queue.hasPending());
  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs[1].names, { "uploaded-id": "during-upload.txt" });
  assert.equal(current.files.at(-1).name, "during-upload.txt");
});

test("replacement identities follow repeated replacements before queued renames", async (t) => {
  let current = record();
  let release,
    started = false;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const jobs = [];
  const { queue } = harness(t, {
    read: async () => structuredClone(current),
    apply: async (before, job) => {
      jobs.push(job);
      if (job.type === "replace") {
        if (jobs.length === 1) {
          started = true;
          await gate;
        }
        assert.equal(job.fileId, current.files[0].id);
        current.files[0] = {
          ...current.files[0],
          id: "replacement/" + jobs.length,
        };
      } else {
        assert.deepEqual(Object.keys(job.names), [current.files[0].id]);
        current.files[0].name = job.names[current.files[0].id];
      }
      current.revision = "r" + jobs.length;
    },
  });
  t.after(() => release());
  queue.enqueue(current, {
    type: "replace",
    fileId: "one/0",
    files: [{ name: "first.txt", size: 1 }],
  });
  await until(() => started);
  queue.enqueue(current, {
    type: "replace",
    fileId: "one/0",
    files: [{ name: "first.txt", size: 1 }],
  });
  queue.enqueue(current, { type: "rename", names: { "one/0": "renamed.txt" } });
  release();
  await until(() => !queue.hasPending());
  assert.equal(current.files[0].name, "renamed.txt");
  assert.equal(jobs.length, 3);
});
