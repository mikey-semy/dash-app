import { test, expect } from "@playwright/test";

test("a single-file site can be named in history and current view without renaming index.html", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Password", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "index.html",
    mimeType: "text/html",
    buffer: Buffer.from("<h1>Site</h1>"),
  });
  await expect(page.locator(".share-ready")).toBeVisible();
  const original = await page.evaluate(
    async () => (await (await fetch("/api/transfers")).json())[0],
  );
  const record = () =>
    page.evaluate(
      async (id) =>
        (await (await fetch("/api/transfers")).json()).find((t) => t.id === id),
      original.id,
    );
  const rename = async (field, value) => {
    await field.click();
    await field.fill(value);
    await field.press("Enter");
    await expect(field).toHaveAttribute("aria-readonly", "true");
  };
  await page.getByLabel("Settings", { exact: true }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  const row = page.locator(".history-item").first();
  await rename(
    row.getByRole("textbox", { name: "Transfer name", exact: true }),
    "Test website",
  );
  await expect.poll(async () => (await record()).title).toBe("Test website");
  expect((await record()).files[0].name).toBe("index.html");
  expect((await record()).hasSite).toBe(true);
  await page
    .getByRole("button", { name: "Close history", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Transfer details", exact: true })
    .click();
  const details = page.locator(".owner-details");
  const title = details.getByRole("textbox", {
    name: "Transfer name",
    exact: true,
  });
  await expect(title).toHaveText("Test website");
  await rename(title, "Another website");
  const file = details.getByRole("textbox", {
    name: "Filename 1",
    exact: true,
  });
  await rename(file, "other.html");
  await expect(title).toHaveText("Another website");
  await rename(file, "index.html");
  await expect(title).toHaveText("Another website");
  const updated = await record();
  expect(updated.id).toBe(original.id);
  expect(updated.url).toBe(original.url);
  expect(updated.hasSite).toBe(true);
  await page.reload();
  await page.getByLabel("Settings", { exact: true }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page
      .locator(".history-item")
      .first()
      .getByRole("textbox", { name: "Transfer name", exact: true }),
  ).toHaveText("Another website");
});
