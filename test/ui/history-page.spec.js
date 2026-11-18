import { test, expect } from "@playwright/test";
for (const width of [320, 390, 560, 760, 1280])
  test(`history is a full-width page with usable names at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const items = Array.from({ length: 35 }, (_, i) => ({
      id: "page-" + i,
      state: "ready",
      created: Date.now() - i * 1000,
      expires: null,
      ttl: 0,
      revision: "r1",
      title: "A readable transfer title " + i,
      name: "image.png",
      files: [{ name: "image.png", size: 123 }],
      size: 999_950_000,
      url: "http://127.0.0.1:3001/His123",
    }));
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/session") return route.fulfill({ json: { ok: true } });
      if (path === "/api/transfers") return route.fulfill({ json: items });
      throw Error("Unexpected API " + path);
    });
    await page.goto("/");
    await page.getByLabel("Settings", { exact: true }).click();
    await page.getByRole("button", { name: "History", exact: true }).click();
    const history = page.getByRole("region", { name: "History", exact: true });
    await expect(page).toHaveURL(/\/history$/);
    await expect(history).toBeVisible();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    expect(await history.boundingBox()).toMatchObject({
      x: 0,
      y: 0,
      width,
      height: 844,
    });
    await expect(
      history.locator(".file-table-header").getByText("Name", { exact: true }),
    ).toBeVisible();
    const row = history.locator(".history-row").first(),
      name = row.getByRole("textbox", { name: "Transfer name", exact: true });
    expect((await name.boundingBox()).width).toBeGreaterThan(125);
    expect(
      await row.locator(".history-size").evaluate((cell) => {
        const range = document.createRange();
        range.selectNodeContents(cell);
        const [text, wrapped] = range.getClientRects();
        const bounds = cell.getBoundingClientRect();
        return (
          !wrapped && text.left >= bounds.left && text.right <= bounds.right
        );
      }),
    ).toBe(true);
    if (width <= 760) {
      await expect(
        row.getByRole("button", { name: "Actions", exact: true }),
      ).toBeVisible();
      await expect(row.locator(".history-toggle")).toBeVisible();
      await expect(
        row.getByRole("button", { name: "Copy link", exact: true }),
      ).not.toBeVisible();
    } else
      await expect(
        history
          .locator(".file-table-header")
          .getByText("Actions", { exact: true }),
      ).toBeVisible();
    expect(await history.evaluate((el) => el.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      Math.abs(
        (await history.locator(".file-table-header > .file-size").boundingBox())
          .x - (await row.locator(".history-size").boundingBox()).x,
      ),
    ).toBeLessThan(1);
    const header = await history.locator(".file-table-header").boundingBox();
    await history
      .locator(".dialog-body")
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
    expect(await history.locator(".file-table-header").boundingBox()).toEqual(
      header,
    );
    await page.reload();
    await expect(history).toBeVisible();
    await expect(page).toHaveTitle("History");
    await history
      .getByRole("button", { name: "Close history", exact: true })
      .click();
    await expect(page).toHaveURL(/\/$/);
    await page.goBack();
    await expect(history).toBeVisible();
    await page.goForward();
    await expect(history).toHaveCount(0);
  });
