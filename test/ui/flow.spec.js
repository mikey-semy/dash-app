import { test, expect } from "@playwright/test";
async function confirmDelete(button) {
  await button.click();
  const confirmation = button.page().locator('button[data-confirming="true"]');
  await expect(confirmation).toHaveCount(1);
  await confirmation.click();
}
async function login(page) {
  await page.goto("/");
  await page.getByLabel("Password", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "UPLOAD",
    }),
  ).toBeVisible();
}
async function checkAction(page, role, text) {
  for (const width of [320, 390, 768, 1280, 2560]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => document.fonts.ready);
    const action = page.getByRole(role, { name: text, exact: true });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const box = await action.boundingBox();
    expect(await action.evaluate((el) => getComputedStyle(el).fontSize)).toBe(
      "16px",
    );
    expect(box.width).toBeLessThan(width);
    expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(2);
    expect(Math.abs(box.y + box.height / 2 - (844 / 2 - 48))).toBeLessThan(2);
    expect(await action.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe(
      "nowrap",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
}
test("empty page, settings, upload, private recipient, ZIP, history and deletion", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.getByLabel("Password", { exact: true }).fill("000000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("img", { name: "Incorrect password", exact: true }),
  ).toBeVisible();
  await login(page);
  expect((await page.locator("body").innerText()).trim()).toBe("");
  await page.screenshot({ path: "work/ui-desktop.png", fullPage: true });
  await page.getByLabel("Settings", { exact: true }).click();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
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
  expect(pin).toMatch(/^\d{6}$/);
  await page.getByLabel("Settings", { exact: true }).click();
  await page.locator("input[type=file]").setInputFiles([
    {
      name: "привет.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello"),
    },
    { name: "empty", mimeType: "text/plain", buffer: Buffer.alloc(0) },
  ]);
  await expect(
    page.getByRole("button", { name: "Add", exact: true }),
  ).toBeVisible();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  await expect(page.locator(".center .share a")).toHaveCount(0);
  await expect(page.locator(".expiry-corner")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Deletion:");
  expect(await page.locator("body").innerText()).not.toContain(url);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const box = await page.locator(".center .share-controls").boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(width - 12);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: "work/ui-share.png", fullPage: true });
  await page.getByRole("button", { name: "QR code", exact: true }).click();
  await expect(page.getByRole("img", { name: "Link QR code" })).toBeVisible();
  const context = await browser.newContext(),
    recipient = await context.newPage();
  await recipient.goto(url);
  await expect(recipient.getByText("привет.txt", { exact: true })).toHaveCount(
    0,
  );
  await recipient.getByLabel("Transfer password").fill(pin);
  await recipient.getByRole("button", { name: "Open" }).click();
  await expect(
    recipient.getByRole("link", { name: "DOWNLOAD", exact: true }),
  ).toBeVisible();
  await expect(recipient.getByText("привет.txt", { exact: true })).toBeHidden();
  await expect(
    recipient.getByRole("link", { name: "Close transfer" }),
  ).toHaveAttribute("href", "/");
  await checkAction(recipient, "link", "DOWNLOAD");
  await recipient.setViewportSize({ width: 1280, height: 720 });
  await recipient.screenshot({
    path: "work/ui-recipient-collapsed.png",
    fullPage: true,
  });
  await recipient.getByLabel("Transfer details", { exact: true }).click();
  await expect(
    recipient.getByText("привет.txt", { exact: true }),
  ).toBeVisible();
  await recipient.screenshot({ path: "work/ui-recipient.png", fullPage: true });
  const download = recipient.waitForEvent("download");
  await recipient.getByRole("link", { name: "DOWNLOAD", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^files-\d{8}-\d{9}\.zip$/,
  );
  await page.getByLabel("Settings", { exact: true }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "History", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveTitle("History");
  const item = page.locator(".history-item").first();
  await expect(item.locator(".history-information")).toBeHidden();
  await item.locator(".history-toggle").click();
  await expect(item.locator(".history-information")).toBeVisible();
  await item.getByRole("button", { name: "QR code", exact: true }).click();
  await expect(page.getByRole("img", { name: "Link QR code" })).toBeVisible();
  await expect(item.locator(".share-controls button")).toHaveCount(6);
  await confirmDelete(
    item.getByRole("button", { name: "Delete", exact: true }),
  );
  await recipient.reload();
  await expect(
    recipient.getByRole("img", { name: "Transfer unavailable" }),
  ).toBeVisible();
  await expect(recipient.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Close history" }).click();
  await context.close();
});
test("mobile empty page, monochrome and no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await checkAction(page, "button", "UPLOAD");
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.locator("body").innerText()).trim()).toBe("");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgba(0, 0, 0, 0)");
  await page.screenshot({ path: "work/ui-mobile.png", fullPage: true });
  await page.getByLabel("Settings", { exact: true }).click();
  await expect(page.getByRole("button", { name: /^Retention:/ })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("browser multipart pause/resume and automatic retry in the open page", async ({
  page,
}) => {
  await login(page);
  let intercepted = 0,
    release;
  const gate = new Promise((resolve) => (release = resolve));
  await page.route("**/fake/**", async (route) => {
    intercepted++;
    if (intercepted === 1) {
      await gate;
      await route.abort().catch(() => {});
    } else if (intercepted === 2)
      await route.fulfill({ status: 503, body: "retry" });
    else await route.continue();
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "multipart.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(9 * 1024 * 1024, 7),
  });
  await expect.poll(() => intercepted).toBeGreaterThanOrEqual(2);
  await expect(page.locator(".upload-actions button")).toHaveCount(2);
  expect((await page.locator(".upload-actions").innerText()).trim()).toBe("");
  await expect(page.locator(".upload-times")).not.toContainText("Elapsed");
  await expect(page.locator(".upload-times")).not.toContainText("remaining");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  release();
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add", exact: true }),
  ).toBeVisible();
  expect(intercepted).toBeGreaterThanOrEqual(4);
});

test("icon controls generate and copy six-digit password; manifest and icons are available", async ({
  page,
}) => {
  await login(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByLabel("Settings", { exact: true }).click();
  const generate = page.getByRole("button", {
    name: "Generate and copy password",
    exact: true,
  });
  await generate.click();
  await expect(
    page.getByRole("button", {
      name: "Generate and copy password",
      exact: true,
    }),
  ).toHaveAttribute("data-active", "true");
  const pin = await page.evaluate(() => navigator.clipboard.readText());
  expect(pin).toMatch(/^\d{6}$/);
  await expect(generate).toHaveAttribute("data-active", "true");
  await expect(page.locator(".settings-toolbar>button")).toHaveCount(4);
  await expect(
    page.locator(".settings-toolbar input,.settings-toolbar select"),
  ).toHaveCount(0);
  const duration = page.getByRole("button", { name: /^Retention:/ });
  for (const [index, name] of [
    "24 hours",
    "3 days",
    "7 days",
    "Forever",
    "One-time",
    "1 hour",
    "6 hours",
    "24 hours",
  ].entries()) {
    await expect(duration).toHaveAttribute("aria-label", "Retention: " + name);
    if (index < 7) await duration.click();
  }
  const gear = await page.getByLabel("Settings", { exact: true }).boundingBox(),
    menu = await page.locator(".settings-toolbar").boundingBox();
  expect(menu.x + menu.width).toBeLessThan(gear.x);
  expect(
    Math.abs(menu.y + menu.height / 2 - gear.y - gear.height / 2),
  ).toBeLessThan(2);
  expect(
    await page
      .locator(".settings-toolbar")
      .evaluate((el) => getComputedStyle(el).borderWidth),
  ).toBe("0px");
  await page.screenshot({ path: "work/ui-settings.png", fullPage: true });
  const m = await page.request.get("/manifest.webmanifest");
  expect(m.ok()).toBe(true);
  const manifest = await m.json();
  expect(manifest.start_url).toBe("/");
  for (const i of manifest.icons)
    expect((await page.request.get(i.src)).ok()).toBe(true);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/icon.svg",
  );
});

test("password reveal and submit are inside the input; history header stays fixed while body scrolls", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Sign in");
  await page.getByLabel("Password", { exact: true }).fill("123456");
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page
    .getByRole("button", { name: "Hide password", exact: true })
    .click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  await expect(
    page.locator(".login-field button[type=submit]"),
  ).toHaveAttribute("aria-label", "Sign in");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveTitle("Upload");
  await page.route("**/api/transfers", (route) =>
    route.fulfill({
      json: Array.from({ length: 35 }, (_, i) => ({
        id: "scroll-" + i,
        state: "ready",
        created: Date.now() - i * 1000,
        expires: Date.now() + 3600000,
        ttl: 3600,
        files: [{ name: "test.txt", size: 5 }],
        size: 5,
        url: null,
        error: null,
      })),
    }),
  );
  await page.reload();
  await page.getByLabel("Settings", { exact: true }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  const header = page.locator(".dialog-header"),
    body = page.locator(".dialog-body");
  const before = await header.boundingBox();
  expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  expect(await body.evaluate((el) => getComputedStyle(el).scrollbarWidth)).toBe(
    "thin",
  );
  await body.evaluate((el) => (el.scrollTop = el.scrollHeight));
  expect((await header.boundingBox()).y).toBe(before.y);
  await expect(header).toBeVisible();
  await page.screenshot({ path: "work/ui-history.png", fullPage: true });
  await page.getByRole("button", { name: "Close history" }).click();
  await expect(page).toHaveTitle("Upload");
});

test("history expansion preserves modal and clicked header positions throughout animation; disabled copy is not busy", async ({
  page,
}) => {
  await login(page);
  await page.getByLabel("Settings", { exact: true }).click();
  await expect(
    page.locator(".settings-toolbar input,.settings-toolbar select"),
  ).toHaveCount(0);
  await page.getByLabel("Settings", { exact: true }).click();
  await page.route("**/api/transfers", (route) =>
    route.fulfill({
      json: Array.from({ length: 3 }, (_, i) => ({
        id: "stable-" + i,
        state: "ready",
        created: Date.now() - i * 1000,
        expires: Date.now() + 3600000,
        ttl: 3600,
        files: Array.from({ length: 30 }, (_, j) => ({
          name: "file-" + j + ".txt",
          size: 5,
        })),
        size: 150,
        url: null,
        error: null,
      })),
    }),
  );
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.reload();
    await page.getByLabel("Settings", { exact: true }).click();
    await page.getByRole("button", { name: "History", exact: true }).click();
    const dialog = page.getByRole("region", { name: "History", exact: true }),
      toggle = page.locator(".history-toggle").first(),
      before = await dialog.boundingBox(),
      header = await toggle.boundingBox();
    expect(
      await page
        .locator(".dialog-body")
        .evaluate((el) => getComputedStyle(el).overflowY),
    ).toBe("scroll");
    for (const expanded of [true, false]) {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", String(expanded));
      const positions = await page.evaluate(async () => {
        const samples = [];
        for (let i = 0; i < 20; i++) {
          await new Promise(requestAnimationFrame);
          const d = document
              .querySelector(".history-dialog")
              .getBoundingClientRect(),
            h = document
              .querySelector(".history-toggle")
              .getBoundingClientRect();
          samples.push({ y: d.y, height: d.height, headerY: h.y });
        }
        return samples;
      });
      for (const p of positions) {
        expect(Math.abs(p.y - before.y)).toBeLessThan(1);
        expect(Math.abs(p.height - before.height)).toBeLessThan(1);
        expect(
          Math.abs(p.headerY - header.y),
          JSON.stringify({ width, expanded, before, header, p }),
        ).toBeLessThan(1);
      }
    }
    const rapid = await page.evaluate(async () => {
      const button = document.querySelector(".history-toggle"),
        panel = document.querySelector(".history-item .disclosure");
      button.click();
      await new Promise((r) => setTimeout(r, 70));
      const partial = panel.getBoundingClientRect().height;
      button.click();
      await new Promise(requestAnimationFrame);
      const reversed = panel.getBoundingClientRect().height;
      button.click();
      await new Promise((r) => setTimeout(r, 300));
      const opened = panel.getBoundingClientRect().height;
      button.click();
      await new Promise((r) => setTimeout(r, 300));
      return {
        partial,
        reversed,
        opened,
        closed: panel.getBoundingClientRect().height,
      };
    });
    expect(rapid.partial).toBeGreaterThan(0);
    expect(rapid.reversed).toBeLessThan(rapid.opened);
    expect(rapid.closed).toBeLessThan(1);
    await page.getByRole("button", { name: "Close history" }).click();
    await expect(dialog).toBeHidden();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByLabel("Settings", { exact: true }).click();
  expect(
    await page
      .locator(".settings .inline-details-body")
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).not.toBe("0s");
});

test("password is enabled only after successful copy", async ({ page }) => {
  await login(page);
  await page.getByLabel("Settings", { exact: true }).click();
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error("blocked"));
  });
  const button = page.getByRole("button", {
    name: "Generate and copy password",
    exact: true,
  });
  await button.click();
  await expect(button).toHaveAttribute("data-active", "false");
  await expect(button).toHaveClass(/edit-error/);
  await expect(button).not.toHaveAttribute("title", /Could not/);
});

