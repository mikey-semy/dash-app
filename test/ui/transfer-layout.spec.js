import { test, expect } from "@playwright/test";

for (const width of [390, 1280, 1920])
  test(`transfer actions rise smoothly and stay visible above full-height scrolling files at ${width}px`, async ({
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
      await expect
        .poll(async () =>
          Math.round(
            (await name.boundingBox()).y +
              (await name.boundingBox()).height / 2,
          ),
        )
        .toBe(96);
      await page.locator(".transfer-details").evaluate(async (element) => {
        await Promise.all(
          element
            .getAnimations({ subtree: true })
            .map((animation) => animation.finished),
        );
      });
      const expanded = await name.boundingBox();
      expect(
        Math.abs(
          (await action.boundingBox()).y +
            (await action.boundingBox()).height / 2 -
            48,
        ),
      ).toBeLessThan(2);
      const body = page.locator(".transfer-information"),
        list = page.locator(".transfer-information > .files");
      await expect(list).toBeVisible();
      expect((await body.boundingBox()).height).toBeGreaterThan(500);
      if (width >= 1280)
        expect((await list.boundingBox()).width).toBeGreaterThan(900);
      const share = page.locator(".recipient-share-actions");
      const shareBefore = (await share.count())
        ? await share.boundingBox()
        : null;
      const header = page.locator(".recipient-file-header");
      const headerBefore = (await header.count())
        ? await header.boundingBox()
        : null;
      await body.evaluate(
        (element) => (element.scrollTop = element.scrollHeight),
      );
      expect(
        await body.evaluate((element) => element.scrollTop),
      ).toBeGreaterThan(100);
      if (headerBefore) {
        expect(await header.boundingBox()).toEqual(headerBefore);
        await expect(header).toBeInViewport();
        await expect(header.getByText("Name", { exact: true })).toBeVisible();
        await expect(header.getByText("Size", { exact: true })).toBeVisible();
        await expect(
          header.getByRole("button", {
            name: "Download selected files",
            exact: true,
          }),
        ).toBeInViewport();
      }
      expect(await name.boundingBox()).toEqual(expanded);
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
          { x: width / 2, y: expanded.y - 3 },
        ),
      ).toBe(false);
      await details.click();
      await expect(details).toHaveAttribute("aria-expanded", "false");
      await expect(name).toBeVisible();
      await expect
        .poll(async () =>
          Math.round(
            (await name.boundingBox()).y +
              (await name.boundingBox()).height / 2,
          ),
        )
        .toBe(422);
      await page.locator(".transfer-details").evaluate(async (element) => {
        await Promise.all(
          element
            .getAnimations({ subtree: true })
            .map((animation) => animation.finished),
        );
      });
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
for (const width of [390, 1280])
  test(`file list rises and unfolds in one synchronized motion at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route("**/public/Mot123", (route) =>
      route.fulfill({
        json: {
          locked: false,
          title: "Motion fixture",
          name: "files.zip",
          expires: null,
          size: 1000,
          files: Array.from({ length: 100 }, (_, i) => ({
            name: `file-${i}.txt`,
            size: 10,
          })),
        },
      }),
    );
    await page.goto("/Mot123");
    await expect(page.locator(".transfer-details")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    async function sample() {
      return page.evaluate(async () => {
        const panel = document.querySelector(".transfer-details");
        const body = panel.querySelector(".details-body");
        const frames = [];
        panel.querySelector(".details-toggle").click();
        const start = performance.now();
        await new Promise((resolve) => {
          const frame = () => {
            frames.push({
              top: panel.getBoundingClientRect().top,
              height: body.getBoundingClientRect().height,
              opacity: getComputedStyle(body).opacity,
            });
            if (performance.now() - start < 550) requestAnimationFrame(frame);
            else resolve();
          };
          requestAnimationFrame(frame);
        });
        return frames;
      });
    }
    const opening = await sample(),
      full = opening.at(-1).height;
    expect(full).toBeGreaterThan(500);
    const moving = opening.filter((f) => f.top > 126 && f.top < 448);
    expect(moving.length).toBeGreaterThan(2);
    for (const frame of moving) {
      expect(
        Math.abs((450 - frame.top) / 326 - frame.height / full),
      ).toBeLessThan(0.12);
      expect(frame.opacity).toBe("1");
    }
    const closing = await sample();
    for (const frame of closing.filter((f) => f.top > 126 && f.top < 448))
      expect(
        Math.abs((450 - frame.top) / 326 - frame.height / full),
      ).toBeLessThan(0.12);
    expect(closing.at(-1).height).toBe(0);
    expect(Math.abs(closing.at(-1).top - 450)).toBeLessThan(1);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator(".details-toggle").click();
    await expect
      .poll(async () =>
        Math.round((await page.locator(".transfer-details").boundingBox()).y),
      )
      .toBe(124);
    expect(
      (await page.locator(".details-body").boundingBox()).height,
    ).toBeGreaterThan(500);
  });
