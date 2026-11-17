import { test, expect } from "@playwright/test";
import express from "express";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cacheBuildAssets, legacyAssets } from "../../server/asset-cache.js";

test("an open tab imports the old settings module and its dependency after deployment without reloading", async ({
  page,
}) => {
  const root = await mkdtemp(path.join(tmpdir(), "du-browser-assets-"));
  expect(path.dirname(root)).toBe(tmpdir());
  const current = path.join(root, "current"),
    cache = path.join(root, "cache");
  await mkdir(current);
  const old = "settings-OldFile1.js",
    dependency = "runtime-OldDep01.js",
    next = "settings-NewFile2.js";
  await writeFile(
    path.join(current, old),
    `export {value} from './${dependency}';`,
  );
  await writeFile(
    path.join(current, dependency),
    'export const value="old settings";',
  );
  await cacheBuildAssets({
    source: current,
    directory: cache,
    build: "a".repeat(40),
  });
  const app = express();
  app.get("/", (req, res) =>
    res.type("html").send("<!doctype html><title>Open tab</title>"),
  );
  app.use("/assets", express.static(current));
  app.use("/assets", legacyAssets(cache));
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise((resolve) =>
      server.listening ? resolve() : server.once("listening", resolve),
    );
    const base = "http://127.0.0.1:" + server.address().port;
    await page.goto(base + "/");
    await page.evaluate((name) => {
      window.marker = 123;
      window.openSettings = () => import("/assets/" + name);
    }, old);
    await rm(path.join(current, old));
    await rm(path.join(current, dependency));
    await writeFile(
      path.join(current, next),
      'export const value="new settings";',
    );
    await cacheBuildAssets({
      source: current,
      directory: cache,
      build: "b".repeat(40),
    });
    expect(
      await page.evaluate(async () => (await window.openSettings()).value),
    ).toBe("old settings");
    expect(await page.evaluate(() => window.marker)).toBe(123);
    await expect(page).toHaveTitle("Open tab");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
