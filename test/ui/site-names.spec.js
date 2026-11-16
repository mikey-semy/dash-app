import { test, expect } from "@playwright/test";

test("sites get generated titles; title generator is an editable draft in current view and history only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Password", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "index.html",
    mimeType: "text/html",
    buffer: Buffer.from("<h1>Site</h1>"),
  });
  await expect(page.locator(".share-ready")).toBeVisible();
  const initial = await page.evaluate(
    async () => (await (await fetch("/api/transfers")).json())[0],
  );
  expect(initial.title).toMatch(/^[a-z]+-[a-z]+$/);
  const record = () =>
    page.evaluate(
      async (id) =>
        (await (await fetch("/api/transfers")).json()).find((t) => t.id === id),
      initial.id,
    );
  await page
    .getByRole("button", { name: "Transfer details", exact: true })
    .click();
  const title = page
      .locator(".owner-details")
      .getByRole("textbox", { name: "Transfer name", exact: true }),
    generator = page.getByRole("button", {
      name: "Generate name",
      exact: true,
    });
  await expect(generator).toHaveCount(0);
  await title.click();
  await generator.click();
  await expect(title).not.toHaveText(initial.title);
  expect((await record()).title).toBe(initial.title);
  await title.press("Escape");
  await expect(title).toHaveText(initial.title);
  await expect(generator).toHaveCount(0);
  await title.click();
  await generator.click();
  await expect(title).not.toHaveText(initial.title);
  const next = await title.textContent();
  await title.press("Enter");
  await expect.poll(async () => (await record()).title).toBe(next);
  expect((await record()).files[0].name).toBe("index.html");
  expect((await record()).url).toBe(initial.url);
  await page.getByLabel("Settings", { exact: true }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  const field = page
    .locator(".history-item")
    .first()
    .getByRole("textbox", { name: "Transfer name", exact: true });
  await expect(generator).toHaveCount(0);
  await field.click();
  await expect(generator).toBeVisible();
  await generator.click();
  await expect(field).not.toHaveText(next);
  const historyName = await field.textContent();
  await field.press("Enter");
  await expect.poll(async () => (await record()).title).toBe(historyName);
  await field.click();
  await field.fill("My own website");
  await field.press("Enter");
  await expect.poll(async () => (await record()).title).toBe("My own website");
  await page
    .getByRole("button", { name: "Close history", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close current transfer", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Text"),
  });
  await expect(page.locator(".share-ready")).toBeVisible();
  await page
    .getByRole("button", { name: "Transfer details", exact: true })
    .click();
  await page
    .locator(".owner-details")
    .getByRole("textbox", { name: "Transfer name", exact: true })
    .click();
  await expect(generator).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
