import { test, expect } from "@playwright/test";
test("editable drafts block file uploads; read-only preview closes and appends to its transfer", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Password", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "UPLOAD", exact: true }),
  ).toBeVisible();
  await page.locator("input[type=file]").setInputFiles({
    name: "original.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("original"),
  });
  await expect(page.locator(".share-ready")).toBeVisible();
  const current = async () =>
    page.evaluate(
      async () => (await (await fetch("/api/transfers")).json())[0],
    );
  const original = await current();
  let writes = 0;
  page.on("request", (r) => {
    if (
      r.method() === "POST" &&
      /^\/api\/transfers(?:\/[^/]+\/(?:append|replace))?$/.test(
        new URL(r.url()).pathname,
      )
    )
      writes++;
  });
  const pasteFiles = async (selector, drop = false) =>
    page.evaluate(
      ({ selector, drop }) => {
        const data = new DataTransfer();
        data.items.add(new File(["extra"], "extra.txt"));
        const event = drop
          ? new DragEvent("drop", {
              bubbles: true,
              cancelable: true,
              dataTransfer: data,
            })
          : new ClipboardEvent("paste", {
              bubbles: true,
              cancelable: true,
              clipboardData: data,
            });
        document.querySelector(selector).dispatchEvent(event);
      },
      { selector, drop },
    );
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "Edit text",
    exact: true,
  });
  await editor.locator(".cm-content").fill("unsaved draft");
  await pasteFiles(".text-dialog .cm-content");
  await pasteFiles(".text-dialog .cm-content", true);
  await expect(editor.locator(".cm-content")).toHaveText("unsaved draft");
  expect((await current()).files.length).toBe(1);
  expect(writes).toBe(0);
  await editor
    .getByRole("button", { name: "Close editor", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Transfer details", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preview original.txt", exact: true })
    .click();
  const viewer = page.getByRole("dialog", {
    name: "Text preview",
    exact: true,
  });
  await expect(viewer.locator(".cm-content")).toHaveText("original");
  await pasteFiles(".viewer-dialog .cm-content");
  await expect(viewer).toHaveCount(0);
  await expect.poll(async () => (await current()).files.length).toBe(2);
  await expect(page.locator(".share-ready")).toBeVisible();
  expect((await current()).url).toBe(original.url);
  expect(writes).toBe(1);
  await page.getByLabel("Settings", { exact: true }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  const row = page.locator(".history-item").first();
  await row.locator(".history-toggle").click();
  await row
    .getByRole("button", { name: "Preview original.txt", exact: true })
    .click();
  await expect(viewer.locator(".cm-content")).toHaveText("original");
  await pasteFiles(".viewer-dialog .cm-content");
  await expect(viewer).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".history-page")).toHaveCount(0);
  await expect.poll(async () => (await current()).files.length).toBe(3);
  await expect(page.locator(".share-ready")).toBeVisible();
  expect((await current()).url).toBe(original.url);
  expect(writes).toBe(2);
});
