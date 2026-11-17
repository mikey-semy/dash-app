import { test, expect } from "@playwright/test";

for (const width of [390, 1280, 1920])
  test(`transfer name stays centered and visible above scrolling files at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const record = {
      id: "layout-record",
      state: "ready",
      created: Date.now(),
      expires: null,
      ttl: 0,
      revision: "r1",
      title: "Visible transfer",
      name: "files.zip",
      files: Array.from({ length: 50 }, (_, index) => ({
        name: "file-" + index + ".txt",
        size: 5,
      })),
      size: 250,
      url: "http://127.0.0.1:3001/Lay123",
    };
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/session") return route.fulfill({ json: { ok: true } });
      if (path === "/api/transfers") return route.fulfill({ json: [record] });
      throw Error("Unexpected API " + path);
    });
    await page.route("**/public/Lay123", (route) =>
      route.fulfill({
        json: {
          ...record,
          locked: false,
          demo: false,
          preview: false,
          etag: '"r1"',
        },
      }),
    );
    await page.goto("/");
    const upload = await page
      .getByRole("button", { name: "UPLOAD", exact: true })
      .boundingBox();
    expect(
      Math.abs(upload.y + upload.height / 2 - (844 / 2 - 48)),
    ).toBeLessThan(2);
    await page.getByLabel("Settings", { exact: true }).click();
    await page.getByRole("button", { name: "History", exact: true }).click();
    await page
      .getByRole("dialog", { name: "History", exact: true })
      .getByRole("button", { name: "Open transfer", exact: true })
      .click();
    async function verify(name, action) {
      await expect(name).toBeVisible();
      const before = await name.boundingBox(),
        buttons = await action.boundingBox();
      expect(Math.abs(before.x + before.width / 2 - width / 2)).toBeLessThan(2);
      expect(Math.abs(before.y + before.height / 2 - 844 / 2)).toBeLessThan(2);
      expect(
        Math.abs(buttons.y + buttons.height / 2 - (844 / 2 - 48)),
      ).toBeLessThan(2);
      const details = page.getByRole("button", {
        name: "Transfer details",
        exact: true,
      });
      await expect(details).toHaveAttribute("aria-expanded", "false");
      await details.click();
      const body = page.locator(".transfer-information"),
        list = page.locator(".transfer-information > .files");
      await expect(list).toBeVisible();
      if (width >= 1280)
        expect((await list.boundingBox()).width).toBeGreaterThan(900);
      const share = page.locator(".recipient-share-actions");
      const shareBefore = (await share.count())
        ? await share.boundingBox()
        : null;
      await body.evaluate(
        (element) => (element.scrollTop = element.scrollHeight),
      );
      expect(
        await body.evaluate((element) => element.scrollTop),
      ).toBeGreaterThan(100);
      expect(await name.boundingBox()).toEqual(before);
      if (shareBefore) {
        await expect(share).toBeInViewport();
        expect(await share.boundingBox()).toEqual(shareBefore);
        expect(
          await share.evaluate((el) => !!el.closest(".transfer-information")),
        ).toBe(false);
      }
      expect(
        await page.evaluate(
          ({ x, y }) =>
            !!document
              .elementFromPoint(x, y)
              ?.closest(".files,.transfer-information"),
          { x: width / 2, y: before.y - 3 },
        ),
      ).toBe(false);
      await details.click();
      await expect(details).toHaveAttribute("aria-expanded", "false");
      await expect(name).toBeVisible();
      expect(await name.boundingBox()).toEqual(before);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await verify(
      page.getByRole("textbox", { name: "Transfer name", exact: true }),
      page.locator(".share-ready"),
    );
    await page.goto("/Lay123");
    await verify(
      page.locator(".transfer-name"),
      page.getByRole("link", { name: "DOWNLOAD", exact: true }),
    );
  });

test("a single received file shows its filename before opening details", async ({
  page,
}) => {
  await page.route("**/public/Img123", (route) =>
    route.fulfill({
      json: {
        locked: false,
        title: "",
        name: "image.png",
        files: [{ name: "image.png", size: 20, media: "image" }],
        media: "image",
        preview: false,
        demo: false,
        expires: null,
        size: 20,
      },
    }),
  );
  await page.goto("/Img123");
  await expect(page.locator(".transfer-name")).toHaveText("image.png");
  await expect(page.locator(".transfer-name")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Transfer details", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
});
