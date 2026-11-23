import { test, expect } from "@playwright/test";

async function fixtures(page) {
  const records = Array.from({ length: 24 }, (_, index) => ({
    id: "fixture" + index,
    state: "ready",
    created: 1794770000000 + index,
    expires: null,
    ttl: 0,
    url: "http://127.0.0.1:3001/Abc123",
    revision: "r1",
    title: "Transfer " + index,
    size: 12,
    files: [{ name: "notes.md", size: 12, preview: true }],
  }));
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.route("**/api/transfers", (route) =>
    route.fulfill({ json: records }),
  );
  await page.route("**/api/transfers/*/text/0", (route) =>
    route.fulfill({
      body: "# Notes\n\nHello",
      contentType: "text/plain",
    }),
  );
  await page.goto("/history");
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`history preview preserves rows and scroll on close, Back and Forward at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await fixtures(page);
    const row = page.locator(".history-item").nth(15);
    await row.scrollIntoViewIfNeeded();
    await row.locator(".history-toggle").click();
    await expect(row.locator(".history-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const preview = row.getByRole("button", {
      name: "Preview notes.md",
      exact: true,
    });
    if (viewport.width < 760) {
      await row
        .locator(".history-information .responsive-actions > button")
        .click();
    }
    await preview.click();
    await expect(
      page.getByRole("dialog", { name: "Text preview", exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/history");
    await page
      .getByRole("button", { name: "Close preview", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".history-page")).toBeVisible();
    await expect(row.locator(".history-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(row.locator(".history-information")).toBeInViewport();
    if (viewport.width < 760) {
      await row
        .locator(".history-information .responsive-actions > button")
        .click();
    }
    await preview.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".history-page")).toBeVisible();
    await expect(row.locator(".history-information")).toBeInViewport();
    await page.goForward();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goBack();
    await expect(page.locator(".history-page")).not.toBeVisible();
  });
}

test("mobile actions use a bounded dropdown without hiding the accordion toggle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page);
  const row = page.locator(".history-item").first();
  const actions = row
    .locator(".history-actions")
    .getByRole("button", { name: "Actions", exact: true });
  await expect(actions).toBeVisible();
  await expect(
    row.getByRole("button", { name: "Copy link", exact: true }),
  ).not.toBeVisible();
  await expect(row.locator(".history-toggle")).toBeVisible();
  await actions.click();
  await expect(actions).toHaveAttribute("aria-expanded", "true");
  await expect(
    row.getByRole("button", { name: "Copy link", exact: true }),
  ).toBeVisible();
  const bounds = await row.locator(".action-popup").first().boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  await page.keyboard.press("Escape");
  await expect(page.locator(".history-page")).toBeVisible();
  await expect(actions).toHaveAttribute("aria-expanded", "false");
  await actions.click();
  await row.getByRole("button", { name: "QR code", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Link QR code", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.locator(".history-page")).toBeVisible();
  await row.locator(".history-toggle").click();
  await expect(row.locator(".history-information")).toBeVisible();
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(
    row.getByRole("button", { name: "Copy link", exact: true }),
  ).toBeVisible();
  await expect(actions).toHaveCount(0);
});

for (const reducedMotion of ["no-preference", "reduce"]) {
  test(`accordion retains animated feedback with ${reducedMotion} motion`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await fixtures(page);
    const row = page.locator(".history-item").first();
    await row.locator(".history-toggle").click();
    const frames = await row.locator(".disclosure").evaluate((element) => {
      const animation = element.getAnimations()[0];
      return animation?.effect.getKeyframes();
    });
    expect(frames?.length).toBe(2);
    expect(frames[0]).toHaveProperty(
      reducedMotion === "reduce" ? "opacity" : "height",
    );
    await expect(row.locator(".history-information")).toBeVisible();
    await row.locator(".history-toggle").click();
    await expect(row.locator(".history-information")).not.toBeVisible();
  });
}

test("Back closes a recipient preview without leaving its short link", async ({
  page,
}) => {
  await page.route("**/public/Bck123", (route) =>
    route.fulfill({
      json: {
        locked: false,
        demo: false,
        preview: true,
        etag: '"fixture"',
        name: "notes.md",
        size: 7,
        expires: null,
        files: [{ name: "notes.md", size: 7, preview: true }],
      },
    }),
  );
  await page.route("**/raw/Bck123", (route) =>
    route.fulfill({ body: "# Notes", contentType: "text/plain" }),
  );
  await page.goto("/Bck123");
  await page.getByRole("button", { name: "Open preview", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/Bck123$/);
  await expect(
    page.getByRole("button", { name: "Open preview", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("history edits the selected text file in a multi-file transfer", async ({
  page,
}) => {
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.route("**/api/transfers", (route) =>
    route.fulfill({
      json: [
        {
          id: "multi",
          state: "ready",
          created: 1794770000000,
          expires: null,
          ttl: 0,
          url: "http://127.0.0.1:3001/Abc123",
          revision: "r1",
          size: 10,
          files: [
            { name: "first.txt", size: 5, preview: true },
            { name: "second.txt", size: 5, preview: true },
          ],
        },
      ],
    }),
  );
  await page.route("**/api/transfers/multi/text/1", (route) =>
    route.fulfill({ body: "second file", contentType: "text/plain" }),
  );
  await page.goto("/history");
  const row = page.locator(".history-item");
  await row.locator(".history-toggle").click();
  await row
    .getByRole("button", { name: "Edit text: second.txt", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "Edit text", exact: true });
  await expect(editor.locator(".cm-content")).toHaveText("second file");
  await expect(editor.getByText("second.txt", { exact: true })).toBeVisible();
});
