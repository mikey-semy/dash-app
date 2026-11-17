import test from "node:test";
import assert from "node:assert/strict";
import { createTransferCommands } from "#src/features/manage-transfer/commands.js";

test("transfer commands keep title, filenames and revision independent without mutating the record", async () => {
  const record = Object.freeze({
    id: "stable-id",
    title: "My site",
    revision: "old-revision",
    url: "/Stable",
    expires: null,
    files: Object.freeze([
      Object.freeze({ name: "site/index.html" }),
      Object.freeze({ name: "docs/readme.md" }),
    ]),
  });
  const patches = [],
    removals = [];
  const commands = createTransferCommands({
    rename: async (target, patch) => {
      assert.equal(target, record);
      patches.push(patch);
      return true;
    },
    removeFiles: async (...args) => {
      removals.push(args);
      return false;
    },
  });
  await commands.renameTitle(record, "Other site");
  await commands.renameFile(record, 1, "docs/renamed.md");
  assert.deepEqual(patches, [
    { title: "Other site" },
    { names: ["site/index.html", "docs/renamed.md"] },
  ]);
  assert.equal(record.title, "My site");
  assert.equal(record.files[1].name, "docs/readme.md");
  assert.equal(await commands.removeFiles(record, [1]), false);
  assert.deepEqual(removals, [["stable-id", [1], "old-revision"]]);
});

test("name suggestions stay drafts and publication sends only the publication change", async () => {
  const calls = [],
    record = { id: "site-id", title: "Original" };
  const commands = createTransferCommands({
    api: async (...args) => {
      calls.push(args);
      return { title: "quiet-pine" };
    },
  });
  const current = "draft &?/#";
  assert.equal(await commands.suggestTitle(record, current), "quiet-pine");
  assert.equal(record.title, "Original");
  await commands.setPublished(record, false);
  assert.deepEqual(calls, [
    [
      "/api/transfers/site-id/title-suggestion?current=" +
        encodeURIComponent(current),
    ],
    ["/api/transfers/site-id/settings", { published: false }, "PATCH"],
  ]);
});
