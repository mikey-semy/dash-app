import { test, expect } from "@playwright/test";

for (const width of [390, 1280]) {
  test(`modal suspension preserves history position, focus and Escape behavior at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const records = Array.from({ length: 35 }, (_, i) => ({
      id: "modal-" + i,
      state: "ready",
      created: Date.now() - i * 1000,
      expires: null,
      ttl: 0,
      revision: "r" + i,
      title: "Transfer " + i,
      name: "file-" + i + ".txt",
      files: [{ name: "file-" + i + ".txt", size: 5 }],
      size: 5,
      url: "http://127.0.0.1:3001/A" + String(i).padStart(5, "0"),
    }));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/session") return route.fulfill({ json: { ok: true } });
      if (path === "/api/transfers") return route.fulfill({ json: records });
      if (path.endsWith("/password"))
        return route.fulfill({ json: { password: "" } });
      throw Error("Unexpected API " + path);
    });
    await page.goto("/");
    await expect(page.getByLabel("Settings", { exact: true })).toBeVisible();
    const initialOverflow = await page.evaluate(
      () => getComputedStyle(document.documentElement).overflow,
    );
    await page.getByLabel("Settings", { exact: true }).click();
    const trigger = page.getByRole("button", { name: "History", exact: true });
    await trigger.click();
    const history = page.getByRole("region", { name: "History", exact: true }),
      body = history.locator(".dialog-body");
    await expect(history).toBeVisible();
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).overflow,
      ),
    ).toBe("hidden");
    const row = history.locator(".history-item").nth(18);
    const settingsTrigger = row.getByRole("button", {
      name: "Transfer settings",
      exact: true,
    });
    await row.scrollIntoViewIfNeeded();
    const actionsTrigger = row
      .locator(".history-actions")
      .getByRole("button", { name: "Actions", exact: true });
    if (width <= 760) await actionsTrigger.click();
    const top = await body.evaluate((element) => element.scrollTop);
    expect(top).toBeGreaterThan(100);
    await settingsTrigger.click();
    const settings = page.getByRole("dialog", {
      name: "Transfer settings",
      exact: true,
    });
    await expect(settings).toBeVisible();
    await expect(page.locator("dialog[open]")).toHaveCount(1);
    await page.keyboard.press("Tab");
    expect(
      await settings.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
    await page.keyboard.press("Shift+Tab");
    expect(
      await settings.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);
    await expect(history).toBeVisible();
    await expect(width <= 760 ? actionsTrigger : settingsTrigger).toBeFocused();
    expect(await body.evaluate((element) => element.scrollTop)).toBe(top);
    await page.keyboard.press("Escape");
    await expect(history).toHaveCount(0);
    await expect(page.getByLabel("Settings", { exact: true })).toBeFocused();
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).overflow,
      ),
    ).toBe(initialOverflow);
    await page.getByLabel("Settings", { exact: true }).click();
    await trigger.click();
    await expect(history).toBeVisible();
    await history
      .getByRole("button", { name: "Close history", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await expect(history).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "UPLOAD", exact: true }),
    ).toBeVisible();
  });
}

test("text submission blocks Escape until the request finishes; cancelled draft creates no extra transfer", async ({
  page,
}) => {
  let release,
    requests = 0;
  const pending = new Promise((resolve) => (release = resolve));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/session") return route.fulfill({ json: { ok: true } });
    if (path === "/api/transfers" && route.request().method() === "GET")
      return route.fulfill({ json: [] });
    if (path === "/api/transfers" && route.request().method() === "POST") {
      requests++;
      await pending;
      return route.fulfill({
        status: 503,
        json: { error: "Temporarily unavailable" },
      });
    }
    throw Error("Unexpected API " + path);
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "New text transfer", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "Text transfer",
    exact: true,
  });
  await editor.locator(".cm-content").pressSequentially("hello");
  await editor.getByRole("button", { name: "Send text", exact: true }).click();
  await expect.poll(() => requests).toBe(1);
  await page.keyboard.press("Escape");
  await expect(editor).toHaveAttribute("data-closing", "false");
  await expect(
    editor.getByRole("button", { name: "Close editor", exact: true }),
  ).toBeDisabled();
  release();
  await expect(
    editor.getByRole("button", { name: "Close editor", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  expect(requests).toBe(1);
});
