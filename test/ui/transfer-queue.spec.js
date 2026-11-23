import { test, expect } from "@playwright/test";

async function login(page) {
  await page.goto("/");
  await page.getByLabel("Password", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".owner")).toBeVisible();
}
const fixtureFile = (name) => ({
  name,
  mimeType: "text/plain",
  buffer: Buffer.from(name),
});
async function rename(page, index, name) {
  const field = page.getByRole("textbox", {
    name: "Filename " + index,
    exact: true,
  });
  await expect(field).toHaveAttribute("aria-disabled", "false");
  await field.click();
  await field.fill(name);
  await field.press("Enter");
  await expect(field).toHaveText(name);
  await expect(field).toHaveAttribute("aria-readonly", "true");
}
async function paste(page, text) {
  await page.evaluate((text) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", text);
    document.querySelector("main").dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, text);
}

for (const width of [390, 1280]) {
  test(`clipboard destinations share icon-only drag zones at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page
      .locator('input[type="file"]')
      .setInputFiles([fixtureFile("clipboard.txt")]);
    await expect(page.locator(".share-ready")).toBeVisible();
    await paste(page, "pasted");
    const dialog = page.getByRole("dialog", {
      name: "Where to paste",
      exact: true,
    });
    for (const label of ["New transfer", "Add to current transfer"]) {
      const zone = dialog.getByRole("button", { name: label, exact: true });
      await expect(zone).toHaveAttribute("title", label);
      await expect(zone).toHaveText("");
      await expect(zone.locator("svg")).toHaveCount(1);
    }
    const newRect = await dialog
      .getByRole("button", { name: "New transfer", exact: true })
      .boundingBox();
    const appendRect = await dialog
      .getByRole("button", { name: "Add to current transfer", exact: true })
      .boundingBox();
    expect(newRect.y).toBe(0);
    expect(Math.abs(appendRect.y - 450)).toBeLessThan(1);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.locator("main").dispatchEvent("dragover", {
      dataTransfer: await page.evaluateHandle(() => {
        const dt = new DataTransfer();
        dt.items.add(new File(["x"], "drag.txt"));
        return dt;
      }),
      clientY: 700,
    });
    const drag = page.locator(".drop-zones");
    await expect(drag).toBeVisible();
    for (const label of ["New transfer", "Add to current transfer"]) {
      const zone = drag.getByLabel(label, { exact: true });
      await expect(zone).toHaveAttribute("title", label);
      await expect(zone).toHaveText("");
      await expect(zone.locator("svg")).toHaveCount(1);
    }
    await expect(
      drag.getByLabel("Add to current transfer", { exact: true }),
    ).toHaveClass(/active/);
  });
}

test("renames, added files and new text queue while an archive is still building", async ({
  page,
  context,
}) => {
  await login(page);
  await page
    .locator('input[type="file"]')
    .setInputFiles([
      fixtureFile("queue-first.txt"),
      fixtureFile("queue-second.txt"),
    ]);
  await expect(page.locator(".share-ready")).toBeVisible();
  const list = await (await context.request.get("/api/transfers")).json();
  const original = list.find((t) =>
    t.files.some((f) => f.name === "queue-first.txt"),
  );
  let hold = false;
  const renames = [],
    appends = [];
  await page.route("**/api/transfers", async (route) => {
    const response = await route.fetch();
    const records = await response.json();
    if (hold)
      for (const record of records)
        if (record.id === original.id) record.appendState = "archiving";
    await route.fulfill({ response, json: records });
  });
  await page.route(
    `**/api/transfers/${original.id}/settings`,
    async (route) => {
      renames.push(route.request().postDataJSON());
      if (renames.length === 1) hold = true;
      await route.continue();
    },
  );
  await page.route(`**/api/transfers/${original.id}/append`, async (route) => {
    appends.push(route.request().postDataJSON());
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Transfer details", exact: true })
    .click();
  await rename(page, 1, "queue-first-draft.txt");
  await expect.poll(() => renames.length).toBe(1);
  await expect(
    page.getByRole("status", { name: "Pending changes", exact: true }),
  ).toBeVisible();
  await rename(page, 2, "queue-second-final.txt");
  await rename(page, 1, "queue-first-final.txt");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles([fixtureFile("queued-third.txt")]);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles([fixtureFile("queued-fourth.txt")]);
  await page
    .getByRole("button", { name: "Add text file", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "Text transfer",
    exact: true,
  });
  await editor.locator(".cm-content").fill("queued text bytes");
  await editor.getByRole("button", { name: "Send text", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.locator(".share-ready")).toBeVisible();
  await rename(page, 5, "queued-note.txt");
  expect(renames).toHaveLength(1);
  expect(appends).toHaveLength(0);
  hold = false;
  await expect(
    page.getByRole("status", { name: "Pending changes", exact: true }),
  ).toHaveCount(0, { timeout: 20000 });
  expect(renames).toHaveLength(2);
  expect(appends).toHaveLength(1);
  expect(appends[0].files).toHaveLength(3);
  const records = await (await context.request.get("/api/transfers")).json();
  const updated = records.find((t) => t.id === original.id);
  expect(updated.url).toBe(original.url);
  expect(updated.files.slice(0, 4).map((f) => f.name)).toEqual([
    "queue-first-final.txt",
    "queue-second-final.txt",
    "queued-third.txt",
    "queued-fourth.txt",
  ]);
  expect(updated.files).toHaveLength(5);
  expect(updated.files[4].name).toBe("queued-note.txt");
  const text = await context.request.get(
    `/api/transfers/${original.id}/text/4`,
  );
  expect(await text.text()).toBe("queued text bytes");
});

test("a failed rename stays visible and can be retried together with newer edits", async ({
  page,
  context,
}) => {
  await login(page);
  await page
    .locator('input[type="file"]')
    .setInputFiles([
      fixtureFile("retry-one.txt"),
      fixtureFile("retry-two.txt"),
    ]);
  await expect(page.locator(".share-ready")).toBeVisible();
  const list = await (await context.request.get("/api/transfers")).json();
  const original = list.find((t) =>
    t.files.some((f) => f.name === "retry-one.txt"),
  );
  let requests = 0;
  await page.route(
    `**/api/transfers/${original.id}/settings`,
    async (route) => {
      requests++;
      if (requests === 1)
        await route.fulfill({
          status: 503,
          json: { error: "Temporarily unavailable" },
        });
      else await route.continue();
    },
  );
  await page
    .getByRole("button", { name: "Transfer details", exact: true })
    .click();
  await rename(page, 1, "retry-draft.txt");
  await expect(
    page.getByRole("button", { name: "Retry changes", exact: true }),
  ).toBeVisible();
  await rename(page, 1, "retry-final.txt");
  await rename(page, 2, "retry-second-final.txt");
  expect(requests).toBe(1);
  await page
    .getByRole("button", { name: "Retry changes", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Pending changes", exact: true }),
  ).toHaveCount(0);
  expect(requests).toBe(2);
  const records = await (await context.request.get("/api/transfers")).json();
  expect(
    records.find((t) => t.id === original.id).files.map((f) => f.name),
  ).toEqual(["retry-final.txt", "retry-second-final.txt"]);
});

for (const width of [390, 1280]) {
  test(`adding and renaming stay available during an upload at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page
      .locator('input[type="file"]')
      .setInputFiles([fixtureFile("pipeline-original.txt")]);
    await expect(page.locator(".share-ready")).toBeVisible();
    const original = (
      await (await context.request.get("/api/transfers")).json()
    ).find((t) => t.files.some((f) => f.name === "pipeline-original.txt"));
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let sending = false;
    await page.route("**/fake/**", async (route) => {
      sending = true;
      await gate;
      await route.continue();
    });
    try {
      await page
        .getByRole("button", { name: "Transfer details", exact: true })
        .click();
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await page
        .locator('input[type="file"]')
        .setInputFiles([fixtureFile("pipeline-in-flight.txt")]);
      await expect.poll(() => sending).toBe(true);
      await expect(
        page.getByRole("progressbar", { name: "Upload progress", exact: true }),
      ).toBeVisible();
      await rename(page, 2, "pipeline-renamed.txt");
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await page
        .locator('input[type="file"]')
        .setInputFiles([fixtureFile("pipeline-next.txt")]);
      await expect(
        page.getByRole("textbox", { name: "Filename 3", exact: true }),
      ).toHaveText("pipeline-next.txt");
      await paste(page, "pasted during upload");
      await expect(
        page
          .getByRole("dialog", { name: "Where to paste", exact: true })
          .getByRole("button", { name: "New transfer", exact: true }),
      ).toBeDisabled();
      await page
        .getByRole("dialog", { name: "Where to paste", exact: true })
        .getByRole("button", { name: "Add to current transfer", exact: true })
        .click();
      const editor = page.getByRole("dialog", {
        name: "Text transfer",
        exact: true,
      });
      await expect(editor.locator(".cm-content")).toHaveText(
        "pasted during upload",
      );
      await editor
        .getByRole("button", { name: "Send text", exact: true })
        .click();
      await expect(editor).toHaveCount(0);
      release();
      await expect(
        page.getByRole("status", { name: "Pending changes", exact: true }),
      ).toHaveCount(0, { timeout: 20000 });
      const updated = (
        await (await context.request.get("/api/transfers")).json()
      ).find((t) => t.id === original.id);
      expect(updated.files.slice(0, 3).map((f) => f.name)).toEqual([
        "pipeline-original.txt",
        "pipeline-renamed.txt",
        "pipeline-next.txt",
      ]);
      expect(updated.files).toHaveLength(4);
      expect(
        await (
          await context.request.get(`/api/transfers/${original.id}/text/1`)
        ).text(),
      ).toBe("pipeline-in-flight.txt");
      expect(
        await (
          await context.request.get(`/api/transfers/${original.id}/text/3`)
        ).text(),
      ).toBe("pasted during upload");
    } finally {
      release();
    }
  });
}

