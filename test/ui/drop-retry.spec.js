import { test, expect } from "@playwright/test";
import { unzipSync } from "fflate";
async function login(page) {
  await page.goto("/");
  await page.getByLabel("Пароль", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.locator(".owner")).toBeVisible();
}
async function transfer(page) {
  return page.evaluate(
    async () => (await (await fetch("/api/transfers")).json())[0],
  );
}
async function drop(page, name, bottom) {
  await page.evaluate(
    ({ name, bottom }) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([name], name));
      const clientY = bottom ? innerHeight * 0.75 : innerHeight * 0.25;
      const root = document.querySelector("main");
      root.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientY,
          clientX: 100,
        }),
      );
    },
    { name, bottom },
  );
  await expect(page.locator(".drop-zone.active")).toHaveAttribute(
    "aria-label",
    bottom ? "Добавить к текущей передаче" : "Новая передача",
  );
  await page.evaluate(
    ({ name, bottom }) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([name], name));
      document.querySelector("main").dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientY: innerHeight * (bottom ? 0.75 : 0.25),
          clientX: 100,
        }),
      );
    },
    { name, bottom },
  );
}
test("drop zones append below and create above; closing current keeps its files", async ({
  page,
}) => {
  await login(page);
  await page.locator("input[type=file]").setInputFiles({
    name: "first.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("first"),
  });
  await expect(
    page.getByRole("button", {
      name: "Добавить",
      exact: true,
    }),
  ).toBeVisible();
  const first = await transfer(page);
  await drop(page, "second.txt", true);
  await expect.poll(async () => (await transfer(page)).files.length).toBe(2);
  await expect(
    page.getByRole("button", {
      name: "Добавить",
      exact: true,
    }),
  ).toBeVisible();
  expect((await transfer(page)).url).toBe(first.url);
  const archive = await page.request.get(
    "/public" + new URL(first.url).pathname.replace(/\/$/, "") + "/download",
  );
  const contents = unzipSync(await archive.body());
  expect(Object.keys(contents).sort()).toEqual(["first.txt", "second.txt"]);
  await drop(page, "third.txt", false);
  await expect.poll(async () => (await transfer(page)).id).not.toBe(first.id);
  await expect(
    page.getByRole("button", { name: "Закрыть текущую передачу" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть текущую передачу" }).click();
  await expect(
    page.getByRole("button", { name: "ЗАГРУЗИТЬ", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      async () => (await (await fetch("/api/transfers")).json()).length,
    ),
  ).toBe(2);
});
test("connection failures offer a centered red reload button without an error sentence", async ({
  page,
}) => {
  let failed = true;
  await page.route("**/public/Retry1", (r) =>
    failed
      ? r.abort()
      : r.fulfill({
          json: {
            locked: false,
            files: [{ name: "ok.bin", size: 1 }],
            name: "ok.bin",
            expires: null,
            preview: false,
          },
        }),
  );
  await page.goto("/Retry1");
  const retry = page.getByRole("button", { name: "Перезагрузить страницу" });
  await expect(retry).toBeVisible();
  expect((await page.locator("body").innerText()).trim()).toBe("");
  expect(await retry.evaluate((el) => getComputedStyle(el).color)).toBe(
    "rgb(211, 52, 52)",
  );
  const box = await retry.boundingBox();
  const size = page.viewportSize();
  expect(Math.abs(box.x + box.width / 2 - size.width / 2)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - size.height / 2)).toBeLessThan(2);
  failed = false;
  await retry.click();
  await expect(
    page.getByRole("link", { name: "СКАЧАТЬ", exact: true }),
  ).toBeVisible();
});

test("a brief proxy 404 during startup recovers without showing an error or losing the login form", async ({
  page,
}) => {
  let calls = 0;
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.route("**/api/session", (route) =>
    ++calls < 3
      ? route.fulfill({
          status: 404,
          contentType: "text/plain",
          body: "404 page not found",
        })
      : route.continue(),
  );
  await page.goto("/");
  await expect(page.getByLabel("Пароль", { exact: true })).toBeVisible();
  expect(calls).toBe(3);
  expect(failures).toEqual([]);
  await expect(
    page.getByRole("button", { name: "Перезагрузить страницу", exact: true }),
  ).toHaveCount(0);
});
test("desktop archive and menu feedback animate even with system motion disabled", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/transfers", (r) =>
    r.fulfill({
      json: [
        {
          id: "pending",
          state: "archiving",
          files: [],
          created: Date.now(),
          size: 0,
        },
      ],
    }),
  );
  await login(page);
  await page.getByLabel("Настройки", { exact: true }).click();
  expect(
    await page
      .locator(".settings .inline-details-body")
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).not.toBe("0s");
  await page.getByRole("button", { name: "История", exact: true }).click();
  expect(
    await page
      .locator(".history-state svg")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).not.toBe("none");
});
