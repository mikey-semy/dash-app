import { test, expect } from "@playwright/test";
async function confirmDelete(button) {
  await button.click();
  const confirmation = button.page().locator('button[data-confirming="true"]');
  await expect(confirmation).toHaveCount(1);
  await confirmation.click();
}
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
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page
    .getByRole("button", {
      name: "Сгенерировать и скопировать пароль",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Сгенерировать и скопировать пароль",
      exact: true,
    }),
  ).toHaveAttribute("data-active", "true");
  const pin = await page.evaluate(() => navigator.clipboard.readText());
  expect(pin).toMatch(/^\d{6}$/);
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
  await recipient.getByLabel("Пароль передачи").fill(pin);
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
  expect((await download).suggestedFilename()).toMatch(
    /^files-\d{8}-\d{9}\.zip$/,
  );
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
  await expect(item.locator(".share-controls button")).toHaveCount(4);
  await confirmDelete(
    item.getByRole("button", { name: "Удалить", exact: true }),
  );
  await recipient.reload();
  await expect(
    recipient.getByRole("img", { name: "Передача недоступна" }),
  ).toBeVisible();
  await expect(recipient.getByRole("alert")).toHaveCount(0);
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
  await expect(
    page.getByRole("button", { name: /^Срок хранения:/ }),
  ).toBeVisible();
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
  await expect(page.locator(".upload-actions button")).toHaveCount(2);
  expect((await page.locator(".upload-actions").innerText()).trim()).toBe("");
  await expect(page.locator(".upload-times")).not.toContainText("Прошло");
  await expect(page.locator(".upload-times")).not.toContainText("осталось");
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
  const generate = page.getByRole("button", {
    name: "Сгенерировать и скопировать пароль",
    exact: true,
  });
  await generate.click();
  await expect(
    page.getByRole("button", {
      name: "Сгенерировать и скопировать пароль",
      exact: true,
    }),
  ).toHaveAttribute("data-active", "true");
  const pin = await page.evaluate(() => navigator.clipboard.readText());
  expect(pin).toMatch(/^\d{6}$/);
  await expect(generate).toHaveAttribute("data-active", "true");
  await expect(page.locator(".settings-toolbar>button")).toHaveCount(4);
  await expect(
    page.locator(".settings-toolbar input,.settings-toolbar select"),
  ).toHaveCount(0);
  const duration = page.getByRole("button", { name: /^Срок хранения:/ });
  for (const [index, name] of [
    "Сутки",
    "3 дня",
    "7 дней",
    "Бессрочно",
    "1 час",
    "6 часов",
    "Сутки",
  ].entries()) {
    await expect(duration).toHaveAttribute(
      "aria-label",
      "Срок хранения: " + name,
    );
    if (index < 6) await duration.click();
  }
  const gear = await page
      .getByLabel("Настройки", { exact: true })
      .boundingBox(),
    menu = await page.locator(".settings-toolbar").boundingBox();
  expect(menu.x + menu.width).toBeLessThan(gear.x);
  expect(
    Math.abs(menu.y + menu.height / 2 - gear.y - gear.height / 2),
  ).toBeLessThan(2);
  expect(
    await page
      .locator(".settings-toolbar")
      .evaluate((el) => getComputedStyle(el).borderWidth),
  ).toBe("0px");
  await page.screenshot({ path: "work/ui-settings.png", fullPage: true });
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
  await expect(
    page.locator(".settings-toolbar input,.settings-toolbar select"),
  ).toHaveCount(0);
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
      .locator(".settings .inline-details-body")
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
});

test("password is enabled only after successful copy", async ({ page }) => {
  await login(page);
  await page.getByLabel("Настройки", { exact: true }).click();
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error("blocked"));
  });
  const button = page.getByRole("button", {
    name: "Сгенерировать и скопировать пароль",
    exact: true,
  });
  await button.click();
  await expect(button).toHaveAttribute("data-active", "false");
  await expect(button).toHaveAttribute(
    "title",
    "Не удалось скопировать. Повторить",
  );
});

