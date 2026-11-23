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
  await rename(viewer, "Filename 1", "preview.md");
  await expect(viewer).toBeVisible();
  await expect(viewer.locator(".markdown-preview")).toBeVisible();
  expect((await current()).files[0].name).toBe("preview.md");
  await viewer.getByRole("button", { name: "Edit text", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit text", exact: true });
  await rename(editor, "Filename 1", "edited.txt");
  await editor.locator(".cm-content").fill("edited content");
  await editor.getByRole("button", { name: "Save text", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect
    .poll(async () => (await current()).files[0].name)
    .toBe("edited.txt");
  expect((await current()).url).toBe(original.url);
  await page
    .getByRole("button", { name: "Transfer details", exact: true })
    .click();
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
  await rename(draft, "Filename 1", "new.txt");
  await draft.locator(".cm-content").fill("new content");
  await draft.getByRole("button", { name: "Send text", exact: true }).click();
  await expect(draft).toHaveCount(0);
  await expect
    .poll(async () => (await current()).files[0].name)
    .toBe("new.txt");
});
