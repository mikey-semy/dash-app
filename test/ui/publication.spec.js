import { test, expect } from "@playwright/test";

test("disabled demonstration never auto-opens code and an open demonstration closes after switching it off", async ({
  page,
}) => {
  let demo = false;
  await page.route("**/public/Code12", (r) =>
    r.fulfill({
      json: {
        locked: false,
        demo,
        preview: true,
        etag: "one",
        name: "test.py",
        expires: null,
        files: [{ name: "test.py", preview: true, size: 9 }],
      },
    }),
  );
  await page.route("**/raw/Code12**", (r) =>
    r.fulfill({ body: "print(1)\n", contentType: "text/plain" }),
  );
  await page.goto("/Code12");
  await expect(
    page.getByRole("button", { name: "Открыть просмотр", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".viewer-dialog,.demo-view")).toHaveCount(0);
  demo = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".demo-view")).toBeVisible();
  await expect(page.locator(".cm-content")).toHaveText("print(1)");
  demo = false;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("button", { name: "Открыть просмотр", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".viewer-dialog,.demo-view")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Открыть просмотр", exact: true })
    .click();
  await expect(page.locator(".viewer-dialog")).toBeVisible();
});

test("unpublished public link shows the centered cross instead of download or viewer controls", async ({
  page,
}) => {
  await page.route("**/public/Paused", (r) =>
    r.fulfill({ status: 404, json: { error: "Передача недоступна" } }),
  );
  await page.goto("/Paused");
  await expect(
    page.getByRole("link", { name: "Вернуться к загрузке", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".viewer-dialog,.demo-view,.transfer-details"),
  ).toHaveCount(0);
});

test("history hides deleted and expired entries and toggles a website without expanding it", async ({
  page,
}) => {
  const now = Date.now();
  let site = {
    id: "site-row",
    state: "ready",
    created: now,
    expires: null,
    ttl: 0,
    files: [{ name: "index.html", size: 12 }],
    size: 12,
    url: "http://127.0.0.1:3001/Site12",
    hasSite: true,
    published: false,
    domain: null,
  };
  const items = () => [
    site,
    { ...site, id: "gone", state: "deleted" },
    { ...site, id: "removing", state: "deleting" },
    { ...site, id: "expired", expires: now - 1000 },
  ];
  await page.route("**/api/session", (r) => r.fulfill({ json: { ok: true } }));
  await page.route("**/api/transfers", (r) => r.fulfill({ json: items() }));
  await page.route("**/api/transfers/site-row/password", (r) =>
    r.fulfill({ json: { password: "" } }),
  );
  await page.route("**/api/transfers/site-row/settings", (r) => {
    site = { ...site, ...r.request().postDataJSON() };
    return r.fulfill({ json: site });
  });
  await page.route("**/api/transfers/site-row/domain-check", (r) => {
    site = { ...site, domainState: { state: "ready", domain: site.domain } };
    return r.fulfill({ json: site });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Настройки", { exact: true }).click();
  await page.getByRole("button", { name: "История", exact: true }).click();
  await expect(page.locator(".history-item")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Опубликовать сайт", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Остановить публикацию", exact: true }),
  ).toBeVisible();
  expect(site.published).toBe(true);
  await expect(page.locator(".history-toggle[aria-expanded=true]")).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Остановить публикацию", exact: true })
    .click();
  expect(site.published).toBe(false);
  await page
    .getByRole("button", { name: "Параметры передачи", exact: true })
    .click();
  await expect(page.getByPlaceholder("example.com")).toBeVisible();
  await expect(page.getByPlaceholder("example.com")).toHaveCSS(
    "font-size",
    "16px",
  );
  await page.getByPlaceholder("example.com").fill("site.example.com");
  await page.getByPlaceholder("example.com").press("Enter");
  await expect.poll(() => site.domain).toBe("site.example.com");
  await page
    .getByRole("button", { name: "Проверить домен", exact: true })
    .click();
  const check = page.getByRole("button", {
    name: "Проверить домен",
    exact: true,
  });
  await expect(check).toHaveAttribute("title", "Успешно проверено");
  await expect(check).toHaveCSS("color", "rgb(37, 134, 74)");
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const offsets = await page
      .getByRole("dialog", { name: "Параметры передачи", exact: true })
      .evaluate((el) => {
        const boxes = (selector) =>
          [...el.querySelectorAll(selector)].map((x) => {
            const b = x.getBoundingClientRect();
            return b.x + b.width / 2;
          });
        return {
          password: boxes(".transfer-password button"),
          domain: boxes(".domain-field button"),
        };
      });
    expect(offsets.domain).toEqual(offsets.password);
  }
  await page
    .getByRole("button", { name: "Маршруты React/Vue", exact: true })
    .click();
  await expect.poll(() => site.spa).toBe(true);
});
