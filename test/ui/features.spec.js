import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function login(page) {
  await page.goto("/");
  await page.getByLabel("Password", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".owner")).toBeVisible();
}
async function current(page) {
  return page.evaluate(
    async () => (await (await fetch("/api/transfers")).json())[0],
  );
}
async function history(page) {
  await page.getByLabel("Settings", { exact: true }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
}
test("closed-tab upload restores original bytes and never resends an already accepted part", async ({
  page,
  context,
}) => {
  await login(page);
  let firstParts = 0,
    second = 0;
  context.on("request", (r) => {
    if (
      r.method() === "PUT" &&
      new URL(r.url()).pathname.match(/^\/fake\/.*\/1$/)
    )
      firstParts++;
  });
  await page.route("**/fake/**", async (r) => {
    if (new URL(r.request().url()).pathname.endsWith("/2")) {
      second++;
      await r.abort();
    } else await r.continue();
  });
  const data = Buffer.alloc(9 * 1024 * 1024, 29);
  await page.locator("input[type=file]").setInputFiles({
    name: "resume.bin",
    mimeType: "application/octet-stream",
    buffer: data,
  });
  await expect.poll(() => second).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.close();
  const restored = await context.newPage();
  await restored.goto("/");
  await expect(
    restored.getByRole("button", { name: "Resume", exact: true }),
  ).toBeVisible();
  await restored.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(restored.locator(".share-ready")).toBeVisible();
  expect(firstParts).toBe(1);
  const record = await current(restored),
    response = await context.request.get(
      "/public/" + record.url.split("/").pop() + "/download",
    );
  expect(await response.body()).toEqual(data);
  expect(
    await restored.evaluate(() => localStorage.getItem("du.upload.v1")),
  ).toBeNull();
  await restored.close();
});
test("history searches and filters filenames and reopens a saved transfer as current", async ({
  page,
}) => {
  const now = Date.now(),
    records = [
      {
        id: "one",
        title: "Python project",
        hasPassword: true,
        ttl: 0,
        files: [{ name: "main.py", size: 1 }],
      },
      {
        id: "two",
        title: "Another",
        hasPassword: false,
        ttl: 3600,
        files: [{ name: "other.py", size: 1 }],
      },
      {
        id: "three",
        title: "Picture",
        hasPassword: false,
        ttl: 86400,
        files: [{ name: "picture.jpg", size: 1 }],
      },
    ].map((t, i) => ({
      ...t,
      created: now - i * 1000,
      state: "ready",
      expires: t.ttl ? now + t.ttl * 1000 : null,
      url: "/Abc12" + i,
      size: 1,
      revision: String(i),
    }));
  await page.route("**/api/session", (r) => r.fulfill({ json: { ok: true } }));
  await page.route("**/api/transfers", (r) => r.fulfill({ json: records }));
  await page.goto("/");
  await history(page);
  await page
    .getByRole("button", { name: "Search history", exact: true })
    .click();
  await page.getByLabel("Search filenames or transfers").fill(".py");
  await expect(page.locator(".history-item")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Password protected", exact: true })
    .click();
  await expect(page.locator(".history-item")).toHaveCount(1);
  await page.locator(".history-toggle").click();
  await page
    .getByRole("button", { name: "Open transfer", exact: true })
    .click();
  await expect(page.locator(".history-dialog")).toHaveCount(0);
  await expect(page.locator(".share-ready")).toBeVisible();
  await page.getByLabel("Transfer details", { exact: true }).click();
  await expect(page.getByText("main.py", { exact: true })).toBeVisible();
});
test("rename keeps the same URL and a one-time individual download closes the public link", async ({
  page,
  context,
}) => {
  await login(page);
  await page.locator("input[type=file]").setInputFiles([
    { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("one") },
    { name: "b.txt", mimeType: "text/plain", buffer: Buffer.from("two") },
  ]);
  await expect(page.locator(".share-ready")).toBeVisible();
  const before = await current(page);
  await page.getByLabel("Transfer details", { exact: true }).click();
  const details = page.locator(".owner-details");
  const rename = async (label, value) => {
    const field = details.getByRole("textbox", { name: label, exact: true });
    expect(await field.evaluate((el) => el.tagName)).toBe("SPAN");
    await field.click();
    await field.fill(value);
    await field.press("Enter");
    await expect(field).toHaveAttribute("aria-readonly", "true");
  };
  await rename("Transfer name", "Документы");
  await rename("Filename 1", "first.py");
  await rename("Filename 2", "second.md");
  await expect
    .poll(async () => (await current(page)).files[0].name)
    .toBe("first.py");
  await page
    .locator(".share-ready")
    .getByRole("button", { name: "Transfer settings", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Transfer settings",
    exact: true,
  });
  await expect(
    dialog.getByRole("textbox", { name: "Transfer name", exact: true }),
  ).toHaveCount(0);
  for (let step = 0; step < 4; step++)
    await dialog.getByRole("button", { name: /^Current retention:/ }).click();
  await expect(
    dialog.getByRole("button", {
      name: "Current retention: One-time",
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  expect((await current(page)).url).toBe(before.url);
  const receiver = await context.newPage();
  await receiver.goto(before.url);
  await receiver.getByLabel("Transfer details", { exact: true }).click();
  const event = receiver.waitForEvent("download");
  await receiver
    .getByRole("link", { name: "Download first.py", exact: true })
    .click();
  const download = await event;
  expect(download.suggestedFilename()).toBe("first.py");
  expect(await readFile(await download.path(), "utf8")).toBe("one");
  await expect
    .poll(async () =>
      (
        await context.request.get("/public/" + before.url.split("/").pop())
      ).status(),
    )
    .toBe(404);
  await receiver.bringToFront();
  await expect(
    receiver.getByRole("img", { name: "Transfer unavailable", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await receiver.close();
});
test("media preview opens images and valid PDF, audio and video with native controls", async ({
  page,
}) => {
  await login(page);
  const gif = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64",
  );
  const wav = Buffer.alloc(44 + 1600);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(1600, 40);
  const webm = await readFile(
    new URL("../fixtures/preview.webm", import.meta.url),
  );
  const contents = "BT /F1 16 Tf 30 100 Td (PDF Preview) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${contents.length} >>\nstream\n${contents}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n",
    offsets = [0];
  objects.forEach((s, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${s}\nendobj\n`;
  });
  const start = pdf.length;
  pdf +=
    "xref\n0 6\n0000000000 65535 f \n" +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  await page.locator("input[type=file]").setInputFiles([
    { name: "pixel.gif", mimeType: "image/gif", buffer: gif },
    {
      name: "document.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdf),
    },
    { name: "sound.wav", mimeType: "audio/wav", buffer: wav },
    { name: "movie.webm", mimeType: "video/webm", buffer: webm },
  ]);
  await expect(page.locator(".share-ready")).toBeVisible();
  const record = await current(page);
  await page.goto(record.url);
  await page.getByLabel("Transfer details", { exact: true }).click();
  await page.getByRole("button", { name: "pixel.gif", exact: true }).click();
  await expect(page.locator(".media-body img")).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".media-body img").evaluate((el) => el.naturalWidth),
    )
    .toBe(1);
  await page
    .getByRole("button", { name: "Close preview", exact: true })
    .click();
  await page.getByRole("button", { name: "document.pdf", exact: true }).click();
  await expect(page.locator(".media-body iframe")).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "work/pdf-preview.png" });
  await page
    .getByRole("button", { name: "Close preview", exact: true })
    .click();
  await page.getByRole("button", { name: "sound.wav", exact: true }).click();
  await expect
    .poll(() =>
      page.locator(".media-body audio").evaluate((el) => el.readyState),
    )
    .toBeGreaterThanOrEqual(1);
  await page
    .getByRole("button", { name: "Close preview", exact: true })
    .click();
  await page.getByRole("button", { name: "movie.webm", exact: true }).click();
  const videoBytes = await (
    await page.request.get("/preview/" + record.url.split("/").pop() + "/3")
  ).body();
  expect(videoBytes).toEqual(webm);
  await expect
    .poll(() =>
      page.locator(".media-body video").evaluate((el) => el.readyState),
    )
    .toBeGreaterThanOrEqual(1);
});

test("lost local file cache asks for the same files and refuses changed bytes before resuming", async ({
  page,
}) => {
  await login(page);
  let partOne = 0,
    partTwo = 0;
  await page.route("**/fake/**", async (r) => {
    if (new URL(r.request().url()).pathname.endsWith("/2")) {
      partTwo++;
      await r.abort();
    } else {
      partOne++;
      await r.continue();
    }
  });
  const data = Buffer.alloc(9 * 1024 * 1024, 37);
  await page.locator("input[type=file]").setInputFiles({
    name: "reselect.bin",
    mimeType: "application/octet-stream",
    buffer: data,
  });
  await expect.poll(() => partTwo).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("du-uploads", 1);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction("uploads", "readwrite");
          tx.objectStore("uploads").delete("active");
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.unroute("**/fake/**");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toBeVisible();
  await page.locator("input[type=file]").setInputFiles({
    name: "reselect.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(data.length, 99),
  });
  await expect(
    page.getByRole("img", { name: "Error", exact: true }),
  ).toBeVisible();
  await page.locator("input[type=file]").setInputFiles({
    name: "reselect.bin",
    mimeType: "application/octet-stream",
    buffer: data,
  });
  await expect(page.locator(".share-ready")).toBeVisible();
  expect(partOne).toBe(1);
});
test("browser selection form downloads only checked files without leaving the transfer", async ({
  page,
  context,
}) => {
  await login(page);
  await page.locator("input[type=file]").setInputFiles([
    { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("first") },
    { name: "b.txt", mimeType: "text/plain", buffer: Buffer.from("second") },
    { name: "c.txt", mimeType: "text/plain", buffer: Buffer.from("third") },
  ]);
  await expect(page.locator(".share-ready")).toBeVisible();
  const record = await current(page);
  await page.goto(record.url);
  await page.getByLabel("Transfer details", { exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Select a.txt", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Select c.txt", exact: true })
    .check();
  await expect(page.locator(".transfer-name")).toHaveText(
    record.title || record.name,
  );
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const name = await page.locator(".transfer-name").boundingBox(),
      action = await page
        .getByRole("button", { name: "Download selected files", exact: true })
        .boundingBox();
    expect(action.x).toBeGreaterThan(name.x + name.width);
    await expect
      .poll(() =>
        page.locator(".transfer-heading").evaluate((el) => {
          const name = el
              .querySelector(".transfer-name")
              .getBoundingClientRect(),
            action = el.querySelector("button").getBoundingClientRect();
          return Math.abs(
            action.y + action.height / 2 - name.y - name.height / 2,
          );
        }),
      )
      .toBeLessThan(2);
  }
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download selected files", exact: true })
    .click();
  const download = await event;
  const { unzipSync } = await import("fflate");
  const zip = unzipSync(await readFile(await download.path()));
  expect(Object.keys(zip)).toEqual(["a.txt", "c.txt"]);
  expect(new TextDecoder().decode(zip["c.txt"])).toBe("third");
  expect(page.url()).toBe(record.url);
});
