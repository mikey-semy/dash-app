import { test, expect } from "@playwright/test";
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
