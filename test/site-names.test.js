import test from "node:test";
import assert from "node:assert/strict";
import { openDB } from "../server/core.js";
import { Service } from "../server/service.js";
import { FakeStore } from "./fake.js";
import { generateSiteTitle, assignSiteTitle } from "../server/site-names.js";

test("new site transfers receive distinct readable names; ordinary files and manual titles stay unchanged", () => {
  const db = openDB(":memory:"),
    service = new Service(db, new FakeStore()),
    names = new Set();
  for (let i = 0; i < 100; i++) {
    const id = service.create(
        [{ name: i % 2 ? "project/INDEX.HTM" : "index.html", size: 0 }],
        0,
        "",
      ),
      t = service.get(id);
    assert.match(t.title, /^[a-z]+-[a-z]+$/);
    assert.ok(!names.has(t.title));
    names.add(t.title);
    assert.equal(t.files[0].name, i % 2 ? "project/INDEX.HTM" : "index.html");
  }
  const manual = service.create([{ name: "index.html", size: 0 }], 0, "");
  db.prepare("UPDATE transfers SET title=? WHERE id=?").run(
    "My website",
    manual,
  );
  assignSiteTitle(db, service.get(manual));
  assert.equal(service.get(manual).title, "My website");
  for (const name of ["README.md", "image.png", "index.html.txt"]) {
    const id = service.create([{ name, size: 0 }], 0, "");
    assert.ok(!service.get(id).title);
  }
  const first = generateSiteTitle(db, { random: () => 0 });
  const id = service.create([{ name: "text.txt", size: 0 }], 0, "");
  db.prepare("UPDATE transfers SET title=? WHERE id=?").run(
    first.toUpperCase(),
    id,
  );
  const second = generateSiteTitle(db, { random: () => 0 });
  assert.notEqual(first, second);
  assert.notEqual(
    generateSiteTitle(db, { random: () => 0, avoid: [second] }),
    second,
  );
  db.close();
});
