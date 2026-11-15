import { test, expect } from "@playwright/test";
async function login(page) {
  await page.goto("/");
  await page.getByLabel("Пароль", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.locator(".owner")).toBeVisible();
}
async function paste(page, text, target = "main") {
  await page.evaluate(
    ({ text, target }) => {
      const data = new DataTransfer();
      data.setData("text/plain", text);
      document.querySelector(target).dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { text, target },
  );
}
async function shareURL(page) {
  await expect(page.locator(".share-ready")).toBeVisible();
  await page
    .getByRole("button", { name: "Копировать ссылку", exact: true })
    .click();
  return page.evaluate(() => navigator.clipboard.readText());
}

test("pasted code keeps original bytes, highlights immediately and supports protected Raw without CSP violations", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    window.violations = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      window.violations.push(e.violatedDirective),
    );
  });
  await login(page);
  await page.getByLabel("Настройки", { exact: true }).click();
  await page
    .getByRole("button", {
      name: "Сгенерировать и скопировать пароль",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Сгенерировать и скопировать пароль",
      exact: true,
    }),
  ).toHaveAttribute("data-active", "true");
  const pin = await page.evaluate(() => navigator.clipboard.readText());
  await page.evaluate(() =>
    navigator.clipboard.writeText("Clipboard paste from an unfocused page"),
  );
  await page.mouse.click(30, 200);
  await page.keyboard.press("Control+V");
  await expect(
    page.getByRole("dialog", { name: "Текстовая передача" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Закрыть редактор", exact: true })
    .click();
  const source =
    '{\r\n\t"message": "Привет 🌍",\r\n\r\n\t"html": "<script>window.injected = true</script>",\r\n\t"long": "' +
    "x".repeat(500) +
    '"\r\n}\r\n';
  await paste(page, source);
  await expect(
    page.getByRole("dialog", { name: "Текстовая передача" }),
  ).toBeVisible();
  await expect(page.locator(".code-editor")).toHaveAttribute(
    "data-language",
    "JSON",
    { timeout: 15000 },
  );
  expect(
    await page
      .locator(".cm-scroller")
      .evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe("16px");
  await expect(page.locator(".cm-lineNumbers")).toBeVisible();
  await page.keyboard.press("Control+Enter");
  await expect(page.locator(".text-dialog")).toHaveCount(0);
  const url = await shareURL(page),
    token = url.split("/").pop();
  expect(token).toMatch(/^[A-Za-z0-9]{6}$/);
  const receiver = await context.newPage();
  await receiver.addInitScript(() => {
    window.violations = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      window.violations.push(e.violatedDirective),
    );
  });
  await receiver.goto(url);
  await expect(
    receiver.getByLabel("Пароль передачи", { exact: true }),
  ).toBeVisible();
  expect((await context.request.get("/raw/" + token)).status()).toBe(401);
  await receiver.getByLabel("Пароль передачи", { exact: true }).fill(pin);
  await receiver.getByRole("button", { name: "Открыть", exact: true }).click();
  await expect(receiver.locator(".code-editor")).toHaveAttribute(
    "data-language",
    "JSON",
    { timeout: 15000 },
  );
  await receiver
    .getByRole("button", { name: "Копировать текст", exact: true })
    .click();
  expect(await receiver.evaluate(() => navigator.clipboard.readText())).toBe(
    source,
  );
  expect(await receiver.evaluate(() => window.injected)).toBeUndefined();
  expect(await receiver.evaluate(() => window.violations)).toEqual([]);
  await expect
    .poll(() =>
      receiver
        .locator(".cm-line span")
        .evaluateAll((nodes) =>
          nodes.some((el) => getComputedStyle(el).color === "rgb(10, 48, 105)"),
        ),
    )
    .toBe(true);
  const line = await receiver.locator(".cm-line").first().boundingBox();
  const number = await receiver
    .locator(".cm-lineNumbers .cm-gutterElement")
    .filter({ hasText: /^1$/ })
    .boundingBox();
  expect(Math.abs(line.y - number.y)).toBeLessThan(2);
  await receiver.screenshot({ path: "work/text-recipient.png" });

  const raw = await context.request.get("/raw/" + token);
  expect(raw.status()).toBe(200);
  expect(raw.headers()["content-type"]).toContain("text/plain");
  expect(await raw.body()).toEqual(Buffer.from(source));
  expect(await page.evaluate(() => window.violations)).toEqual([]);
  expect(await receiver.locator("style[nonce]").count()).toBeGreaterThan(0);
  const nonce = await receiver
    .locator("meta[name=csp-nonce]")
    .getAttribute("content");
  expect(nonce).not.toBe("__CSP_NONCE__");
  const policy = (await context.request.get("/")).headers()[
    "content-security-policy"
  ];
  expect(policy).toContain("'nonce-");
  expect(policy).not.toContain("unsafe-inline");
  const scroller = receiver.locator(".cm-scroller");
  await scroller.evaluate((el) => (el.scrollLeft = 180));
  const left = await scroller.evaluate((el) => el.scrollLeft);
  expect(left).toBeGreaterThan(0);
  await receiver.waitForTimeout(5200);
  expect(await scroller.evaluate((el) => el.scrollLeft)).toBe(left);
  await receiver.close();
});

test("mobile editor opens from menu, preserves pasted indentation inside field and cancels without upload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 650 });
  await login(page);
  let created = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/transfers")
      created++;
  });
  await page.getByLabel("Настройки", { exact: true }).click();
  await page
    .getByRole("button", { name: "Текст или код", exact: true })
    .click();
  await expect(page.locator(".cm-content[contenteditable=true]")).toBeVisible();
  const source =
    '#!/usr/bin/env python3\n\ndef greet():\n\tprint("Привет")\n' +
    "# line\n".repeat(80);
  await paste(page, source, ".cm-content");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.locator(".code-editor")).toHaveAttribute(
    "data-language",
    "Python",
    { timeout: 15000 },
  );
  const header = await page
    .locator(".text-dialog .dialog-header")
    .boundingBox();
  await page.locator(".cm-scroller").evaluate((el) => (el.scrollTop = 2000));
  expect(
    (await page.locator(".text-dialog .dialog-header").boundingBox()).y,
  ).toBe(header.y);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(
    await page
      .locator(".cm-content")
      .evaluate((el) => getComputedStyle(el).whiteSpace),
  ).toBe("pre");
  await page
    .getByRole("button", { name: "Закрыть редактор", exact: true })
    .click();
  await expect(page.locator(".text-dialog")).toHaveCount(0);
  expect(created).toBe(0);
  await expect(
    page.getByRole("button", { name: "ЗАГРУЗИТЬ", exact: true }),
  ).toBeVisible();
});

