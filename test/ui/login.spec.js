import { test, expect } from "@playwright/test";
test("four-digit sign-in preserves leading zeroes and bypasses native length validation", async ({
  page,
}) => {
  let sent;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/session")
      return route.fulfill({
        status: 401,
        json: { error: "Sign in required" },
      });
    if (path === "/api/login") {
      sent = route.request().postDataJSON().password;
      return route.fulfill({ json: { ok: true } });
    }
    if (path === "/api/transfers") return route.fulfill({ json: [] });
    throw Error("Unexpected API " + path);
  });
  await page.goto("/");
  await page.getByLabel("Password", { exact: true }).fill("0042");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "UPLOAD", exact: true }),
  ).toBeVisible();
  expect(sent).toBe("0042");
});