test("double-click removes password without a delayed reactivation or changing the clipboard", async ({
  page,
}) => {
  await login(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByLabel("Settings", { exact: true }).click();
  const button = page.getByRole("button", {
    name: "Generate and copy password",
    exact: true,
  });
  await button.click();
  await expect(button).toHaveAttribute("data-active", "true");
  const before = await page.evaluate(() => navigator.clipboard.readText());
  await button.dblclick();
  await expect(button).toHaveAttribute("data-active", "false");
  await expect(button).toHaveAttribute("title", "Password removed");
  await page.waitForTimeout(600);
  await expect(button).toHaveAttribute("data-active", "false");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    before,
  );
  let password;
  await page.route("**/api/transfers", (route) => {
    if (route.request().method() === "POST") {
      password = route.request().postDataJSON().password;
      return route.fulfill({ status: 409, json: { error: "test stop" } });
    }
    return route.continue();
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "test.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("test"),
  });
  await expect.poll(() => password).toBe("");
});

test("infinite retention persists locally; password does not persist", async ({
  page,
}) => {
  await login(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByLabel("Settings", { exact: true }).click();
  const ttl = page.getByRole("button", { name: /^Retention:/ });
  for (let i = 0; i < 3; i++) await ttl.click();
  await expect(ttl).toHaveAttribute("aria-label", "Retention: Forever");
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
  await page.reload();
  await page.getByLabel("Settings", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Retention:/ }),
  ).toHaveAttribute("aria-label", "Retention: Forever");
  await expect(
    page.getByRole("button", {
      name: "Generate and copy password",
      exact: true,
    }),
  ).toHaveAttribute("data-active", "false");
});

