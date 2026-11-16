import { test, expect } from "@playwright/test";
async function login(page) {
  await page.goto("/");
  await page.getByLabel("Пароль", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.locator(".owner")).toBeVisible();
}
async function record(page) {
  return page.evaluate(
    async () => (await (await fetch("/api/transfers")).json())[0],
  );
}
async function confirm(button) {
  await button.click();
  await button.page().locator('button[data-confirming="true"]').click();
}
test("history header order, aligned file actions and individual removals preserve the transfer", async ({
  page,
}) => {
  await login(page);
  await page.locator("input[type=file]").setInputFiles([
    { name: "short.txt", mimeType: "text/plain", buffer: Buffer.from("first") },
    {
      name: "much-longer-name.md",
      mimeType: "text/plain",
      buffer: Buffer.from("# second"),
    },
    {
      name: "data.bin",
      mimeType: "application/octet-stream",
      buffer: Buffer.from([0, 1, 2]),
    },
  ]);
  await expect(page.locator(".share-ready")).toBeVisible();
  const original = await record(page);
  await page.getByLabel("Подробности передачи", { exact: true }).click();
  const current = page.locator(".owner-details");
  const eyes = current.locator(
    '.file-actions button[aria-label^="Просмотреть"]',
  );
  const first = await eyes.nth(0).boundingBox(),
    second = await eyes.nth(1).boundingBox();
  expect(first.x).toBe(second.x);
  await confirm(
    current.getByRole("button", { name: "Удалить data.bin", exact: true }),
  );
  await expect.poll(async () => (await record(page)).files.length).toBe(2);
  await expect(current).toHaveAttribute("data-open", "true");
  expect((await record(page)).url).toBe(original.url);
  await page.getByLabel("Настройки", { exact: true }).click();
  await page.getByRole("button", { name: "История", exact: true }).click();
  const item = page.locator(".history-item").first();
  const order = await item
    .locator(".history-row")
    .evaluate((row) =>
      Array.from(
        row.querySelectorAll('input,button,[role="img"],[role="textbox"]'),
      ).map((el) => el.getAttribute("aria-label")),
    );
  expect(order.slice(2)).toEqual([
    "Название передачи",
    "Открыть передачу",
    "Добавить файлы в передачу",
    "Параметры передачи",
    "QR-код",
    "Копировать ссылку",
    "Удалить",
    "Передача " + new Date(original.created).toLocaleString("ru-RU"),
  ]);
  expect(await item.locator(".history-row time").count()).toBe(0);
  await item.locator(".history-toggle").click();
  const selectAll = await item
      .locator(".file-selection-actions input")
      .boundingBox(),
    bulk = await item
      .getByRole("button", { name: "Удалить выбранные файлы", exact: true })
      .boundingBox();
  expect(
    Math.abs(selectAll.y + selectAll.height / 2 - bulk.y - bulk.height / 2),
  ).toBeLessThan(2);
  await expect(
    item
      .getByRole("button", { name: "Удалить short.txt", exact: true })
      .locator("svg.lucide-x"),
  ).toBeVisible();
  await expect(item.locator(".history-dates time")).toBeVisible();
  await expect(item.locator(".history-remaining .expiry-inline")).toBeVisible();
  await confirm(
    item.getByRole("button", { name: "Удалить short.txt", exact: true }),
  );
  await expect.poll(async () => (await record(page)).files.length).toBe(1);
  expect((await record(page)).url).toBe(original.url);
  await expect(
    item.getByRole("button", {
      name: "Удалить much-longer-name.md",
      exact: true,
    }),
  ).toBeVisible();
});
test("unknown Markdown links and other page errors show only a centered cross and report details to console", async ({
  page,
}) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const response = await page.goto("/missing/nested-link");
  expect(response.status()).toBe(404);
  await expect(
    page.getByRole("link", { name: "Вернуться к загрузке", exact: true }),
  ).toBeVisible();
  expect((await page.locator("body").innerText()).trim()).toBe("");
  await expect
    .poll(() => errors.some((message) => message.includes("[DU]")))
    .toBe(true);
  await page
    .getByRole("link", { name: "Вернуться к загрузке", exact: true })
    .click();
  await expect(page.getByLabel("Пароль", { exact: true })).toBeVisible();
});
test("gallery retains a small image intrinsic dimensions", async ({ page }) => {
  const gif = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/public/Small1", (r) =>
    r.fulfill({
      json: {
        locked: false,
        demo: true,
        etag: '"small"',
        files: [
          { name: "one.gif", size: gif.length, media: "image", preview: false },
        ],
        media: "image",
        preview: false,
        name: "one.gif",
        expires: null,
      },
    }),
  );
  await page.route("**/preview/Small1/**", (r) =>
    r.fulfill({ body: gif, contentType: "image/gif" }),
  );
  await page.goto("/Small1");
  await expect
    .poll(() => page.locator(".demo-image").evaluate((el) => el.naturalWidth))
    .toBe(1);
  expect(await page.locator(".demo-image").boundingBox()).toMatchObject({
    width: 1,
    height: 1,
  });
});
