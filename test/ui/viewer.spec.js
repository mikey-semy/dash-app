import { test, expect } from "@playwright/test";
test("mobile full-screen viewer defaults to Markdown, closes without reopening and previews archive members", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let archive = false;
  const source = "# Документ\n\n**Текст**\n\n- пункт\n";
  await page.route("**/public/View12", (r) =>
    r.fulfill({
      json: {
        locked: false,
        preview: !archive,
        etag: '"fixture"',
        name: archive ? "files.zip" : "readme.md",
        size: source.length,
        expires: null,
        files: archive
          ? [
              { name: "large.bin", size: 9000000, preview: false },
              { name: "readme.md", size: source.length, preview: true },
            ]
          : [{ name: "readme.md", size: source.length, preview: true }],
      },
    }),
  );
  await page.route(/\/raw\/View12(?:\/\d+)?$/, (r) =>
    r.fulfill({ contentType: "text/plain;charset=utf-8", body: source }),
  );
  await page.goto("/View12");
  await page
    .getByRole("button", { name: "Открыть просмотр", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Документ", exact: true }),
  ).toBeVisible();
  const dialog = page.locator(".viewer-dialog"),
    box = await dialog.boundingBox();
  expect(box).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Показать исходник", exact: true })
    .click();
  await expect(page.locator(".code-editor")).toHaveAttribute(
    "data-language",
    "Markdown",
    { timeout: 15000 },
  );
  expect(
    await page.locator(".cm-content").evaluate((el) => el.isContentEditable),
  ).toBe(false);
  await page
    .getByRole("button", { name: "Закрыть просмотр", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Открыть просмотр", exact: true }),
  ).toBeVisible();
  const refreshed = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/public/View12",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await refreshed;
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Открыть просмотр", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await page
    .getByRole("button", { name: "Закрыть просмотр", exact: true })
    .click();
  archive = true;
  await page.reload();
  await expect(dialog).toHaveCount(0);
  await page.locator(".transfer-details > button").click();
  await page.getByRole("button", { name: "readme.md", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Документ", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "Raw", exact: true }),
  ).toHaveAttribute("href", "/raw/View12/1");
  await page
    .getByRole("button", { name: "Закрыть просмотр", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
});

for (const width of [390, 1280]) {
  test(`QR is a complete overlay without changing scroll geometry at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route("**/public/Qr1234", (r) =>
      r.fulfill({
        json: {
          locked: false,
          preview: true,
          etag: '"qr"',
          name: "example.txt",
          size: 2000,
          expires: null,
          files: [{ name: "example.txt", size: 2000, preview: true }],
        },
      }),
    );
    await page.route("**/raw/Qr1234", (r) =>
      r.fulfill({
        contentType: "text/plain;charset=utf-8",
        body: "line\n".repeat(400),
      }),
    );
    await page.goto("/Qr1234");
    await page
      .getByRole("button", { name: "Открыть просмотр", exact: true })
      .click();
    const dialog = page.locator(".viewer-dialog");
    await expect(dialog.locator(".cm-scroller")).toBeVisible();
    const scroller = dialog.locator(".cm-scroller");
    const before = await scroller.evaluate((el) => ({
      height: el.scrollHeight,
      client: el.clientHeight,
      right: el.getBoundingClientRect().right,
    }));
    expect(Math.abs(before.right - width)).toBeLessThan(1);
    await dialog.getByRole("button", { name: "QR-код", exact: true }).click();
    const qr = page.locator(".qr-dropdown");
    await expect(qr.getByRole("img")).toBeVisible();
    expect(await qr.evaluate((el) => el.parentElement.tagName)).toBe("DIALOG");
    const box = await qr.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    const after = await scroller.evaluate((el) => ({
      height: el.scrollHeight,
      client: el.clientHeight,
      right: el.getBoundingClientRect().right,
    }));
    expect(after).toEqual(before);
    await page.keyboard.press("Escape");
    await expect(qr).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("button", { name: "Закрыть просмотр", exact: true })
      .click();
    await page.locator(".transfer-details > button").click();
    const details = page.locator(".transfer-information");
    expect(Math.abs((await details.boundingBox()).x)).toBeLessThan(1);
    expect(Math.abs((await details.boundingBox()).width - width)).toBeLessThan(
      1,
    );
    const height = await details.evaluate((el) => el.scrollHeight);
    await page
      .locator(".recipient-share-actions")
      .getByRole("button", { name: "QR-код", exact: true })
      .click();
    await expect(qr.getByRole("img")).toBeVisible();
    expect(await qr.evaluate((el) => el.parentElement.tagName)).toBe("BODY");
    expect(await details.evaluate((el) => el.scrollHeight)).toBe(height);
  });
}
