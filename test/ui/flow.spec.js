import { test, expect } from "@playwright/test";
async function login(page) {
  await page.goto("/");
  await page.getByLabel("Пароль", { exact: true }).fill("123456");
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
    await page.emulateMedia({ reducedMotion: "reduce" });
    const box = await action.boundingBox();
    expect(await action.evaluate((el) => getComputedStyle(el).fontSize)).toBe(
      "16px",
    );
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
  await page.getByLabel("Пароль", { exact: true }).fill("000000");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("alert")).toHaveText("Неверный пароль");
  await login(page);
  expect((await page.locator("body").innerText()).trim()).toBe("");
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
  await expect(
    page.getByRole("button", { name: "Добавить", exact: true }),
  ).toBeVisible();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page
    .getByRole("button", { name: "Копировать ссылку", exact: true })
    .click();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  await expect(page.locator(".center .share a")).toHaveCount(0);
  await expect(page.locator(".expiry-corner")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Удаление:");
  expect(await page.locator("body").innerText()).not.toContain(url);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const box = await page.locator(".center .share-controls").boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(width - 12);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: "work/ui-share.png", fullPage: true });
  await page.getByRole("button", { name: "QR-код", exact: true }).click();
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
  await expect(page).toHaveTitle("История");
  const item = page.locator(".history-item").first();
  await expect(item.locator(".history-information")).toBeHidden();
  await item.locator(".history-toggle").click();
  await expect(item.locator(".history-information")).toBeVisible();
  await item.getByRole("button", { name: "QR-код", exact: true }).click();
  await expect(item.getByRole("img", { name: "QR-код ссылки" })).toBeVisible();
  await expect(item.locator(".share-controls button")).toHaveCount(3);
  await item.getByRole("button", { name: "Удалить", exact: true }).click();
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
  expect((await page.locator("body").innerText()).trim()).toBe("");
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
  await expect(page.getByLabel("Срок хранения")).toBeVisible();
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
  await expect(
    page.getByRole("button", { name: "Добавить", exact: true }),
  ).toBeVisible();
  expect(intercepted).toBeGreaterThanOrEqual(4);
});

