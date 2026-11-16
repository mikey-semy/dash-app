import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import { scanFolders, folderZip, defaultExcluded } from "../src/folders.js";
const file = (name, text = "x") => ({
  name,
  isFile: true,
  isDirectory: false,
  file: (ok) => ok(new File([text], name)),
});
const dir = (name, entries) => ({
  name,
  isDirectory: true,
  isFile: false,
  createReader() {
    let offset = 0;
    return {
      readEntries(ok) {
        ok(entries.slice(offset, (offset += 2)));
      },
    };
  },
});
test("folders respect defaults and nested gitignore, restore subtrees and preserve UTF-8 ZIP bytes and empty directories", async () => {
  const root = dir("проект", [
    file(".gitignore", "*.log\n/dist/\n"),
    file(".env", "SECRET"),
    file(".env.example", "KEY="),
    dir("node_modules", [file("library.js")]),
    dir(".venv", [file("python")]),
    dir("target", [file("binary")]),
    dir("dist", [file("index.js")]),
    file("ignored.log"),
    dir("empty", []),
    dir("src", [
      file(".gitignore", "!keep.log\n"),
      file("keep.log", "keep"),
      file("main.py", 'print("Привет 🌍")\n'),
    ]),
  ]);
  const plan = await scanFolders({ entries: [root] });
  assert.ok(
    !plan.files.some((x) =>
      /SECRET|node_modules|target|\.venv|dist|ignored.log/.test(x.path),
    ),
  );
  assert.ok(plan.files.some((x) => x.path === "проект/src/keep.log"));
  assert.ok(plan.files.some((x) => x.path === "проект/.env.example"));
  assert.ok(plan.excluded.some((x) => x.path === "проект/.env"));
  await plan.restore(plan.excluded.find((x) => x.path === "проект/dist"));
  assert.ok(plan.files.some((x) => x.path === "проект/dist/index.js"));
  const zip = await folderZip("проект", plan.files),
    data = unzipSync(new Uint8Array(await zip.arrayBuffer()));
  assert.equal(zip.name, "проект.zip");
  assert.equal(
    new TextDecoder().decode(data["проект/src/main.py"]),
    'print("Привет 🌍")\n',
  );
  assert.equal(data["проект/empty/"].length, 0);
  assert.ok(!data["проект/.env"]);
  assert.ok(defaultExcluded("secret.key", false));
  assert.ok(!defaultExcluded("Cargo.lock", false));
  assert.ok(!defaultExcluded("requirements.txt", false));
});
test("folder limits reject excessive included files and a failed restore leaves the plan unchanged", async () => {
  const source = {
    entries: [
      dir("project", [
        file("main"),
        dir(
          "node_modules",
          Array.from({ length: 101 }, (_, i) => file("file" + i)),
        ),
      ]),
    ],
  };
  const plan = await scanFolders(source);
  await assert.rejects(() => plan.restore(plan.excluded[0]), /100 files/);
  assert.equal(plan.files.length, 1);
  assert.equal(plan.excluded.length, 1);
  await assert.rejects(
    () =>
      scanFolders({
        entries: [
          dir(
            "many",
            Array.from({ length: 101 }, (_, i) => file("f" + i)),
          ),
        ],
      }),
    /100 files/,
  );
});
