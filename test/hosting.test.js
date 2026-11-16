import test from "node:test";
import assert from "node:assert/strict";
import { hosting, normalizeDomain } from "../server/hosting.js";
import { openDB } from "../server/core.js";
import { Service } from "../server/service.js";
import { FakeStore } from "./fake.js";
import { execFileSync } from "node:child_process";

test("domains accept normalized DNS names and reject URLs, paths, ports, IPs and the DU origin", () => {
  assert.equal(normalizeDomain(" Example.COM. "), "example.com");
  assert.equal(normalizeDomain("пример.рф"), "xn--e1afmkfd.xn--p1ai");
  assert.equal(normalizeDomain(""), null);
  for (const name of [
    "https://example.com",
    "example.com/path",
    "example.com:443",
    "127.0.0.1",
    "example.123",
    "-a.example.com",
    "files.example.com",
  ])
    assert.throws(() => normalizeDomain(name, "files.example.com"));
});

test("domain verification exports only server DNS addresses and checks HTTPS before declaring readiness", async () => {
  const db = openDB(":memory:"),
    service = new Service(db, new FakeStore());
  const id = service.create([{ name: "index.html", size: 0 }], 0, "");
  db.prepare("UPDATE transfers SET site_domain=? WHERE id=?").run(
    "site.example.com",
    id,
  );
  let foreign = true,
    tls = false,
    probes = 0,
    exported;
  const manager = hosting(
    service,
    { PUBLIC_URL: "https://files.example.com", ADMIN_PASSWORD: "secret" },
    {
      resolve: async (domain) =>
        domain === "files.example.com" || !foreign
          ? ["203.0.113.1"]
          : ["127.0.0.1"],
      probe: async (domain, ip, proof) => {
        probes++;
        assert.equal(ip, "203.0.113.1");
        assert.ok(proof);
        return tls;
      },
      exportDomains: async (domains) => {
        exported = domains;
      },
    },
  );
  await manager.refresh();
  assert.deepEqual(exported, []);
  assert.equal(probes, 0);
  assert.equal(manager.status(service.get(id)).state, "dns");
  const canonical = "https://files.example.com/" + service.get(id).token;
  assert.equal(manager.shareURL(service.get(id)), canonical);
  foreign = false;
  await manager.refresh();
  assert.deepEqual(exported, ["site.example.com"]);
  assert.equal(manager.status(service.get(id)).state, "tls");
  assert.equal(manager.shareURL(service.get(id)), canonical);
  tls = true;
  await manager.refresh();
  assert.equal(manager.status(service.get(id)).state, "ready");
  assert.equal(manager.shareURL(service.get(id)), "https://site.example.com/");
  db.prepare("UPDATE transfers SET site_domain=? WHERE id=?").run(
    "new.example.com",
    id,
  );
  assert.equal(manager.shareURL(service.get(id)), canonical);
  db.prepare("UPDATE transfers SET site_domain=NULL WHERE id=?").run(id);
  assert.equal(manager.shareURL(service.get(id)), canonical);
  db.close();
});

test("proxy export cannot overwrite domains owned by other applications or inject router rules", () => {
  const code = `import runpy,json
m=runpy.run_path('deploy/sync-sites.py')
c,s=m['configuration'](['site.example.com','example.com','bad\u0060) || Host(\u0060evil.com',42],{'example.com'})
assert s=={'example.com':'reserved','site.example.com':'configured'}
assert len(c['http']['routers'])==2
assert all(v['rule']=='Host(\u0060site.example.com\u0060)' for v in c['http']['routers'].values())
print('ok')`;
  assert.equal(
    execFileSync(
      process.platform === "win32" ? "python" : "python3",
      ["-c", code],
      { encoding: "utf8" },
    ).trim(),
    "ok",
  );
});
