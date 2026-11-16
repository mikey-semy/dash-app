import { test, expect } from "@playwright/test";
async function centered(page, icon) {
  await expect(icon).toBeVisible();
  const box = await icon.boundingBox(),
    size = page.viewportSize();
  expect(Math.abs(box.x + box.width / 2 - size.width / 2)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - size.height / 2)).toBeLessThan(2);
}
test("archive preparation and text loading indicators remain centered on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Password", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "UPLOAD", exact: true }),
  ).toBeVisible();
  let release;
  const pending = new Promise((resolve) => (release = resolve));
  await page.route("**/api/transfers", async (route) => {
    if (route.request().method() === "POST") await pending;
    await route.continue();
  });
  try {
    await page.locator("input[type=file]").setInputFiles(
      ["a.txt", "b.txt"].map((name) => ({
        name,
        mimeType: "text/plain",
        buffer: Buffer.from(name),
      })),
    );
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await centered(
        page,
        page
          .getByRole("status", { name: "Preparing upload", exact: true })
          .locator("svg"),
      );
    }
  } finally {
    release();
  }
  await expect(page.locator(".share-ready")).toBeVisible();
  let releaseRaw;
  const raw = new Promise((resolve) => (releaseRaw = resolve));
  await page.route("**/public/Load01", (r) =>
    r.fulfill({
      json: {
        locked: false,
        preview: true,
        name: "test.txt",
        files: [{ name: "test.txt", preview: true, size: 5 }],
        expires: null,
        etag: '"load"',
      },
    }),
  );
  await page.route("**/raw/Load01", async (r) => {
    await raw;
    await r.fulfill({ body: "hello", contentType: "text/plain" });
  });
  try {
    await page.goto("/Load01");
    await page
      .getByRole("button", { name: "Open preview", exact: true })
      .click();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await centered(
        page,
        page
          .getByRole("status", { name: "Loading text", exact: true })
          .locator("svg"),
      );
    }
  } finally {
    releaseRaw();
  }
});
