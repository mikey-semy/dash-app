import { test, expect } from "@playwright/test";

test("owner renames preview files and editor drafts without changing the share link", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Password", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles([
    {
      name: "original.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("original"),
    },
    {
      name: "image.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
      ),
    },
  ]);
  await expect(page.locator(".share-ready")).toBeVisible();
  const current = () =>
    page.evaluate(
      async () => (await (await fetch("/api/transfers")).json())[0],
    );
  const original = await current();
  const rename = async (dialog, label, name) => {
    const field = dialog.getByRole("textbox", { name: label, exact: true });
    await field.click();
    await field.fill(name);
    await field.press("Enter");
    await expect(field).toHaveAttribute("aria-busy", "false");
    await expect(field).toHaveText(name);
  };
  await page
    .getByRole("button", { name: "Transfer details", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preview original.txt", exact: true })
    .click();
  const viewer = page.getByRole("dialog", {
    name: "Text preview",
    exact: true,
  });
  let releaseRename;
  const renameGate = new Promise((resolve) => {
    releaseRename = resolve;
  });
  await page.route("**/api/transfers/*/settings", async (route) => {
    if (route.request().method() === "PATCH") await renameGate;
    await route.continue();
  });
  const previewName = viewer.getByRole("textbox", {
    name: "Filename 1",
    exact: true,
  });
  await previewName.click();
  await previewName.fill("preview.md");
  await viewer.getByRole("button", { name: "Edit text", exact: true }).click();
  await expect(
    viewer.getByRole("button", { name: "Edit text", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("dialog", { name: "Edit text", exact: true }),
  ).toHaveCount(0);
  releaseRename();
  await expect(previewName).toHaveAttribute("aria-busy", "false");
  await page.unroute("**/api/transfers/*/settings");
  await expect(viewer).toBeVisible();
  await expect(viewer.locator(".markdown-preview")).toBeVisible();
  expect((await current()).files[0].name).toBe("preview.md");
  await viewer.getByRole("button", { name: "Edit text", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit text", exact: true });
  const editorName = editor.getByRole("textbox", {
    name: "Filename 1",
    exact: true,
  });
  await editorName.click();
  await editorName.fill("edited.txt");
  await editorName.press("Control+Enter");
  await expect(editor).toBeVisible();
  await expect(editorName).toHaveText("edited.txt");
  await editor.locator(".cm-content").fill("edited content");
  await editor.getByRole("button", { name: "Save text", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect
    .poll(async () => (await current()).files[0].name)
    .toBe("edited.txt");
  expect((await current()).url).toBe(original.url);
  await expect(
    page.getByRole("status", { name: "Pending changes", exact: true }),
  ).toHaveCount(0);
  const details = page.getByRole("button", {
    name: "Transfer details",
    exact: true,
  });
  if ((await details.getAttribute("aria-expanded")) === "false")
    await details.click();
  await page
    .getByRole("button", { name: "Preview image.svg", exact: true })
    .click();
  const media = page.getByRole("dialog", { name: "File preview", exact: true });
  await rename(media, "Filename 2", "renamed.svg");
  await expect(media.locator("img")).toBeVisible();
  expect((await current()).files[1].name).toBe("renamed.svg");
  await media
    .getByRole("button", { name: "Close preview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close current transfer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "New text transfer", exact: true })
    .click();
  const draft = page.getByRole("dialog", {
    name: "Text transfer",
    exact: true,
  });
  const draftName = draft.getByRole("textbox", {
    name: "Filename 1",
    exact: true,
  });
  await draftName.click();
  await draftName.fill("new.txt");
  await draftName.press("Meta+Enter");
  await expect(draft).toBeVisible();
  await expect(draftName).toHaveText("new.txt");
  await draft.locator(".cm-content").fill("new content");
  await draft.getByRole("button", { name: "Send text", exact: true }).click();
  await expect(draft).toHaveCount(0);
  await expect
    .poll(async () => (await current()).files[0].name)
    .toBe("new.txt");
});
