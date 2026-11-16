import { test, expect } from "@playwright/test";

test("opening the upload page does not load editor, detector or Markdown language bundles", async ({
  page,
}) => {
  const resources = [];
  page.on("request", (request) => resources.push(request.url()));
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.route("**/api/transfers", (route) => route.fulfill({ json: [] }));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "UPLOAD", exact: true }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(
    resources.filter((url) =>
      /CodeEditor|detect\.worker|MarkdownCode|MarkdownPreview/.test(url),
    ),
  ).toEqual([]);
});

test("English metadata and shared status-page tokens preserve the minimal error layout", async ({
  page,
}) => {
  const response = await page.goto("/site/NoSuch/invalid/index.html");
  expect(response.status()).toBe(404);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const link = page.getByRole("link", { name: "Back to upload", exact: true });
  await expect(link).toHaveCSS("color", "rgb(211, 52, 52)");
  const bounds = await link.boundingBox(),
    size = page.viewportSize();
  expect(Math.abs(bounds.x + bounds.width / 2 - size.width / 2)).toBeLessThan(
    1,
  );
  expect(Math.abs(bounds.y + bounds.height / 2 - size.height / 2)).toBeLessThan(
    1,
  );
  expect(bounds.width).toBe(24);
  expect(bounds.height).toBe(24);
});