test("double-click removes password without a delayed reactivation or changing the clipboard", async ({
  page,
}) => {
  await login(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByLabel("Настройки", { exact: true }).click();
  const button = page.getByRole("button", {
    name: "Сгенерировать и скопировать пароль",
    exact: true,
  });
  await button.click();
  await expect(button).toHaveAttribute("data-active", "true");
  const before = await page.evaluate(() => navigator.clipboard.readText());
  await button.dblclick();
  await expect(button).toHaveAttribute("data-active", "false");
  await expect(button).toHaveAttribute("title", "Пароль убран");
  await page.waitForTimeout(600);
  await expect(button).toHaveAttribute("data-active", "false");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    before,
  );
  let password;
  await page.route("**/api/transfers", (route) => {
    if (route.request().method() === "POST") {
      password = route.request().postDataJSON().password;
      return route.fulfill({ status: 409, json: { error: "test stop" } });
    }
    return route.continue();
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "test.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("test"),
  });
  await expect.poll(() => password).toBe("");
});

test("infinite retention persists locally; password does not persist", async ({
  page,
}) => {
  await login(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByLabel("Настройки", { exact: true }).click();
  const ttl = page.getByRole("button", { name: /^Срок хранения:/ });
  for (let i = 0; i < 3; i++) await ttl.click();
  await expect(ttl).toHaveAttribute("aria-label", "Срок хранения: Бессрочно");
  await page
    .getByRole("button", {
      name: "Сгенерировать и скопировать пароль",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Сгенерировать и скопировать пароль",
      exact: true,
    }),
  ).toHaveAttribute("data-active", "true");
  await page.reload();
  await page.getByLabel("Настройки", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Срок хранения:/ }),
  ).toHaveAttribute("aria-label", "Срок хранения: Бессрочно");
  await expect(
    page.getByRole("button", {
      name: "Сгенерировать и скопировать пароль",
      exact: true,
    }),
  ).toHaveAttribute("data-active", "false");
});

