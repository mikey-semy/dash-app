import { test, expect } from "@playwright/test";

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
  await page.getByRole("button", { name: "Режим SPA", exact: true }).click();
  await expect.poll(() => site.spa).toBe(true);
});
