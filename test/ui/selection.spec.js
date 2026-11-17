import { test, expect } from "@playwright/test";

test("history row and file selections stay independent and reset on filters or revision changes", async ({
  page,
}) => {
  const now = Date.now();
  const records = ["First", "Second"].map((title, index) => ({
    id: "selection-" + index,
    title,
    state: "ready",
    created: now + index * 1000,
    expires: null,
    ttl: 0,
    revision: "r1",
    size: 10,
    url: "http://127.0.0.1:3001/Sel123",
    files: [
      { name: "a.txt", size: 5 },
      { name: "b.txt", size: 5 },
    ],
  }));
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.route("**/api/transfers", (route) =>
    route.fulfill({ json: records }),
  );
  await page.goto("/");
  await page.getByLabel("Settings", { exact: true }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  const history = page.getByRole("dialog", { name: "History", exact: true });
  const all = history.getByRole("checkbox", {
    name: "Select all transfers",
    exact: true,
  });
  const first = history.locator(".history-item").first();
  await first.locator(".history-select").check();
  await expect(all).toHaveJSProperty("indeterminate", true);
  await all.check();
  await expect(all).toBeChecked();
  await first.locator(".history-toggle").click();
  const file = first.getByRole("checkbox", {
    name: "Select a.txt",
    exact: true,
  });
  const files = first.getByRole("checkbox", {
    name: "Select all files",
    exact: true,
  });
  await file.check();
  await expect(files).toHaveJSProperty("indeterminate", true);
  await expect(all).toBeChecked();
  records[0] = { ...records[0], revision: "r2" };
  await expect(file).not.toBeChecked({ timeout: 10000 });
  await expect(files).toHaveJSProperty("indeterminate", false);
  await expect(all).toBeChecked();
  await history
    .getByRole("button", { name: "Search history", exact: true })
    .click();
  await history.getByLabel("Search filenames or transfers").fill("First");
  await expect(all).not.toBeChecked();
  await expect(all).toHaveJSProperty("indeterminate", false);
  await expect(first.locator(".history-select")).not.toBeChecked();
});

test("recipient keeps selection on unchanged polling and clears it when the archive changes", async ({
  page,
}) => {
  let record = {
    locked: false,
    demo: false,
    preview: false,
    etag: '"v1"',
    name: "files.zip",
    expires: null,
    size: 10,
    files: [
      { name: "a.txt", size: 5 },
      { name: "b.txt", size: 5 },
    ],
  };
  let reads = 0;
  await page.route("**/public/Sel123", (route) => {
    reads++;
    return route.fulfill({ json: record });
  });
  await page.goto("/Sel123");
  await page
    .getByRole("button", { name: "Transfer details", exact: true })
    .click();
  const file = page.getByRole("checkbox", {
    name: "Select a.txt",
    exact: true,
  });
  await file.check();
  const download = page.getByRole("button", {
    name: "Download selected files",
    exact: true,
  });
  await expect(download).toBeEnabled();
  const before = reads;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => reads).toBeGreaterThan(before);
  await expect(file).toBeChecked();
  record = { ...record, etag: '"v2"' };
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(file).not.toBeChecked();
  await expect(download).toBeDisabled();
});