test("icon controls generate and copy six-digit password; manifest and icons are available", async ({
  page,
}) => {
  await login(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByLabel("Настройки", { exact: true }).click();
  await page
    .getByRole("button", { name: "Сгенерировать пароль", exact: true })
    .click();
  const pin = await page.getByLabel("Пароль скачивания").inputValue();
  expect(pin).toMatch(/^\d{6}$/);
  await page
    .getByRole("button", { name: "Копировать пароль", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(pin);
  expect(await page.locator(".settings-actions").innerText()).toBe("");
  await expect(page.locator(".settings-panel")).not.toContainText("Хранить");
  await expect(page.locator(".settings-panel")).not.toContainText(
    "Пароль скачивания",
  );
  const m = await page.request.get("/manifest.webmanifest");
  expect(m.ok()).toBe(true);
  const manifest = await m.json();
  expect(manifest.start_url).toBe("/");
  for (const i of manifest.icons)
    expect((await page.request.get(i.src)).ok()).toBe(true);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/icon.svg",
  );
});

test("password reveal and submit are inside the input; history header stays fixed while body scrolls", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Вход");
  await page.getByLabel("Пароль", { exact: true }).fill("123456");
  await page
    .getByRole("button", { name: "Показать пароль", exact: true })
    .click();
  await expect(page.getByLabel("Пароль", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page
    .getByRole("button", { name: "Скрыть пароль", exact: true })
    .click();
  await expect(page.getByLabel("Пароль", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  await expect(
    page.locator(".login-field button[type=submit]"),
  ).toHaveAttribute("aria-label", "Войти");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveTitle("Загрузка");
  await page.route("**/api/transfers", (route) =>
    route.fulfill({
      json: Array.from({ length: 35 }, (_, i) => ({
        id: "scroll-" + i,
        state: "deleted",
        created: Date.now() - i * 1000,
        expires: Date.now() + 3600000,
        ttl: 3600,
        files: [{ name: "test.txt", size: 5 }],
        size: 5,
        url: null,
        error: null,
      })),
    }),
  );
  await page.reload();
  await page.getByLabel("Настройки", { exact: true }).click();
  await page.getByRole("button", { name: "История", exact: true }).click();
  const header = page.locator(".dialog-header"),
    body = page.locator(".dialog-body");
  const before = await header.boundingBox();
  expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  expect(await body.evaluate((el) => getComputedStyle(el).scrollbarWidth)).toBe(
    "thin",
  );
  await body.evaluate((el) => (el.scrollTop = el.scrollHeight));
  expect((await header.boundingBox()).y).toBe(before.y);
  await expect(header).toBeVisible();
  await page.screenshot({ path: "work/ui-history.png", fullPage: true });
  await page.getByRole("button", { name: "Закрыть историю" }).click();
  await expect(page).toHaveTitle("Загрузка");
});

test("history expansion preserves modal and clicked header positions throughout animation; disabled copy is not busy", async ({
  page,
}) => {
  await login(page);
  await page.getByLabel("Настройки", { exact: true }).click();
  const copy = page.getByRole("button", {
    name: "Копировать пароль",
    exact: true,
  });
  await expect(copy).toBeDisabled();
  expect(await copy.evaluate((el) => getComputedStyle(el).cursor)).toBe(
    "default",
  );
  await page.getByLabel("Настройки", { exact: true }).click();
  await page.route("**/api/transfers", (route) =>
    route.fulfill({
      json: Array.from({ length: 3 }, (_, i) => ({
        id: "stable-" + i,
        state: "deleted",
        created: Date.now() - i * 1000,
        expires: Date.now() + 3600000,
        ttl: 3600,
        files: Array.from({ length: 30 }, (_, j) => ({
          name: "file-" + j + ".txt",
          size: 5,
        })),
        size: 150,
        url: null,
        error: null,
      })),
    }),
  );
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.reload();
    await page.getByLabel("Настройки", { exact: true }).click();
    await page.getByRole("button", { name: "История", exact: true }).click();
    const dialog = page.getByRole("dialog"),
      toggle = page.locator(".history-toggle").first(),
      before = await dialog.boundingBox(),
      header = await toggle.boundingBox();
    expect(
      await page
        .locator(".dialog-body")
        .evaluate((el) => getComputedStyle(el).overflowY),
    ).toBe("scroll");
    for (const expanded of [true, false]) {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", String(expanded));
      const positions = await page.evaluate(async () => {
        const samples = [];
        for (let i = 0; i < 20; i++) {
          await new Promise(requestAnimationFrame);
          const d = document
              .querySelector(".history-dialog")
              .getBoundingClientRect(),
            h = document
              .querySelector(".history-toggle")
              .getBoundingClientRect();
          samples.push({ y: d.y, height: d.height, headerY: h.y });
        }
        return samples;
      });
      for (const p of positions) {
        expect(Math.abs(p.y - before.y)).toBeLessThan(1);
        expect(Math.abs(p.height - before.height)).toBeLessThan(1);
        expect(Math.abs(p.headerY - header.y)).toBeLessThan(1);
      }
    }
    const rapid = await page.evaluate(async () => {
      const button = document.querySelector(".history-toggle"),
        panel = document.querySelector(".history-item .disclosure");
      button.click();
      await new Promise((r) => setTimeout(r, 70));
      const partial = panel.getBoundingClientRect().height;
      button.click();
      await new Promise(requestAnimationFrame);
      const reversed = panel.getBoundingClientRect().height;
      button.click();
      await new Promise((r) => setTimeout(r, 300));
      const opened = panel.getBoundingClientRect().height;
      button.click();
      await new Promise((r) => setTimeout(r, 300));
      return {
        partial,
        reversed,
        opened,
        closed: panel.getBoundingClientRect().height,
      };
    });
    expect(rapid.partial).toBeGreaterThan(0);
    expect(rapid.reversed).toBeLessThan(rapid.opened);
    expect(rapid.closed).toBeLessThan(1);
    await page.getByRole("button", { name: "Закрыть историю" }).click();
    await expect(dialog).toBeHidden();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByLabel("Настройки", { exact: true }).click();
  expect(
    await page
      .locator(".settings .details-body")
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
});
