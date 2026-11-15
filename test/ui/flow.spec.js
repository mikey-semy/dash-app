import { test, expect } from "@playwright/test";
async function login(page) {
  await page.goto("/");
  await page.getByLabel("Пароль", { exact: true }).fill("test-owner-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "ЗАГРУЗИТЬ",
    }),
  ).toBeVisible();
}
async function checkAction(page, role, text) {
  for (const width of [320, 390, 768, 1280, 2560]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => document.fonts.ready);
    const action = page.getByRole(role, { name: text, exact: true });
    const box = await action.boundingBox();
    expect(box.width).toBeLessThan(width);
    expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(2);
    expect(Math.abs(box.y + box.height / 2 - 844 / 2)).toBeLessThan(2);
    expect(await action.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe(
      "nowrap",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
}
test("empty page, settings, upload, private recipient, ZIP, history and deletion", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.getByLabel("Пароль", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("alert")).toHaveText("Неверный пароль");
  await login(page);
  expect((await page.locator("body").innerText()).trim()).toBe("ЗАГРУЗИТЬ");
  await page.screenshot({ path: "work/ui-desktop.png", fullPage: true });
  await page.getByLabel("Настройки", { exact: true }).click();
  await page.getByLabel("Пароль скачивания").fill("recipient-secret");
  await page.getByLabel("Настройки", { exact: true }).click();
  await page.locator("input[type=file]").setInputFiles([
    {
      name: "привет.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello"),
    },
    { name: "empty", mimeType: "text/plain", buffer: Buffer.alloc(0) },
  ]);
  const link = page.locator(".center .share a");
  await expect(link).toBeVisible();
  const url = await link.getAttribute("href");
  await expect(page.locator(".center .share img")).toBeVisible();
  const context = await browser.newContext(),
    recipient = await context.newPage();
  await recipient.goto(url);
  await expect(recipient.getByText("привет.txt", { exact: true })).toHaveCount(
    0,
  );
  await recipient.getByLabel("Пароль передачи").fill("recipient-secret");
  await recipient.getByRole("button", { name: "Открыть" }).click();
  await expect(
    recipient.getByRole("link", { name: "СКАЧАТЬ", exact: true }),
  ).toBeVisible();
  await expect(recipient.getByText("привет.txt", { exact: true })).toBeHidden();
  await expect(
    recipient.getByRole("link", { name: "Перейти к загрузке" }),
  ).toHaveAttribute("href", "/");
  await checkAction(recipient, "link", "СКАЧАТЬ");
  await recipient.setViewportSize({ width: 1280, height: 720 });
  await recipient.screenshot({
    path: "work/ui-recipient-collapsed.png",
    fullPage: true,
  });
  await recipient.getByLabel("Подробности передачи", { exact: true }).click();
  await expect(
    recipient.getByText("привет.txt", { exact: true }),
  ).toBeVisible();
  await recipient.screenshot({ path: "work/ui-recipient.png", fullPage: true });
  const download = recipient.waitForEvent("download");
  await recipient.getByRole("link", { name: "СКАЧАТЬ" }).click();
  expect((await download).suggestedFilename()).toBe("Файлы.zip");
  await page.getByLabel("Настройки", { exact: true }).click();
  await page.getByRole("button", { name: "История", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await recipient.reload();
  await expect(recipient.getByRole("alert")).toHaveText(
    "Передача недоступна или срок истёк",
  );
  await page.getByRole("button", { name: "Закрыть историю" }).click();
  await context.close();
});
test("mobile empty page, monochrome and no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await checkAction(page, "button", "ЗАГРУЗИТЬ");
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.locator("body").innerText()).trim()).toBe("ЗАГРУЗИТЬ");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgba(0, 0, 0, 0)");
  await page.screenshot({ path: "work/ui-mobile.png", fullPage: true });
  await page.getByLabel("Настройки", { exact: true }).click();
  await expect(page.getByLabel("Хранить")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("browser multipart pause/resume and automatic retry in the open page", async ({
  page,
}) => {
  await login(page);
  let intercepted = 0,
    release;
  const gate = new Promise((resolve) => (release = resolve));
  await page.route("**/fake/**", async (route) => {
    intercepted++;
    if (intercepted === 1) {
      await gate;
      await route.abort().catch(() => {});
    } else if (intercepted === 2)
      await route.fulfill({ status: 503, body: "retry" });
    else await route.continue();
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "multipart.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(9 * 1024 * 1024, 7),
  });
  await expect.poll(() => intercepted).toBe(1);
  await page.getByRole("button", { name: "Пауза", exact: true }).click();
  release();
  await expect(
    page.getByRole("button", { name: "Продолжить", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(page.locator(".center .share a")).toBeVisible();
  expect(intercepted).toBeGreaterThanOrEqual(4);
});
