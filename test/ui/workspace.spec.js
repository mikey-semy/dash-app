import { test, expect } from "@playwright/test";

test("current details stay expanded during append preparation and keep the same transfer afterwards", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Password", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "original.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("original"),
  });
  await expect(page.locator(".share-ready")).toBeVisible();
  const record = await page.evaluate(
    async () => (await (await fetch("/api/transfers")).json())[0],
  );
  await page
    .getByRole("button", { name: "Transfer details", exact: true })
    .click();
  const filename = page
    .locator(".owner-details")
    .getByRole("textbox", { name: "Filename 1", exact: true });
  await expect(filename).toHaveText("original.txt");
  let release,
    requested = false;
  const pending = new Promise((resolve) => (release = resolve));
  await page.route(
    "**/api/transfers/" + record.id + "/append",
    async (route) => {
      requested = true;
      await pending;
      await route.continue();
    },
  );
  const choosing = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await (
    await choosing
  ).setFiles({
    name: "appended.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("appended"),
  });
  await expect.poll(() => requested).toBe(true);
  await expect(
    page.getByRole("status", { name: "Pending changes", exact: true }),
  ).toBeVisible();
  await expect(filename).toBeVisible();
  await expect(filename).toHaveText("original.txt");
  release();
  await expect(page.locator(".share-ready")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        async (id) =>
          (await (await fetch("/api/transfers")).json()).find(
            (item) => item.id === id,
          )?.files.length,
        record.id,
      ),
    )
    .toBe(2);
  const after = await page.evaluate(
    async (id) =>
      (await (await fetch("/api/transfers")).json()).find(
        (item) => item.id === id,
      ),
    record.id,
  );
  expect(after.url).toBe(record.url);
  expect(after.files.map((file) => file.name)).toEqual([
    "original.txt",
    "appended.txt",
  ]);
});
