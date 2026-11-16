import { test, expect } from "@playwright/test";
test("folder tree supports Markdown navigation and an isolated static site with relative pages, CSS and modules", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByLabel("Пароль", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "ЗАГРУЗИТЬ", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const f = (name, text) => ({
      name,
      isFile: true,
      isDirectory: false,
      file: (ok) => ok(new File([text], name)),
    });
    const d = (name, list) => ({
      name,
      isFile: false,
      isDirectory: true,
      createReader() {
        let done = false;
        return {
          readEntries(ok) {
            ok(done ? [] : list);
            done = true;
          },
        };
      },
    });
    const root = d("project", [
      f(
        "index.html",
        '<!doctype html><html><head><link rel="stylesheet" href="/assets/site.css"></head><body><h1>Project</h1><a href="docs/page.html">Next</a><script>document.body.dataset.inline="yes"</script><script type="module" src="/assets/main.js"></script></body></html>',
      ),
      f(
        "README.md",
        "# Project\n\n[Документ](docs/next.md)\n\n![Picture](assets/image.svg)\n",
      ),
      d("docs", [
        f("page.html", '<h1>Second page</h1><a href="../index.html">Back</a>'),
        f("next.md", "# Вложенный документ\n\n[Назад](../README.md)\n"),
      ]),
      d("assets", [
        f("site.css", "h1{color:rgb(12,34,56)}"),
        f(
          "main.js",
          'import value from "/assets/data.js"; document.body.dataset.module=value;',
        ),
        f("data.js", 'export default "loaded";'),
        f(
          "image.svg",
          '<svg xmlns="http://www.w3.org/2000/svg" width="3" height="2"><path d="M0 0h3v2H0z"/></svg>',
        ),
      ]),
      d("empty", []),
    ]);
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: {
        items: [{ kind: "file", webkitGetAsEntry: () => root }],
        files: [],
      },
    });
    document.querySelector("main").dispatchEvent(event);
  });
  await page
    .getByRole("button", { name: "Загрузить папки", exact: true })
    .click();
  await expect(page.locator(".share-ready")).toBeVisible();
  const record = await page.evaluate(
    async () => (await (await fetch("/api/transfers")).json())[0],
  );
  expect(record.files.some((f) => f.name === "project/docs/next.md")).toBe(
    true,
  );
  expect(record.files.some((f) => f.name === "project.zip")).toBe(false);
  const reader = await context.newPage();
  await reader.goto(
    new URL(record.url).pathname +
      "?file=" +
      encodeURIComponent("project/README.md"),
  );
  await expect(
    reader.getByRole("heading", { name: "Project", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      reader
        .getByRole("img", { name: "Picture", exact: true })
        .evaluate((image) => image.naturalWidth),
    )
    .toBe(3);
  await reader.getByRole("link", { name: "Документ", exact: true }).click();
  await expect(
    reader.getByRole("heading", { name: "Вложенный документ", exact: true }),
  ).toBeVisible();
  await reader.getByRole("link", { name: "Назад", exact: true }).click();
  await expect(
    reader.getByRole("heading", { name: "Project", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Параметры передачи", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Демонстрация без интерфейса", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Закрыть параметры", exact: true })
    .click();
  await reader.goto(new URL(record.url).pathname);
  const frame = reader.frameLocator(".site-frame");
  await expect(
    frame.getByRole("heading", { name: "Project", exact: true }),
  ).toHaveCSS("color", "rgb(12, 34, 56)");
  await expect
    .poll(() => frame.locator("body").getAttribute("data-inline"))
    .toBe("yes");
  await expect
    .poll(() => frame.locator("body").getAttribute("data-module"))
    .toBe("loaded");
  expect(
    await frame.locator("body").evaluate(() => {
      try {
        return !!parent.document.body;
      } catch {
        return false;
      }
    }),
  ).toBe(false);
  await frame.getByRole("link", { name: "Next", exact: true }).click();
  await expect(
    frame.getByRole("heading", { name: "Second page" }),
  ).toBeVisible();
  await frame.getByRole("link", { name: "Back", exact: true }).click();
  await expect(
    frame.getByRole("heading", { name: "Project", exact: true }),
  ).toBeVisible();
  await expect(
    reader.locator(".text-actions,.upload-link,.expiry-corner"),
  ).toHaveCount(0);
  await reader.close();
});

test("failed media preview error is centered in the viewport", async ({
  page,
}) => {
  await page.route("**/public/Error1", (r) =>
    r.fulfill({
      json: {
        locked: false,
        name: "broken.png",
        media: "image",
        files: [{ name: "broken.png", size: 4, media: "image" }],
        expires: null,
      },
    }),
  );
  await page.route("**/preview/Error1**", (r) =>
    r.fulfill({ body: "bad", contentType: "image/png" }),
  );
  await page.goto("/Error1");
  const icon = page.getByRole("img", { name: "Ошибка", exact: true });
  await expect(icon).toBeVisible();
  const box = await icon.boundingBox(),
    size = page.viewportSize();
  expect(Math.abs(box.x + box.width / 2 - size.width / 2)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - size.height / 2)).toBeLessThan(2);
});

test("unreadable virtual archive folders show a centered error without creating a transfer", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Пароль", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "ЗАГРУЗИТЬ", exact: true }),
  ).toBeVisible();
  let creates = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/transfers")
      creates++;
  });
  await page.evaluate(() => {
    const root = {
      name: "virtual",
      isDirectory: true,
      createReader: () => ({
        readEntries: (ok, fail) =>
          fail(
            new DOMException(
              "Extract this archive before dropping files",
              "NotReadableError",
            ),
          ),
      }),
    };
    const e = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(e, "dataTransfer", {
      value: {
        items: [{ kind: "file", webkitGetAsEntry: () => root }],
        files: [],
      },
    });
    document.querySelector("main").dispatchEvent(e);
  });
  const icon = page.getByRole("img", { name: "Ошибка", exact: true });
  await expect(icon).toBeVisible();
  const box = await icon.boundingBox(),
    size = page.viewportSize();
  expect(Math.abs(box.x + box.width / 2 - size.width / 2)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - size.height / 2)).toBeLessThan(2);
  expect(creates).toBe(0);
  await page
    .getByRole("button", { name: "Закрыть папки", exact: true })
    .click();
});