test("single source files preview, binary text falls back, and appending switches the open link to archive", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page);
  await page.locator("input[type=file]").setInputFiles({
    name: "example.py",
    mimeType: "text/plain",
    buffer: Buffer.from('def hello():\n    print("Hello")\n'),
  });
  const url = await shareURL(page);
  const receiver = await context.newPage();
  await receiver.goto(url);
  await expect(receiver.locator(".code-editor")).toHaveAttribute(
    "data-language",
    "Python",
    { timeout: 15000 },
  );
  const choosing = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await (
    await choosing
  ).setFiles({
    name: "second.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("second"),
  });
  await expect(page.locator(".share-ready")).toBeVisible();
  await expect
    .poll(
      async () => {
        const meta = await (
          await context.request.get("/public/" + url.split("/").pop())
        ).json();
        return meta.files?.length;
      },
      { timeout: 15000 },
    )
    .toBe(2);
  await receiver.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(receiver.locator(".text-preview")).toHaveCount(0);
  await expect(
    receiver.getByRole("link", { name: "СКАЧАТЬ", exact: true }),
  ).toBeVisible();
  expect(
    (await context.request.get("/raw/" + url.split("/").pop())).status(),
  ).toBe(415);
  await page.reload();
  await page.locator("input[type=file]").setInputFiles({
    name: "binary.txt",
    mimeType: "text/plain",
    buffer: Buffer.from([0, 255, 0, 1]),
  });
  const binaryURL = await shareURL(page);
  await receiver.goto(binaryURL);
  await expect(
    receiver.getByRole("link", { name: "СКАЧАТЬ", exact: true }),
  ).toBeVisible();
  await expect(receiver.locator(".has-text")).toHaveCount(0);
  await expect(receiver.locator(".code-editor")).toHaveCount(0);
  await receiver.close();
});

test("oversize text remains in the editor and highlighter startup failure preserves plain editing", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.Worker = class {
      constructor() {
        throw new Error("Unavailable worker");
      }
    };
  });
  await login(page);
  let created = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/transfers")
      created++;
  });
  const source = ("x".repeat(100) + "\n").repeat(
    Math.ceil((5 * 1024 * 1024) / 101) + 1,
  );
  await paste(page, source);
  await expect(page.locator(".cm-content[contenteditable=true]")).toBeVisible();
  await page
    .getByRole("button", { name: "Отправить текст", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText("Максимум 5 МиБ текста");
  await expect(page.locator(".code-editor")).toHaveAttribute(
    "data-language",
    "?",
  );
  expect(created).toBe(0);
  await expect(page.locator(".cm-line").first()).toHaveText("x".repeat(100));
  await page
    .getByRole("button", { name: "Закрыть редактор", exact: true })
    .click();
  await expect(page.locator(".text-dialog")).toHaveCount(0);
});
