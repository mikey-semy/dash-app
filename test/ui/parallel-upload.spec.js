import { test, expect } from "@playwright/test";
import { unzipSync } from "fflate";

test("files start together before hashing and a closed tab resumes from the saved originals", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    crypto.subtle.digest = () => new Promise(() => {});
  });
  await page.route("**/api/login", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: { ...(await response.json()), uploadConcurrency: 2 },
    });
  });
  await page.goto("/");
  await page.getByLabel("Password", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  let accepted = 0;
  const waiting = [];
  await page.route("**/fake/**", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    await new Promise((resolve) => waiting.push(resolve));
    await route.continue().catch(() => {});
  });
  page.on("response", (response) => {
    if (response.ok() && response.url().includes("/fake/")) accepted++;
  });
  const files = ["first", "second", "third"].map((value) => ({
    name: value + ".txt",
    mimeType: "text/plain",
    buffer: Buffer.from(value),
  }));
  await page.locator("input[type=file]").setInputFiles(files);
  await expect.poll(() => waiting.length).toBe(2);
  waiting[0]();
  await expect.poll(() => accepted).toBe(1);
  await expect.poll(() => waiting.length).toBe(3);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const request = indexedDB.open("du-uploads", 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result;
              const read = db
                .transaction("uploads")
                .objectStore("uploads")
                .get("active");
              read.onsuccess = () => {
                db.close();
                resolve(read.result?.files.length);
              };
              read.onerror = () => {
                db.close();
                reject(read.error);
              };
            };
          }),
      ),
    )
    .toBe(3);
  expect(
    await page.evaluate(
      () => performance.getEntriesByName("dash.upload.first-put").length,
    ),
  ).toBe(1);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  waiting.slice(1).forEach((release) => release());
  await page.close();
  const restored = await context.newPage();
  await restored.goto("/");
  await restored.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(restored.locator(".share-ready")).toBeVisible();
  const record = await restored.evaluate(
    async () => (await (await fetch("/api/transfers")).json())[0],
  );
  const response = await context.request.get(
    "/public/" + record.url.split("/").pop() + "/download",
  );
  const zip = unzipSync(new Uint8Array(await response.body()));
  for (const file of files)
    expect(Buffer.from(zip[file.name])).toEqual(file.buffer);
  await restored.close();
});
test("parallel upload pauses every part, resumes and downloads exact original bytes", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByLabel("Password", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  let held = true;
  const waiting = [];
  let parts = 0;
  await page.route("**/fake/**", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    parts++;
    if (held) await new Promise((resolve) => waiting.push(resolve));
    await route.continue().catch(() => {});
  });
  const bytes = Buffer.alloc(25 * 1024 * 1024);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  await page.locator("input[type=file]").setInputFiles({
    name: "parallel.bin",
    mimeType: "application/octet-stream",
    buffer: bytes,
  });
  await expect.poll(() => parts).toBe(4);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  held = false;
  waiting.splice(0).forEach((resolve) => resolve());
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.locator(".share-ready")).toBeVisible();
  const record = await page.evaluate(
    async () => (await (await fetch("/api/transfers")).json())[0],
  );
  const response = await context.request.get(
    "/public/" + record.url.split("/").at(-1) + "/download",
  );
  expect((await response.body()).equals(bytes)).toBe(true);
  expect(parts).toBeGreaterThanOrEqual(4);
});

test("cancelled signing requests cannot block or pause the next upload", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByLabel("Password", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  let first;
  const waiting = [];
  await page.route("**/api/transfers/*/files/0/parts/*", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/")[3];
    first ||= id;
    if (id !== first) return route.continue();
    await new Promise((resolve) => waiting.push(resolve));
    await route.abort().catch(() => {});
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "cancelled.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(25 * 1024 * 1024, 13),
  });
  await expect.poll(() => waiting.length).toBe(4);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "UPLOAD", exact: true }),
  ).toBeVisible();
  const bytes = Buffer.from("the second upload stays independent");
  await page.locator("input[type=file]").setInputFiles({
    name: "next.bin",
    mimeType: "application/octet-stream",
    buffer: bytes,
  });
  await expect(page.locator(".share-ready")).toBeVisible();
  waiting.splice(0).forEach((resolve) => resolve());
  const record = await page.evaluate(async () =>
    (await (await fetch("/api/transfers")).json()).find(
      (t) => t.files[0]?.name === "next.bin",
    ),
  );
  const response = await context.request.get(
    "/public/" + record.url.split("/").at(-1) + "/download",
  );
  expect((await response.body()).equals(bytes)).toBe(true);
  await expect(page.locator(".share-ready")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toHaveCount(0);
});
