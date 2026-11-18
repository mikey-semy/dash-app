import { test, expect } from "@playwright/test";

test("Markdown renders Mermaid as an image and keeps wide tables locally scrollable on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const violations = [];
  page.on("console", (message) => {
    if (/content security policy/i.test(message.text()))
      violations.push(message.text());
  });
  const source = [
    "# Diagnostics",
    "",
    "```mermaid",
    "flowchart LR",
    '    A["Вспомогательное питание"] --> B["Драйверы затворов"]',
    '    B --> C["Шесть IGBT"]',
    "```",
    "",
    "| Условие | Приоритетные направления | Что отличает ветвь |",
    "| --- | --- | --- |",
    "| До RUN, питание подано | Вспомогательные источники и токовые измерители | Проверяется отсутствие реальной команды запуска |",
    "",
    "```mermaid",
    "not a valid diagram",
    "```",
  ].join("\n");
  await page.route("**/public/Diag12", (route) =>
    route.fulfill({
      json: {
        locked: false,
        demo: false,
        preview: true,
        etag: '"diagram"',
        name: "diagnostics.md",
        size: Buffer.byteLength(source),
        expires: null,
        files: [
          {
            name: "diagnostics.md",
            size: Buffer.byteLength(source),
            preview: true,
          },
        ],
      },
    }),
  );
  await page.route("**/raw/Diag12", (route) =>
    route.fulfill({ body: source, contentType: "text/plain" }),
  );
  await page.goto("/Diag12");
  await page.getByRole("button", { name: "Open preview", exact: true }).click();
  const diagram = page.getByRole("img", {
    name: "Mermaid diagram",
    exact: true,
  });
  await expect(diagram).toBeVisible({ timeout: 15000 });
  await expect
    .poll(() => diagram.evaluate((image) => image.naturalWidth))
    .toBeGreaterThan(0);
  await expect(diagram).toHaveAttribute("src", /^data:image\/png;base64,/);
  const original = await diagram.elementHandle();
  const availableWidth = async () =>
    diagram.evaluate((image) => {
      const container = image.parentElement;
      return {
        image: image.getBoundingClientRect().width,
        container: container.clientWidth,
        overflow: container.scrollWidth > container.clientWidth,
      };
    });
  const mobile = await availableWidth();
  expect(mobile.image).toBeCloseTo(mobile.container, 0);
  expect(mobile.overflow).toBe(false);
  expect(
    await page
      .locator(".markdown-render-surface")
      .evaluate((frame) => frame.contentDocument === null),
  ).toBe(true);
  const table = page.getByRole("region", { name: "Markdown table" });
  await expect(table.getByRole("table")).toBeVisible();
  await expect(table.getByRole("columnheader")).toHaveCount(3);
  expect(
    await table.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true);
  await table.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  expect(await table.evaluate((element) => element.scrollLeft)).toBeGreaterThan(
    0,
  );
  const scrollLeft = await table.evaluate((element) => element.scrollLeft);
  for (let i = 0; i < 2; i++) {
    await Promise.all([
      page.waitForResponse((response) =>
        response.url().endsWith("/public/Diag12"),
      ),
      page.evaluate(() => window.dispatchEvent(new Event("focus"))),
    ]);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    expect(await original.evaluate((element) => element.isConnected)).toBe(
      true,
    );
    expect(await table.evaluate((element) => element.scrollLeft)).toBe(
      scrollLeft,
    );
  }
  await original.dispose();
  expect(
    await page
      .locator(".markdown-preview")
      .evaluate((element) => element.scrollWidth === element.clientWidth),
  ).toBe(true);
  await expect(page.locator(".markdown-document pre")).toHaveText(
    "not a valid diagram",
  );
  expect(violations).toEqual([]);
});