test("an append request failure keeps the queue and its retry controls available", async ({
  page,
  context,
}) => {
  await login(page);
  await page
    .locator('input[type="file"]')
    .setInputFiles([fixtureFile("append-retry-original.txt")]);
  await expect(page.locator(".share-ready")).toBeVisible();
  const original = (
    await (await context.request.get("/api/transfers")).json()
  ).find((t) => t.files.some((f) => f.name === "append-retry-original.txt"));
  let requests = 0;
  await page.route(`**/api/transfers/${original.id}/append`, async (route) => {
    requests++;
    if (requests === 1)
      await route.fulfill({
        status: 503,
        json: { error: "Temporarily unavailable" },
      });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles([fixtureFile("append-retry-new.txt")]);
  const retry = page.getByRole("button", {
    name: "Retry changes",
    exact: true,
  });
  await expect(retry).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Pending changes", exact: true }),
  ).toHaveAttribute("title", "Temporarily unavailable");
  await retry.click();
  await expect(
    page.getByRole("status", { name: "Pending changes", exact: true }),
  ).toHaveCount(0, { timeout: 15000 });
  expect(requests).toBe(2);
  const updated = (
    await (await context.request.get("/api/transfers")).json()
  ).find((t) => t.id === original.id);
  expect(updated.files.map((f) => f.name)).toEqual([
    "append-retry-original.txt",
    "append-retry-new.txt",
  ]);
});

test("history confirms a lost completion response and releases the upload queue", async ({
  page,
  context,
}) => {
  await login(page);
  await page
    .locator('input[type="file"]')
    .setInputFiles([fixtureFile("lost-original.txt")]);
  await expect(page.locator(".share-ready")).toBeVisible();
  let lost = false;
  await page.route("**/api/transfers/*/complete", async (route) => {
    if (lost) return route.continue();
    lost = true;
    await route.fetch();
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles([fixtureFile("lost-accepted.txt")]);
  await expect.poll(() => lost).toBe(true);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles([fixtureFile("lost-next.txt")]);
  await expect(
    page.getByRole("status", { name: "Pending changes", exact: true }),
  ).toHaveCount(0, { timeout: 20000 });
  const records = await (await context.request.get("/api/transfers")).json();
  const record = records.find((t) =>
    t.files.some((f) => f.name === "lost-original.txt"),
  );
  expect(record.files.map((f) => f.name)).toEqual([
    "lost-original.txt",
    "lost-accepted.txt",
    "lost-next.txt",
  ]);
});

test("renaming during a text replacement targets the confirmed replacement", async ({
  page,
  context,
}) => {
  await login(page);
  await page
    .locator('input[type="file"]')
    .setInputFiles([fixtureFile("replace-original.txt")]);
  await expect(page.locator(".share-ready")).toBeVisible();
  let release,
    sending = false;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/fake/**", async (route) => {
    sending = true;
    await gate;
    await route.continue();
  });
  try {
    await page.getByRole("button", { name: "Edit text", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Edit text", exact: true });
    await editor.locator(".cm-content").fill("replacement bytes");
    await editor
      .getByRole("button", { name: "Save text", exact: true })
      .click();
    await expect.poll(() => sending).toBe(true);
    await rename(page, 1, "replacement-renamed.txt");
    release();
    await expect(
      page.getByRole("status", { name: "Pending changes", exact: true }),
    ).toHaveCount(0, { timeout: 20000 });
    const records = await (await context.request.get("/api/transfers")).json();
    const record = records.find((t) =>
      t.files.some((f) => f.name === "replacement-renamed.txt"),
    );
    expect(
      await (
        await context.request.get(`/api/transfers/${record.id}/text/0`)
      ).text(),
    ).toBe("replacement bytes");
  } finally {
    release();
  }
});
