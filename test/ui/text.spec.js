import { test, expect } from "@playwright/test";
async function login(page) {
  await page.goto("/");
  await page.getByLabel("Password", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".owner")).toBeVisible();
}
async function openDetails(page) {
  const toggle = page.getByRole("button", {
    name: "Transfer details",
    exact: true,
  });
  if ((await toggle.getAttribute("aria-expanded")) === "false")
    await toggle.click();
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
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
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
  await page.getByLabel("Settings", { exact: true }).click();
  await page
    .getByRole("button", {
      name: "Generate and copy password",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Generate and copy password",
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
    page.getByRole("dialog", { name: "Text transfer" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await expect(page.locator(".text-dialog")).toHaveCount(0);
  const source =
    '{\r\n\t"message": "Привет 🌍",\r\n\r\n\t"html": "<script>window.injected = true</script>",\r\n\t"long": "' +
    "x".repeat(500) +
    '"\r\n}\r\n';
  await paste(page, source);
  await expect(
    page.getByRole("dialog", { name: "Text transfer" }),
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
    receiver.getByLabel("Transfer password", { exact: true }),
  ).toBeVisible();
  expect((await context.request.get("/raw/" + token)).status()).toBe(401);
  await receiver.getByLabel("Transfer password", { exact: true }).fill(pin);
  await receiver.getByRole("button", { name: "Open", exact: true }).click();
  await receiver
    .getByRole("button", { name: "Open preview", exact: true })
    .click();
  await expect(receiver.locator(".code-editor")).toHaveAttribute(
    "data-language",
    "JSON",
    { timeout: 15000 },
  );
  await receiver
    .getByRole("button", { name: "Copy text", exact: true })
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
  expect(
    await receiver
      .locator(".cm-content")
      .evaluate((el) => el.isContentEditable),
  ).toBe(false);
  const viewer = await receiver.locator(".viewer-dialog").boundingBox();
  expect(viewer.x).toBe(0);
  expect(viewer.y).toBe(0);
  expect(viewer.width).toBe(receiver.viewportSize().width);
  expect(viewer.height).toBe(receiver.viewportSize().height);
  await receiver
    .getByRole("button", { name: "Close preview", exact: true })
    .click();
  await expect(
    receiver.getByRole("button", { name: "Open preview", exact: true }),
  ).toBeVisible();
  await expect(receiver.locator(".viewer-dialog")).toHaveCount(0);
  await receiver.waitForTimeout(5200);
  await expect(receiver.locator(".viewer-dialog")).toHaveCount(0);
  await receiver
    .getByRole("button", { name: "Open preview", exact: true })
    .click();
  await expect(receiver.locator(".viewer-dialog")).toBeVisible();
  await receiver.close();
});

test("mobile editor opens beside upload, preserves pasted indentation inside field and cancels without upload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 650 });
  await login(page);
  let created = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/transfers")
      created++;
  });
  const newText = page.getByRole("button", {
    name: "New text transfer",
    exact: true,
  });
  await expect(
    page.locator(".settings").getByRole("button", {
      name: "New text transfer",
      exact: true,
      includeHidden: true,
    }),
  ).toHaveCount(0);
  const upload = await page
    .getByRole("button", { name: "UPLOAD", exact: true })
    .boundingBox();
  const text = await newText.boundingBox();
  expect(text.y + text.height / 2).toBeCloseTo(upload.y + upload.height / 2);
  expect(text.x).toBeGreaterThan(upload.x + upload.width);
  await newText.click();
  await expect(page.locator(".cm-content[contenteditable=true]")).toBeVisible();
  const screen = await page.locator(".text-dialog").boundingBox();
  expect(screen.x).toBe(0);
  expect(screen.y).toBe(0);
  expect(screen.width).toBe(390);
  expect(screen.height).toBe(650);
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
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await expect(page.locator(".text-dialog")).toHaveCount(0);
  expect(created).toBe(0);
  await expect(
    page.getByRole("button", { name: "UPLOAD", exact: true }),
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
  await receiver
    .getByRole("button", { name: "Open preview", exact: true })
    .click();
  await expect(receiver.locator(".code-editor")).toHaveAttribute(
    "data-language",
    "Python",
    { timeout: 15000 },
  );
  const choosing = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add", exact: true }).click();
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
    receiver.getByRole("link", { name: "DOWNLOAD", exact: true }),
  ).toBeVisible();
  expect(
    (await context.request.get("/raw/" + url.split("/").pop())).status(),
  ).toBe(415);
  await receiver.locator(".transfer-details > button").click();
  await receiver
    .getByRole("button", { name: "example.py", exact: true })
    .click();
  await expect(receiver.locator(".viewer-dialog")).toBeVisible();
  await expect(receiver.locator(".code-editor")).toHaveAttribute(
    "data-language",
    "Python",
    { timeout: 15000 },
  );
  await expect(
    receiver
      .locator(".viewer-dialog")
      .getByRole("link", { name: "DOWNLOAD", exact: true }),
  ).toHaveAttribute(
    "href",
    "/public/" + url.split("/").pop() + "/files/0/download",
  );
  await expect(
    receiver.getByRole("link", { name: "Raw", exact: true }),
  ).toHaveAttribute("href", "/raw/" + url.split("/").pop() + "/0");
  await receiver
    .getByRole("button", { name: "Close preview", exact: true })
    .click();
  await expect(receiver.locator(".viewer-dialog")).toHaveCount(0);
  await page.reload();
  await page.locator("input[type=file]").setInputFiles({
    name: "binary.txt",
    mimeType: "text/plain",
    buffer: Buffer.from([0, 255, 0, 1]),
  });
  const binaryURL = await shareURL(page);
  await receiver.goto(binaryURL);
  await receiver
    .getByRole("button", { name: "Open preview", exact: true })
    .click();
  await expect(
    receiver.getByRole("link", { name: "DOWNLOAD", exact: true }),
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
  await page.getByRole("button", { name: "Send text", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Error", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".code-editor")).toHaveAttribute(
    "data-language",
    "?",
  );
  expect(created).toBe(0);
  await expect(page.locator(".cm-line").first()).toHaveText("x".repeat(100));
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await expect(page.locator(".text-dialog")).toHaveCount(0);
});

test("Markdown opens formatted with safe GFM rendering and switches between preview and original source", async ({
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
  const source =
    "# Заметки\n\n**Важно** и ~~старое~~.\n\n- [x] Готово\n- [ ] Осталось\n\n| Имя | Значение |\n| --- | ---: |\n| ключ | 42 |\n\n> Цитата\n\n```javascript\nconst answer = 42;\nconsole.log(answer);\n```\n\n```html\n<img src=x onerror='window.markdownInjected=true'>\n```\n\n<script>window.markdownInjected=true</script>\n\n[опасно](javascript:alert(1))\n\n![Внешнее изображение](https://images.example.com/tracker.png)\n";
  await page.locator("input[type=file]").setInputFiles({
    name: "README.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(source),
  });
  const url = await shareURL(page),
    token = url.split("/").pop();
  await page.goto(url);
  await page.getByRole("button", { name: "Open preview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Заметки", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".markdown-preview table")).toBeVisible();
  await expect(
    page.locator(".markdown-preview input[type=checkbox]"),
  ).toHaveCount(2);
  await expect(
    page.locator(".markdown-preview input[type=checkbox]").first(),
  ).toBeChecked();
  await expect(
    page.locator(".markdown-preview input[type=checkbox]").first(),
  ).toBeDisabled();
  await expect(
    page.locator(".markdown-preview pre code").first(),
  ).toContainText("const answer = 42;");
  await expect
    .poll(() => page.locator(".markdown-preview .hljs-keyword").count())
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => window.markdownInjected)).toBeUndefined();
  await expect(
    page.locator(".markdown-preview script,.markdown-preview img"),
  ).toHaveCount(0);
  expect(
    await page
      .getByRole("link", { name: "опасно", exact: true })
      .getAttribute("href"),
  ).not.toMatch(/^javascript:/i);
  expect(await page.evaluate(() => window.violations)).toEqual([]);
  await page.getByRole("button", { name: "Copy text", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Copy text", exact: true }),
  ).toHaveAttribute("title", "Copied");
  expect(
    (await page.evaluate(() => navigator.clipboard.readText())).replace(
      /\r\n/g,
      "\n",
    ),
  ).toBe(source);
  const raw = await context.request.get("/raw/" + token);
  expect(await raw.body()).toEqual(Buffer.from(source));
  const download = await context.request.get("/public/" + token + "/download");
  expect(await download.body()).toEqual(Buffer.from(source));
  await page.getByRole("button", { name: "Show source", exact: true }).click();
  await expect(page.locator(".code-editor")).toHaveAttribute(
    "data-language",
    "Markdown",
    { timeout: 15000 },
  );
  await expect(page.locator(".markdown-preview")).toHaveCount(0);
  await page.waitForTimeout(5200);
  await expect(page.locator(".code-editor")).toBeVisible();
  await page.getByRole("button", { name: "Show preview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Заметки", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "work/markdown-preview-mobile.png" });
});

test("owner reopens uploaded text full screen, cancels or saves to the same link and sees file details", async ({
  page,
  context,
}) => {
  const currentURL = () =>
    page.evaluate(
      async () => (await (await fetch("/api/transfers")).json())[0].url,
    );
  await login(page);
  await page.locator("input[type=file]").setInputFiles({
    name: "edit.py",
    mimeType: "text/plain",
    buffer: Buffer.from("print('old')\n"),
  });
  await expect(page.locator(".share-ready")).toBeVisible();
  const url = await currentURL();
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit text" });
  await expect(dialog.locator(".cm-content")).toHaveText("print('old')");
  const viewport = page.viewportSize();
  expect(await dialog.boundingBox()).toMatchObject({
    x: 0,
    y: 0,
    width: viewport.width,
    height: viewport.height,
  });
  await dialog.locator(".cm-content").fill("print('cancelled')");
  await dialog
    .getByRole("button", { name: "Close editor", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  await expect(dialog.locator(".cm-content")).toHaveText("print('old')");
  await dialog.locator(".cm-content").fill("print('new')");
  await dialog.getByRole("button", { name: "Save text", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".share-ready")).toBeVisible();
  expect(await currentURL()).toBe(url);
  await openDetails(page);
  await page
    .getByRole("button", { name: "Preview edit.py", exact: true })
    .click();
  await expect(page.locator(".viewer-dialog .cm-content")).toHaveText(
    "print('new')",
  );
  await page
    .getByRole("button", { name: "Close preview", exact: true })
    .click();
  const recipient = await context.newPage();
  await recipient.goto(url);
  await recipient
    .getByRole("button", { name: "Open preview", exact: true })
    .click();
  await expect(
    recipient.getByRole("button", { name: "Edit text", exact: true }),
  ).toHaveCount(0);
  await expect(recipient.locator(".viewer-dialog .cm-content")).toHaveText(
    "print('new')",
  );
  expect(
    await recipient
      .locator(".cm-content")
      .evaluate((el) => el.isContentEditable),
  ).toBe(false);
  await recipient.close();
});

for (const [language, source] of [
  [
    "Markdown",
    "# Heading\n\n## Section\n\n**Strong** and [link](https://example.com).\n\n- one\n- two\n\n> quote\n",
  ],
  [
    "Python",
    "#!/usr/bin/env python3\nimport json\n\ndef main():\n    print(json.dumps({'ok': True}))\n\nif __name__ == '__main__':\n    main()\n",
  ],
  ["JSON", '{"name":"example","enabled":true,"items":[1,2,3]}'],
  ["?", "Just some ordinary words for a personal note."],
]) {
  test(`new ${language} text is saved with .txt by default`, async ({
    page,
  }) => {
    await login(page);
    await paste(page, source);
    await expect(page.locator(".code-editor")).toHaveAttribute(
      "data-language",
      language,
      { timeout: 15000 },
    );
    await page.getByRole("button", { name: "Send text", exact: true }).click();
    await expect(page.locator(".share-ready")).toBeVisible();
    const transfer = await page.evaluate(
      async () => (await (await fetch("/api/transfers")).json())[0],
    );
    expect(transfer.files[0].name).toMatch(/^text-\d{8}-\d{9}\.txt$/);
  });
}

test("text can be added repeatedly and clipboard destinations preserve the current link", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page);
  const transfers = () =>
    page.evaluate(async () => (await fetch("/api/transfers")).json());
  const transferById = async (id) =>
    (await transfers()).find((item) => item.id === id);
  const editor = page.getByRole("dialog", { name: "Text transfer" });
  const send = async () => {
    await editor
      .getByRole("button", { name: "Send text", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    await expect(page.locator(".share-ready")).toBeVisible();
  };
  await page.getByRole("button", { name: "New text transfer" }).click();
  await editor.locator(".cm-content").fill("First note");
  await send();
  const [original] = await transfers();

  await page
    .getByRole("button", { name: "Add text file", exact: true })
    .click();
  const script = "Write-Output 'hello'";
  await editor.locator(".cm-content").fill(script);
  await send();
  await expect
    .poll(async () => (await transferById(original.id)).files.length)
    .toBe(2);
  await expect(page.locator(".share-ready")).toBeVisible();
  await openDetails(page);
  const filename = page.getByRole("textbox", {
    name: "Filename 2",
    exact: true,
  });
  await expect(filename).toHaveText(/^text-\d{8}-\d{9}\.txt$/);
  await filename.click();
  await filename.fill("example.ps1");
  await filename.press("Enter");
  await expect
    .poll(async () => (await transferById(original.id)).files[1].name)
    .toBe("example.ps1");
  await expect(filename).toHaveAttribute("aria-readonly", "true");
  await expect(filename).toHaveAttribute("aria-disabled", "false");
  await expect(page.locator(".share-ready")).toBeVisible();
  const appended = await transferById(original.id);
  expect(appended.url).toBe(original.url);
  expect(appended.files.map((file) => file.name)).toEqual([
    original.files[0].name,
    "example.ps1",
  ]);
  const response = await context.request.get(
    `/api/transfers/${original.id}/text/1`,
  );
  expect(await response.text()).toBe(script);

  const choice = page.getByRole("dialog", { name: "Where to paste" });
  const newTransfer = choice.getByRole("button", {
    name: "New transfer",
    exact: true,
  });
  const addToCurrent = choice.getByRole("button", {
    name: "Add to current transfer",
  });
  await page.evaluate(() => navigator.clipboard.writeText("Third note"));
  await page.mouse.click(30, 200);
  await page.keyboard.press("Control+V");
  await expect(choice).toBeVisible();
  const top = await newTransfer.boundingBox();
  const bottom = await addToCurrent.boundingBox();
  expect(top.y).toBe(0);
  expect(Math.abs(bottom.y - page.viewportSize().height / 2)).toBeLessThan(1);
  await addToCurrent.click();
  await expect(editor.locator(".cm-content")).toHaveText("Third note");
  await send();
  await expect
    .poll(async () => (await transferById(original.id)).files.length)
    .toBe(3);
  await expect(page.locator(".share-ready")).toBeVisible();

  await paste(page, "Cancelled note");
  await expect(choice).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(choice).toHaveCount(0);
  await expect(editor).toHaveCount(0);
  expect((await transferById(original.id)).files).toHaveLength(3);

  await paste(page, "Separate note");
  await newTransfer.focus();
  await page.keyboard.press("Enter");
  await expect(editor.locator(".cm-content")).toHaveText("Separate note");
  await send();
  const [separate, preserved] = await transfers();
  expect(separate.id).not.toBe(original.id);
  expect(separate.files).toHaveLength(1);
  expect(preserved.id).toBe(original.id);
  expect(preserved.url).toBe(original.url);
  expect(preserved.files).toHaveLength(3);

  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(["Write-Output 42"], "copied.ps1"));
    document.querySelector("main").dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(choice).toBeVisible();
  await addToCurrent.click();
  await expect
    .poll(async () => (await transferById(separate.id)).files[1]?.name)
    .toBe("copied.ps1");
  await expect(page.locator(".share-ready")).toBeVisible();
});

for (const width of [390, 1280]) {
  test(`each text file can be edited in a multi-file transfer at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.locator('input[type="file"]').setInputFiles([
      {
        name: "first.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("first original"),
      },
      {
        name: "second.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("second original"),
      },
      {
        name: "image.png",
        mimeType: "image/png",
        buffer: Buffer.from([0, 1, 255]),
      },
    ]);
    await expect(page.locator(".share-ready")).toBeVisible();
    await expect(
      page
        .locator(".share-ready")
        .getByRole("button", { name: "Edit text", exact: true }),
    ).toHaveCount(0);
    await openDetails(page);
    await expect(
      page.getByRole("button", { name: "Edit text: image.png", exact: true }),
    ).toHaveCount(0);
    for (const filename of ["first.txt", "second.txt"]) {
      const details = page.getByRole("button", {
        name: "Transfer details",
        exact: true,
      });
      if ((await details.getAttribute("aria-expanded")) === "false")
        await details.click();
      const row = page
        .locator(".files li")
        .filter({ has: page.getByText(filename, { exact: true }) });
      const more = row.getByRole("button", { name: "Actions", exact: true });
      if (await more.isVisible()) await more.click();
      await row
        .getByRole("button", { name: "Edit text: " + filename, exact: true })
        .click();
      const editor = page.getByRole("dialog", {
        name: "Edit text",
        exact: true,
      });
      await expect(editor.locator(".cm-content")).toHaveText(
        filename === "first.txt" ? "first original" : "second original",
      );
      await editor.locator(".cm-content").fill("updated " + filename);
      await editor
        .getByRole("button", { name: "Save text", exact: true })
        .click();
      await expect(editor).toHaveCount(0);
      await expect
        .poll(async () => {
          const transfers = await (
            await context.request.get("/api/transfers")
          ).json();
          const transfer = transfers.find((t) =>
            t.files.some((f) => f.name === "first.txt"),
          );
          const index = transfer.files.findIndex((f) => f.name === filename);
          return (
            await context.request.get(
              `/api/transfers/${transfer.id}/text/${index}`,
            )
          ).text();
        })
        .toBe("updated " + filename);
      await expect(page.locator(".share-ready")).toBeVisible();
    }
    const details = page.getByRole("button", {
      name: "Transfer details",
      exact: true,
    });
    if ((await details.getAttribute("aria-expanded")) === "false")
      await details.click();
    const second = page
      .locator(".files li")
      .filter({ has: page.getByText("second.txt", { exact: true }) });
    const more = second.getByRole("button", { name: "Actions", exact: true });
    if (await more.isVisible()) await more.click();
    await second
      .getByRole("button", { name: "Preview second.txt", exact: true })
      .click();
    const preview = page.getByRole("dialog", {
      name: "Text preview",
      exact: true,
    });
    await expect(
      preview.getByRole("button", { name: "Edit text", exact: true }),
    ).toHaveCount(1);
    await preview
      .getByRole("button", { name: "Edit text", exact: true })
      .click();
    const editor = page.getByRole("dialog", { name: "Edit text", exact: true });
    await expect(editor.locator(".cm-content")).toHaveText(
      "updated second.txt",
    );
    await expect(editor.getByText("second.txt", { exact: true })).toBeVisible();
    await editor
      .getByRole("button", { name: "Close editor", exact: true })
      .click();
    const transfers = await (
      await context.request.get("/api/transfers")
    ).json();
    const transfer = transfers.find((t) =>
      t.files.some((f) => f.name === "first.txt"),
    );
    expect(transfer.files.map((f) => f.name)).toEqual([
      "first.txt",
      "second.txt",
      "image.png",
    ]);
    for (const index of [0, 1]) {
      const response = await context.request.get(
        `/api/transfers/${transfer.id}/text/${index}`,
      );
      expect(await response.text()).toBe(
        "updated " + transfer.files[index].name,
      );
    }
  });
}

for (const width of [390, 1280]) {
  test(`line numbers follow empty lines while typing at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await paste(page, "first\n\nthird\n\n");
    const editor = page.locator(".text-dialog .code-editor");
    const checkAlignment = async () => {
      await expect
        .poll(async () =>
          editor.evaluate((host) => {
            const lines = [...host.querySelectorAll(".cm-line")];
            const numbers = [
              ...host.querySelectorAll(".cm-lineNumbers .cm-gutterElement"),
            ].filter((el) => el.style.visibility !== "hidden");
            return (
              lines.length === numbers.length &&
              lines.every((line, index) => {
                const a = line.getBoundingClientRect(),
                  b = numbers[index].getBoundingClientRect();
                return (
                  Math.abs(a.y - b.y) < 1 && Math.abs(a.height - b.height) < 1
                );
              })
            );
          }),
        )
        .toBe(true);
    };
    await checkAlignment();
    await editor.locator(".cm-content").press("Control+Home");
    await editor.locator(".cm-content").press("ArrowDown");
    await page.keyboard.type("filled");
    await page.keyboard.press("Enter");
    await checkAlignment();
    await expect(editor.locator(".cm-activeLine")).toHaveCount(1);
    await expect(editor.locator(".cm-line-stripe")).toHaveCount(3);
  });
}
