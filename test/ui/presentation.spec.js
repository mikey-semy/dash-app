import { test, expect } from "@playwright/test";
const gif = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);
async function login(page) {
  await page.goto("/");
  await page.getByLabel("Пароль", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.locator(".owner")).toBeVisible();
}
test("clean image collection uses native scroll snap, fills mobile viewport and hides DU panels", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/public/Demo12", (r) =>
    r.fulfill({
      json: {
        locked: false,
        demo: true,
        etag: '"demo"',
        files: [
          { name: "one.gif", size: gif.length, media: "image", preview: false },
          { name: "two.gif", size: gif.length, media: "image", preview: false },
        ],
        expires: null,
        name: "images.zip",
        size: 100,
      },
    }),
  );
  await page.route("**/preview/Demo12/**", (r) =>
    r.fulfill({ contentType: "image/gif", body: gif }),
  );
  await page.goto("/Demo12");
  await expect(page.locator(".demo-carousel")).toBeVisible();
  expect(await page.locator(".demo-view").boundingBox()).toMatchObject({
    x: 0,
    y: 0,
    width: 390,
    height: 844,
  });
  await expect(page.locator(".demo-image")).toHaveCount(2);
  await expect(
    page.locator(".text-actions,.upload-link,.expiry-corner"),
  ).toHaveCount(0);
  expect(
    await page
      .locator(".demo-carousel")
      .evaluate((el) => getComputedStyle(el).scrollSnapType),
  ).toBe("x mandatory");
  await page
    .getByRole("button", { name: "Следующее изображение", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator(".demo-carousel")
        .evaluate((el) => Math.round(el.scrollLeft / el.clientWidth)),
    )
    .toBe(1);
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(() =>
      page
        .locator(".demo-carousel")
        .evaluate((el) => Math.round(el.scrollLeft / el.clientWidth)),
    )
    .toBe(0);
});
test("clean Markdown and PDF have no DU toolbar", async ({ page }) => {
  let pdf = false;
  const source = "# Превью\n\n**Текст**\n";
  await page.route("**/public/DemoMd", (r) =>
    r.fulfill({
      json: {
        locked: false,
        demo: true,
        etag: '"demo"',
        files: [
          {
            name: pdf ? "document.pdf" : "readme.md",
            size: source.length,
            media: pdf ? "pdf" : null,
            preview: !pdf,
          },
        ],
        expires: null,
        name: pdf ? "document.pdf" : "readme.md",
        size: source.length,
        preview: !pdf,
        media: pdf ? "pdf" : null,
      },
    }),
  );
  await page.route("**/raw/DemoMd/**", (r) =>
    r.fulfill({ contentType: "text/plain;charset=utf-8", body: source }),
  );
  await page.route("**/preview/DemoMd/**", (r) =>
    r.fulfill({ contentType: "application/pdf", body: "%PDF-1.4\n%%EOF" }),
  );
  await page.goto("/DemoMd");
  await expect(
    page.getByRole("heading", { name: "Превью", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".text-preview-header,.upload-link,.expiry-corner"),
  ).toHaveCount(0);
  pdf = true;
  await page.reload();
  await expect(page.locator(".demo-pdf")).toBeVisible();
  await expect(page.locator(".text-preview-header,.upload-link")).toHaveCount(
    0,
  );
});
test("names edit in place, Escape cancels, settings have no names and their geometry matches history", async ({
  page,
}) => {
  await login(page);
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "name.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello"),
    });
  await expect(page.locator(".share-ready")).toBeVisible();
  await page.getByLabel("Подробности передачи", { exact: true }).click();
  const field = page
    .locator(".owner-details")
    .getByRole("textbox", { name: "Имя файла 1", exact: true });
  expect(await field.evaluate((el) => el.tagName)).toBe("SPAN");
  await field.click();
  await field.fill("cancel.txt");
  await field.press("Escape");
  await expect(field).toHaveText("name.txt");
  await field.click();
  await field.fill("renamed.md");
  await field.press("Enter");
  await expect(field).toHaveText("renamed.md");
  await expect(field).toHaveAttribute("aria-readonly", "true");
  await page.getByLabel("Настройки", { exact: true }).click();
  await page.getByRole("button", { name: "История", exact: true }).click();
  const history = page.getByRole("dialog", { name: "История", exact: true }),
    box = await history.boundingBox();
  await page
    .locator(".history-item")
    .first()
    .getByRole("button", { name: "Параметры передачи", exact: true })
    .click();
  const settings = page.getByRole("dialog", {
    name: "Параметры передачи",
    exact: true,
  });
  expect(await settings.boundingBox()).toMatchObject({
    width: box.width,
    height: box.height,
    x: box.x,
    y: box.y,
  });
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await expect(
    settings.getByRole("textbox", { name: "Название передачи", exact: true }),
  ).toHaveCount(0);
  await expect(
    settings.getByRole("button", { name: "Редактировать текст", exact: true }),
  ).toHaveCount(0);
  await settings
    .getByRole("button", { name: "Закрыть параметры", exact: true })
    .click();
  await expect(history).toBeVisible();
  await page
    .getByRole("button", { name: "Поиск в истории", exact: true })
    .click();
  const search = page.getByLabel("Поиск по имени файла или передачи");
  await search.fill("renamed");
  const clear = page.getByRole("button", {
    name: "Очистить поиск",
    exact: true,
  });
  expect(
    await clear.evaluate((el) =>
      el.parentElement.contains(el.parentElement.querySelector("input")),
    ),
  ).toBe(true);
  await clear.click();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect(clear).toHaveCount(0);
});
test("one-time mode follows infinity in the lifetime cycle and demo setting persists", async ({
  page,
}) => {
  await login(page);
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: "pixel.gif", mimeType: "image/gif", buffer: gif });
  await expect(page.locator(".share-ready")).toBeVisible();
  const transfer = await page.evaluate(
    async () => (await (await fetch("/api/transfers")).json())[0],
  );
  await page
    .locator(".share-ready")
    .getByRole("button", { name: "Параметры передачи", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Параметры передачи",
    exact: true,
  });
  for (let step = 0; step < 4; step++)
    await dialog
      .getByRole("button", { name: /^Срок текущей передачи:/ })
      .click();
  await expect(
    dialog.getByRole("button", {
      name: "Срок текущей передачи: Одноразовая",
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Бессрочно", { exact: true })).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Одноразовое скачивание", exact: true }),
  ).toHaveCount(0);
  const mode = dialog.getByRole("button", {
    name: "Демонстрация без интерфейса",
    exact: true,
  });
  await mode.click();
  await expect(mode).toHaveAttribute("aria-pressed", "true");
  await dialog
    .getByRole("button", { name: "Закрыть параметры", exact: true })
    .click();
  await page.goto(transfer.url);
  await expect(page.locator(".demo-image")).toBeVisible();
  await expect(page.locator(".text-actions,.upload-link")).toHaveCount(0);
});
test("Excel has no content editor and a mislabeled binary shows a brief red cross instead of an error paragraph", async ({
  page,
}) => {
  await login(page);
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "sheet.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from([80, 75, 0, 1, 2]),
    });
  await expect(page.locator(".share-ready")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Редактировать текст", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Настройки", { exact: true }).click();
  await page
    .getByRole("button", { name: "Новая текстовая передача", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Закрыть редактор", exact: true })
    .click();
  // A fresh owner screen lets a separate file be uploaded, not appended to Excel.
  await page.reload();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "binary.txt",
      mimeType: "text/plain",
      buffer: Buffer.from([0, 1, 2]),
    });
  await expect(page.locator(".share-ready")).toBeVisible();
  await page
    .getByRole("button", { name: "Редактировать текст", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Не удалось открыть текст", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator(".edit-error")
      .evaluate((el) => getComputedStyle(el).color),
  ).toBe("rgb(204, 34, 34)");
  await expect(
    page.getByText("Неподдерживаемый текст", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Редактировать текст", exact: true }),
  ).toBeVisible({ timeout: 5000 });
});