test("history and ready-view plus append to the same transfer and preserve its link", async ({
  page,
}) => {
  await login(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator("input[type=file]").setInputFiles({
    name: "base.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("base"),
  });
  await expect(
    page.getByRole("button", { name: "Добавить", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Копировать ссылку", exact: true })
    .click();
  const original = await page.evaluate(() => navigator.clipboard.readText());
  await page.getByLabel("Настройки", { exact: true }).click();
  await page.getByRole("button", { name: "История", exact: true }).click();
  const first = page.locator(".history-item").first();
  await expect(first.locator(".share-controls button")).toHaveCount(4);
  const choosing = page.waitForEvent("filechooser");
  await first
    .getByRole("button", { name: "Добавить файлы в передачу", exact: true })
    .click();
  await (
    await choosing
  ).setFiles({
    name: "extra.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("extra"),
  });
  await expect(page.getByRole("dialog")).toBeHidden();
  const count = async () => {
    const list = await (await page.request.get("/api/transfers")).json();
    return list.find((t) => t.url === original)?.files.length;
  };
  await expect.poll(count, { timeout: 15000 }).toBe(2);
  await expect(
    page.getByRole("button", { name: "Добавить", exact: true }),
  ).toBeVisible();
  const again = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await (
    await again
  ).setFiles({
    name: "third.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("third"),
  });
  await expect.poll(count, { timeout: 15000 }).toBe(3);
  await expect(
    page.getByRole("button", { name: "Добавить", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Копировать ссылку", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    original,
  );
});

test("selected history files can be removed while preserving an empty reusable link", async ({
  page,
}) => {
  await login(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator("input[type=file]").setInputFiles([
    { name: "keep.txt", mimeType: "text/plain", buffer: Buffer.from("keep") },
    {
      name: "remove.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("remove"),
    },
  ]);
  await expect(
    page.getByRole("button", { name: "Добавить", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Копировать ссылку", exact: true })
    .click();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  const record = async () => {
    const list = await (await page.request.get("/api/transfers")).json();
    return list.find((t) => t.url === url);
  };
  const open = async () => {
    await page.getByLabel("Настройки", { exact: true }).click();
    await page.getByRole("button", { name: "История", exact: true }).click();
    const first = page.locator(".history-item").first();
    await first.locator(".history-toggle").click();
    return first;
  };
  let row = await open();
  await row.getByLabel("Выбрать remove.txt", { exact: true }).check();
  await confirmDelete(
    row.getByRole("button", { name: "Удалить выбранные файлы", exact: true }),
  );
  await expect
    .poll(async () => (await record())?.files.length, { timeout: 15000 })
    .toBe(1);
  await expect(
    row.getByLabel("Выбрать keep.txt", { exact: true }),
  ).toBeVisible();
  await row.getByLabel("Выбрать все файлы", { exact: true }).check();
  await confirmDelete(
    row.getByRole("button", { name: "Удалить выбранные файлы", exact: true }),
  );
  await expect.poll(async () => (await record())?.state).toBe("empty");
  expect((await record()).files).toHaveLength(0);
  const choice = page.waitForEvent("filechooser");
  await row
    .getByRole("button", { name: "Добавить файлы в передачу", exact: true })
    .click();
  await (
    await choice
  ).setFiles({
    name: "replacement.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("replacement"),
  });
  await expect
    .poll(async () => (await record())?.files[0]?.name, { timeout: 15000 })
    .toBe("replacement.txt");
  await expect(
    page.getByRole("button", { name: "Добавить", exact: true }),
  ).toBeVisible();
});

test("mobile completed controls stay centered with no document overflow after a tall upload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 650 });
  await login(page);
  await page.locator("input[type=file]").setInputFiles(
    Array.from({ length: 32 }, (_, i) => ({
      name: `file-${i}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from("x"),
    })),
  );
  await expect(page.locator(".share-ready")).toBeVisible({ timeout: 20000 });
  for (const height of [650, 520, 844]) {
    await page.setViewportSize({ width: 390, height });
    await page.evaluate(() => {
      window.scrollTo(0, 2000);
      document.querySelector(".owner > .center").scrollTop = 2000;
    });
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await expect
      .poll(() =>
        page.locator(".owner > .center").evaluate((el) => el.scrollTop),
      )
      .toBe(0);
    await expect
      .poll(async () => {
        const r = await page.locator(".share-ready").boundingBox();
        return (
          Math.abs(r.x + r.width / 2 - 195) < 2 &&
          Math.abs(r.y + r.height / 2 - height / 2) < 2
        );
      })
      .toBe(true);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight <= innerHeight + 1 &&
          document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.locator(".settings > button").click();
  await page.locator(".settings-toolbar button").first().click();
  await expect(page.locator(".dialog-header h2 svg")).toBeVisible();
  expect(await page.locator(".dialog-header h2").innerText()).toBe("");
});

test("recipient sharing stays inside details and countdown ticks without moving download", async ({
  page,
}) => {
  const now = Date.now(),
    expires = now + 90061000;
  await page.clock.install({ time: new Date(now) });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data) => {
        window.sharedData = data;
      },
    });
  });
  await page.route("**/public/Test12", (r) =>
    r.fulfill({
      json: { files: [{ name: "sample.txt", size: 7 }], size: 7, expires },
    }),
  );
  await page.goto("/Test12");
  await expect(page.locator(".expiry-corner")).toHaveText("25:01:01");
  const download = page.locator(".primary-action"),
    before = await download.boundingBox();
  await expect(page.locator(".recipient-share-actions")).toBeHidden();
  await page.locator(".transfer-details > button").click();
  await expect(page.locator(".recipient-share-actions")).toBeVisible();
  await page.locator(".recipient-share-actions button").nth(0).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "http://127.0.0.1:3001/Test12",
  );
  await page.locator(".recipient-share-actions button").nth(1).click();
  await expect(page.locator(".recipient-qr")).toBeVisible();
  await page.locator(".recipient-share-actions button").nth(2).click();
  expect(await page.evaluate(() => window.sharedData)).toEqual({
    url: "http://127.0.0.1:3001/Test12",
  });
  await expect(page.locator(".transfer-information time")).toHaveAttribute(
    "datetime",
    new Date(expires).toISOString(),
  );
  await page.clock.runFor(2000);
  await expect(page.locator(".expiry-corner")).toHaveText("25:00:59");
  const after = await download.boundingBox();
  expect(Math.abs(before.y - after.y)).toBeLessThan(1);
  await page.locator(".transfer-details > button").click();
  await expect(page.locator(".recipient-share-actions")).toBeHidden();
});

test("infinite recipient hides unavailable native sharing and history shows remaining time", async ({
  page,
}) => {
  const now = Date.now(),
    expires = now + 3600000;
  await page.clock.install({ time: new Date(now) });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    }),
  );
  await page.route("**/public/Inf123", (r) =>
    r.fulfill({
      json: { files: [{ name: "file", size: 1 }], size: 1, expires: null },
    }),
  );
  await page.goto("/Inf123");
  await expect(page.locator(".expiry-corner")).toHaveText("∞");
  await page.locator(".transfer-details > button").click();
  await expect(page.locator(".recipient-share-actions button")).toHaveCount(2);
  await page.route("**/api/session", (r) => r.fulfill({ json: { ok: true } }));
  await page.route("**/api/transfers", (r) =>
    r.fulfill({
      json: [
        {
          id: "finite",
          state: "ready",
          created: now,
          expires,
          ttl: 3600,
          files: [{ name: "file", size: 1 }],
          size: 1,
          url: "http://127.0.0.1:3001/Test12",
        },
        {
          id: "infinite",
          state: "ready",
          created: now,
          expires: null,
          ttl: 0,
          files: [],
          size: 0,
          url: "http://127.0.0.1:3001/Inf123",
        },
      ],
    }),
  );
  await page.goto("/");
  await page.locator(".settings > button").click();
  await page.locator(".settings-toolbar button").first().click();
  await expect(page.locator(".expiry-inline").first()).toHaveText("01:00:00");
  await expect(page.locator(".expiry-inline").last()).toHaveText("∞");
  await page.clock.runFor(1000);
  await expect(page.locator(".expiry-inline").first()).toHaveText("00:59:59");
});

test("history selection deletes multiple records without expanding and supports select all", async ({
  page,
}) => {
  const now = Date.now();
  let items = ["ready", "deleted", "ready"].map((state, i) => ({
    id: "row" + i,
    state,
    created: now + i * 1000,
    expires: now + 3600000,
    ttl: 3600,
    files: [],
    size: 0,
    url: state === "ready" ? "http://127.0.0.1:3001/Test12" : null,
  }));
  const removed = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/session", (r) => r.fulfill({ json: { ok: true } }));
  await page.route("**/api/transfers", (r) => r.fulfill({ json: items }));
  await page.route("**/api/history", (r) => {
    const ids = r.request().postDataJSON().ids;
    removed.push(ids);
    items = items.filter((t) => !ids.includes(t.id));
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await page.locator(".settings > button").click();
  await page.locator(".settings-toolbar button").first().click();
  await expect(page.locator(".history-state svg")).toHaveCount(3);
  await expect(page.locator(".history-toggle")).not.toContainText([
    "Готово",
    "Удалено",
    "Готово",
  ]);
  await expect(page.locator(".dialog-header h2")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator(".dialog-header input")).toBeFocused();
  const closeBox = await page.locator(".dialog-header > button").boundingBox();
  const deleteBox = await page
    .locator(".history-bulk-actions button")
    .boundingBox();
  expect(closeBox.width).toBe(deleteBox.width);
  expect(closeBox.height).toBe(deleteBox.height);
  expect(closeBox.x - deleteBox.x - deleteBox.width).toBeGreaterThan(100);
  const rows = page.locator(".history-item");
  await rows.nth(0).locator(".history-select").check();
  await rows.nth(1).locator(".history-select").check();
  await expect(page.locator(".history-toggle[aria-expanded=true]")).toHaveCount(
    0,
  );
  expect(
    await page
      .locator(".dialog-header input")
      .evaluate((el) => el.indeterminate),
  ).toBe(true);
  await confirmDelete(page.locator(".history-bulk-actions button"));
  await expect(rows).toHaveCount(1);
  expect(removed[0]).toEqual(["row0", "row1"]);
  await page.locator(".dialog-header input").check();
  await confirmDelete(page.locator(".history-bulk-actions button"));
  await expect(rows).toHaveCount(0);
  await expect(page.locator(".history-bulk-actions button")).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("already open recipient refreshes changed files and becomes a cross after deletion", async ({
  page,
}) => {
  let state = "ready";
  await page.route("**/public/Live12", (r) =>
    state === "deleted"
      ? r.fulfill({ status: 404, json: { error: "Unavailable" } })
      : state === "offline"
        ? r.fulfill({
            status: 502,
            contentType: "text/html",
            body: "<html>Bad Gateway</html>",
          })
        : r.fulfill({
            json: {
              files: [
                {
                  name: state === "ready" ? "before.txt" : "after.txt",
                  size: 1,
                },
              ],
              size: 1,
              expires: null,
            },
          }),
  );
  await page.goto("/Live12");
  await page.locator(".transfer-details > button").click();
  await expect(page.locator(".files")).toContainText("before.txt");
  state = "offline";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".primary-action")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  state = "changed";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".files")).toContainText("after.txt");
  state = "deleted";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".unavailable")).toBeVisible();
  await expect(
    page.locator(".primary-action,.transfer-details,.expiry-corner"),
  ).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("failed delete closes QR and never leaks Safari JSON parser errors; retry returns to upload", async ({
  page,
}) => {
  await login(page);
  await page.locator("input[type=file]").setInputFiles({
    name: "delete.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("x"),
  });
  await expect(page.locator(".share-ready")).toBeVisible();
  await page.locator(".share-ready .share-controls button").nth(0).click();
  await expect(page.locator(".qr-popover.is-open")).toBeVisible();
  await page.route("**/api/transfers/*", (r) =>
    r.request().method() === "DELETE"
      ? r.fulfill({
          status: 502,
          contentType: "text/html",
          body: "<html>Bad Gateway</html>",
        })
      : r.continue(),
  );
  await confirmDelete(
    page.locator(".share-ready .share-controls button").nth(2),
  );
  await expect(page.locator(".qr-popover.is-open")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveText(
    "Не удалось связаться с сервером. Повторите.",
  );
  await page.unroute("**/api/transfers/*");
  await confirmDelete(
    page.locator(".share-ready .share-controls button").nth(2),
  );
  await expect(page.locator(".share-ready")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".primary-action")).toBeVisible();
});

test("delete confirmation is cancelled by blur, timeout and selection changes", async ({
  page,
}) => {
  let deleted = 0;
  const now = Date.now();
  await page.clock.install({ time: new Date(now) });
  await page.route("**/api/session", (r) => r.fulfill({ json: { ok: true } }));
  await page.route("**/api/transfers", (r) =>
    r.fulfill({
      json: [
        {
          id: "confirm",
          state: "ready",
          created: now,
          expires: null,
          ttl: 0,
          files: [],
          size: 0,
          url: "http://127.0.0.1:3001/Test12",
        },
      ],
    }),
  );
  await page.route("**/api/transfers/confirm", (r) => {
    deleted++;
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await page.locator(".settings > button").click();
  await page.locator(".settings-toolbar button").first().click();
  const row = page.locator(".history-item"),
    trash = row.locator(".share-controls button").last();
  await trash.click();
  await expect(trash).toHaveAttribute("data-confirming", "true");
  expect(deleted).toBe(0);
  await row.locator(".history-select").click();
  await expect(trash).toHaveAttribute("data-confirming", "false");
  await trash.click();
  await page.clock.runFor(4100);
  await expect(trash).toHaveAttribute("data-confirming", "false");
  expect(deleted).toBe(0);
  await trash.click();
  await expect(trash).toHaveAttribute("data-confirming", "true");
  await trash.click();
  await expect.poll(() => deleted).toBe(1);
  await row.locator(".history-toggle").click();
  await expect(row.locator(".history-information")).toContainText("∞");
  await expect(row.locator(".history-information")).not.toContainText(
    "Бессрочно",
  );
});
