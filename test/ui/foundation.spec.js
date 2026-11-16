import { test, expect } from "@playwright/test";

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