test("history and ready-view plus append to the same transfer and preserve its link", async ({
  page,
}) => {
  await login(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator("input[type=file]").setInputFiles({
    name: "base.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("base"),
  });
  await expect(
    page.getByRole("button", { name: "Add", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  const original = await page.evaluate(() => navigator.clipboard.readText());
  await page.getByLabel("Settings", { exact: true }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  const first = page.locator(".history-item").first();
  await expect(first.locator(".share-controls button")).toHaveCount(6);
  const choosing = page.waitForEvent("filechooser");
  await first
    .getByRole("button", { name: "Add files to transfer", exact: true })
    .click();
  await (
    await choosing
  ).setFiles({
    name: "extra.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("extra"),
  });
  await expect(
    page.getByRole("region", { name: "History", exact: true }),
  ).toBeHidden();
  const count = async () => {
    const list = await (await page.request.get("/api/transfers")).json();
    return list.find((t) => t.url === original)?.files.length;
  };
  await expect.poll(count, { timeout: 15000 }).toBe(2);
  await expect(
    page.getByRole("button", { name: "Add", exact: true }),
  ).toBeVisible();
  const again = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await (
    await again
  ).setFiles({
    name: "third.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("third"),
  });
  await expect.poll(count, { timeout: 15000 }).toBe(3);
  await expect(
    page.getByRole("button", { name: "Add", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    original,
  );
});

test("selected history files can be removed while preserving an empty reusable link", async ({
  page,
}) => {
  await login(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator("input[type=file]").setInputFiles([
    { name: "keep.txt", mimeType: "text/plain", buffer: Buffer.from("keep") },
    {
      name: "remove.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("remove"),
    },
  ]);
  await expect(
    page.getByRole("button", { name: "Add", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  const record = async () => {
    const list = await (await page.request.get("/api/transfers")).json();
    return list.find((t) => t.url === url);
  };
  const open = async () => {
    await page.getByLabel("Settings", { exact: true }).click();
    await page.getByRole("button", { name: "History", exact: true }).click();
    const first = page.locator(".history-item").first();
    await first.locator(".history-toggle").click();
    return first;
  };
  let row = await open();
  await row.getByLabel("Select remove.txt", { exact: true }).check();
  await confirmDelete(
    row.getByRole("button", { name: "Delete selected files", exact: true }),
  );
  await expect
    .poll(async () => (await record())?.files.length, { timeout: 15000 })
    .toBe(1);
  await expect(
    row.getByLabel("Select keep.txt", { exact: true }),
  ).toBeVisible();
  await row.getByLabel("Select all files", { exact: true }).check();
  await confirmDelete(
    row.getByRole("button", { name: "Delete selected files", exact: true }),
  );
  await expect.poll(async () => (await record())?.state).toBe("empty");
  expect((await record()).files).toHaveLength(0);
  const choice = page.waitForEvent("filechooser");
  await row
    .getByRole("button", { name: "Add files to transfer", exact: true })
    .click();
  await (
    await choice
  ).setFiles({
    name: "replacement.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("replacement"),
  });
  await expect
    .poll(async () => (await record())?.files[0]?.name, { timeout: 15000 })
    .toBe("replacement.txt");
  await expect(
    page.getByRole("button", { name: "Add", exact: true }),
  ).toBeVisible();
});

test("mobile completed controls stay centered with no document overflow after a tall upload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 650 });
  await login(page);
  await page.locator("input[type=file]").setInputFiles(
    Array.from({ length: 32 }, (_, i) => ({
      name: `file-${i}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from("x"),
    })),
  );
  await expect(page.locator(".share-ready")).toBeVisible({ timeout: 20000 });
  for (const height of [650, 520, 844]) {
    await page.setViewportSize({ width: 390, height });
    await page.evaluate(() => {
      window.scrollTo(0, 2000);
      document.querySelector(".owner > .center").scrollTop = 2000;
    });
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await expect
      .poll(() =>
        page.locator(".owner > .center").evaluate((el) => el.scrollTop),
      )
      .toBe(0);
    await expect
      .poll(async () => {
        const r = await page.locator(".share-ready").boundingBox();
        return (
          Math.abs(r.x + r.width / 2 - 195) < 2 &&
          Math.abs(r.y + r.height / 2 - (height / 2 - 48)) < 2
        );
      })
      .toBe(true);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight <= innerHeight + 1 &&
          document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.locator(".settings > button").click();
  await page.locator(".settings-toolbar button").first().click();
  await expect(page.locator(".dialog-header h2 svg")).toBeVisible();
  expect(await page.locator(".dialog-header h2").innerText()).toBe("");
});

test("recipient sharing stays inside details and countdown ticks without moving download", async ({
  page,
}) => {
  const now = Date.now(),
    expires = now + 90061000;
  await page.clock.install({ time: new Date(now) });
  await page.clock.setFixedTime(new Date(now));
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data) => {
        window.sharedData = data;
      },
    });
  });
  await page.route("**/public/Test12", (r) =>
    r.fulfill({
      json: { files: [{ name: "sample.txt", size: 7 }], size: 7, expires },
    }),
  );
  await page.goto("/Test12");
  await expect(page.locator(".expiry-corner")).toHaveText("25:01:01");
  const download = page.locator(".primary-action");
  await expect(page.locator(".recipient-share-actions")).toBeHidden();
  await page.locator(".transfer-details > button").click();
  await expect(page.locator(".recipient-share-actions")).toBeVisible();
  await page.locator(".recipient-share-actions button").nth(0).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "http://127.0.0.1:3001/Test12",
  );
  await page.locator(".recipient-share-actions button").nth(1).click();
  await expect(page.locator(".qr-dropdown img")).toBeVisible();
  await page.locator(".recipient-share-actions button").nth(2).click();
  expect(await page.evaluate(() => window.sharedData)).toEqual({
    url: "http://127.0.0.1:3001/Test12",
  });
  await expect(page.locator(".transfer-information time")).toHaveAttribute(
    "datetime",
    new Date(expires).toISOString(),
  );
  const before = await download.boundingBox();
  await page.clock.setFixedTime(new Date(now + 2000));
  await page.clock.runFor(2000);
  await expect(page.locator(".expiry-corner")).toHaveText("25:00:59");
  const after = await download.boundingBox();
  expect(Math.abs(before.y - after.y)).toBeLessThan(1);
  await page.locator(".transfer-details > button").click();
  await expect(page.locator(".recipient-share-actions")).toBeHidden();
});

test("infinite recipient hides unavailable native sharing and history shows remaining time", async ({
  page,
}) => {
  const now = Date.now(),
    expires = now + 3600000;
  await page.clock.install({ time: new Date(now) });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    }),
  );
  await page.route("**/public/Inf123", (r) =>
    r.fulfill({
      json: { files: [{ name: "file", size: 1 }], size: 1, expires: null },
    }),
  );
  await page.goto("/Inf123");
  await expect(page.locator(".expiry-corner")).toHaveText("∞");
  await page.locator(".transfer-details > button").click();
  await expect(page.locator(".recipient-share-actions button")).toHaveCount(2);
  await page.route("**/api/session", (r) => r.fulfill({ json: { ok: true } }));
  await page.route("**/api/transfers", (r) =>
    r.fulfill({
      json: [
        {
          id: "finite",
          state: "ready",
          created: now,
          expires,
          ttl: 3600,
          files: [{ name: "file", size: 1 }],
          size: 1,
          url: "http://127.0.0.1:3001/Test12",
        },
        {
          id: "infinite",
          state: "ready",
          created: now,
          expires: null,
          ttl: 0,
          files: [],
          size: 0,
          url: "http://127.0.0.1:3001/Inf123",
        },
      ],
    }),
  );
  await page.goto("/");
  await page.locator(".settings > button").click();
  await page.locator(".settings-toolbar button").first().click();
  await expect(page.locator(".expiry-inline").first()).toHaveText("01:00:00");
  await expect(page.locator(".expiry-inline").last()).toHaveText("∞");
  await page.clock.runFor(1000);
  await expect(page.locator(".expiry-inline").first()).toHaveText("00:59:59");
});

test("history selection deletes multiple records without expanding and supports select all", async ({
  page,
}) => {
  const now = Date.now();
  let items = ["ready", "ready", "ready"].map((state, i) => ({
    id: "row" + i,
    state,
    created: now + i * 1000,
    expires: now + 3600000,
    ttl: 3600,
    files: [],
    size: 0,
    url: state === "ready" ? "http://127.0.0.1:3001/Test12" : null,
  }));
  const removed = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/session", (r) => r.fulfill({ json: { ok: true } }));
  await page.route("**/api/transfers", (r) => r.fulfill({ json: items }));
  await page.route("**/api/history", (r) => {
    const ids = r.request().postDataJSON().ids;
    removed.push(ids);
    items = items.filter((t) => !ids.includes(t.id));
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await page.locator(".settings > button").click();
  await page.locator(".settings-toolbar button").first().click();
  await expect(page.locator(".history-state svg")).toHaveCount(3);
  await expect(page.locator(".history-toggle")).not.toContainText([
    "Ready",
    "Deleted",
    "Ready",
  ]);
  await expect(page.locator(".dialog-header h2")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Search history", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator(".dialog-header input")).toBeFocused();
  expect(
    await page
      .locator(".dialog-header input")
      .evaluate((el) => getComputedStyle(el).outlineStyle),
  ).toBe("solid");
  await page.locator(".dialog-header input").click();
  expect(
    await page
      .locator(".dialog-header input")
      .evaluate((el) => getComputedStyle(el).outlineStyle),
  ).toBe("none");
  await page.locator(".dialog-header input").uncheck();

  const screen = await page.locator(".history-dialog").boundingBox();
  expect(screen.x).toBe(0);
  expect(screen.y).toBe(0);
  expect(screen.width).toBe(390);
  expect(screen.height).toBe(844);
  const closeBox = await page.locator(".dialog-header > button").boundingBox();
  const deleteBox = await page
    .locator(".history-bulk-actions button")
    .boundingBox();
  expect(closeBox.width).toBe(deleteBox.width);
  expect(closeBox.height).toBe(deleteBox.height);
  expect(closeBox.x - deleteBox.x - deleteBox.width).toBeGreaterThan(100);
  const rows = page.locator(".history-item");
  await rows.nth(0).locator(".history-select").check();
  await rows.nth(1).locator(".history-select").check();
  await expect(page.locator(".history-toggle[aria-expanded=true]")).toHaveCount(
    0,
  );
  expect(
    await page
      .locator(".dialog-header input")
      .evaluate((el) => el.indeterminate),
  ).toBe(true);
  await confirmDelete(page.locator(".history-bulk-actions button"));
  await expect(rows).toHaveCount(1);
  expect(removed[0]).toEqual(["row0", "row1"]);
  await page.locator(".dialog-header input").check();
  await confirmDelete(page.locator(".history-bulk-actions button"));
  await expect(rows).toHaveCount(0);
  await expect(page.locator(".history-bulk-actions button")).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("already open recipient refreshes changed files and becomes a cross after deletion", async ({
  page,
}) => {
  let state = "ready";
  await page.route("**/public/Live12", (r) =>
    state === "deleted"
      ? r.fulfill({ status: 404, json: { error: "Unavailable" } })
      : state === "offline"
        ? r.fulfill({
            status: 502,
            contentType: "text/html",
            body: "<html>Bad Gateway</html>",
          })
        : r.fulfill({
            json: {
              files: [
                {
                  name: state === "ready" ? "before.txt" : "after.txt",
                  size: 1,
                },
              ],
              size: 1,
              expires: null,
            },
          }),
  );
  await page.goto("/Live12");
  await page.locator(".transfer-details > button").click();
  await expect(page.locator(".files")).toContainText("before.txt");
  state = "offline";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".primary-action")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  state = "changed";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".files")).toContainText("after.txt");
  state = "deleted";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".unavailable")).toBeVisible();
  await expect(
    page.locator(".primary-action,.transfer-details,.expiry-corner"),
  ).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("failed delete closes QR and never leaks Safari JSON parser errors; retry returns to upload", async ({
  page,
}) => {
  await login(page);
  await page.locator("input[type=file]").setInputFiles({
    name: "delete.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("x"),
  });
  await expect(page.locator(".share-ready")).toBeVisible();
  await page
    .locator(".share-ready")
    .getByRole("button", { name: "QR code", exact: true })
    .click();
  await expect(page.locator(".qr-popover.is-open")).toBeVisible();
  await page.route("**/api/transfers/*", (r) =>
    r.request().method() === "DELETE"
      ? r.fulfill({
          status: 502,
          contentType: "text/html",
          body: "<html>Bad Gateway</html>",
        })
      : r.continue(),
  );
  await confirmDelete(
    page
      .locator(".share-ready")
      .getByRole("button", { name: /Delete|Confirm/ }),
  );
  await expect(page.locator(".qr-popover.is-open")).toHaveCount(0);
  const retry = page.getByRole("button", {
    name: "Reload page",
    exact: true,
  });
  await expect(retry).toBeVisible();
  await page.unroute("**/api/transfers/*");
  await retry.click();
  await expect(page.locator(".share-ready")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "UPLOAD", exact: true }),
  ).toBeVisible();
});

test("delete confirmation is cancelled by blur, timeout and selection changes", async ({
  page,
}) => {
  let deleted = 0;
  const now = Date.now();
  await page.clock.install({ time: new Date(now) });
  await page.route("**/api/session", (r) => r.fulfill({ json: { ok: true } }));
  await page.route("**/api/transfers", (r) =>
    r.fulfill({
      json: [
        {
          id: "confirm",
          state: "ready",
          created: now,
          expires: null,
          ttl: 0,
          files: [],
          size: 0,
          url: "http://127.0.0.1:3001/Test12",
        },
      ],
    }),
  );
  await page.route("**/api/transfers/confirm", (r) => {
    deleted++;
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await page.locator(".settings > button").click();
  await page.locator(".settings-toolbar button").first().click();
  const row = page.locator(".history-item"),
    trash = row.locator(".share-controls button").last();
  await trash.click();
  await expect(trash).toHaveAttribute("data-confirming", "true");
  expect(deleted).toBe(0);
  await row.locator(".history-select").click();
  await expect(trash).toHaveAttribute("data-confirming", "false");
  await trash.click();
  await page.clock.runFor(4100);
  await expect(trash).toHaveAttribute("data-confirming", "false");
  expect(deleted).toBe(0);
  await trash.click();
  await expect(trash).toHaveAttribute("data-confirming", "true");
  await trash.click();
  await expect.poll(() => deleted).toBe(1);
  await row.locator(".history-toggle").click();
  await expect(row.locator(".history-information")).toContainText("∞");
  await expect(row.locator(".history-information")).not.toContainText(
    "Forever",
  );
});

test("pointer focus has no outlines while Tab retains keyboard focus indication", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.locator(".login-field input"),
    field = page.locator(".login-field"),
    eye = page.locator(".login-field button").first();
  await input.click();
  expect(await field.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
    "none",
  );
  expect(await input.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
    "none",
  );
  await page.keyboard.press("Tab");
  await expect(eye).toBeFocused();
  expect(await eye.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
    "solid",
  );
  await eye.click();
  expect(await eye.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
    "none",
  );
  await input.click();
  await page.keyboard.press("Tab");
  await expect(eye).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(input).toBeFocused();
  expect(await field.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
    "solid",
  );
  await input.click();
  expect(await field.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
    "none",
  );
});
