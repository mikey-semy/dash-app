import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

test("Markdown exports a standalone HTML document and opens its paginated print view", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const name = "notes.md";
  const rows = Array.from(
    { length: 85 },
    (_, i) => `| Entry ${i + 1} | Description of the entry | Result ${i + 1} |`,
  );
  const source = [
    "# Exported notes",
    "",
    "[Jump to the table](#results) · [Open the attached file](assets/pixel.gif)",
    "",
    "![Attached diagram](assets/pixel.gif)",
    "",
    "```mermaid",
    "flowchart LR",
    "  A --> B",
    "```",
    "",
    "```mermaid",
    "not a valid diagram",
    "```",
    "",
    "## Results",
    "",
    "| Entry | Description | Result |",
    "| --- | --- | --- |",
    ...rows,
    "",
    "End of the document.",
    "",
    "<script>window.exportExecuted = true</script>",
  ].join("\n");
  const violations = [];
  page.on("console", (message) => {
    if (/content security policy/i.test(message.text()))
      violations.push(message.text());
  });
  await page.route("**/public/Exp123", (route) =>
    route.fulfill({
      json: {
        locked: false,
        demo: false,
        preview: true,
        etag: '"export"',
        name,
        size: Buffer.byteLength(source),
        expires: null,
        files: [
          { name, size: Buffer.byteLength(source), preview: true },
          { name: "assets/pixel.gif", size: 43, media: "image" },
        ],
      },
    }),
  );
  await page.route(/\/raw\/Exp123(?:\/0)?$/, (route) =>
    route.fulfill({ body: source, contentType: "text/plain" }),
  );
  await page.route("**/preview/Exp123/1", (route) =>
    route.fulfill({
      contentType: "image/gif",
      body: Buffer.from(
        "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        "base64",
      ),
    }),
  );
  await page.goto("/Exp123?file=" + name);
  const preview = page.getByRole("dialog", { name: "Text preview" });
  await expect(
    preview.getByRole("heading", { name: "Exported notes" }),
  ).toBeVisible();
  const close = await preview
    .getByRole("button", { name: "Close preview" })
    .boundingBox();
  expect(close.x + close.width).toBeLessThanOrEqual(320);
  await preview.getByRole("button", { name: "Export Markdown" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    preview.getByRole("button", { name: "Download HTML" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("notes.html");
  const html = await readFile(await download.path(), "utf8");
  const exported = await context.newPage();
  await exported.route("**/*", (route) => route.abort());
  await exported.setContent(html);
  await expect(exported).toHaveTitle("notes");
  await expect(
    exported.getByRole("img", { name: "Attached diagram" }),
  ).toHaveAttribute("src", /^data:image\/gif;base64,/);
  await expect(exported.locator(".markdown-diagram img")).toHaveAttribute(
    "src",
    /^data:image\/png;base64,/,
  );
  await expect(exported.locator("pre")).toHaveText("not a valid diagram");
  await expect(
    exported.getByRole("link", { name: "Jump to the table" }),
  ).toHaveAttribute("href", "#results");
  await expect(
    exported.getByRole("link", { name: "Open the attached file" }),
  ).toHaveAttribute("href", /\/Exp123\?file=/);
  await expect(exported.locator("script")).toHaveCount(0);
  await expect(exported.locator("tbody tr")).toHaveCount(rows.length);
  await exported.emulateMedia({ media: "print" });
  expect(
    await exported
      .locator("thead")
      .evaluate((el) => getComputedStyle(el).display),
  ).toBe("table-header-group");
  expect(
    await exported
      .locator("tbody tr")
      .first()
      .evaluate((el) => getComputedStyle(el).breakInside),
  ).toBe("avoid");
  const pdf = await exported.pdf({ format: "A4" });
  expect(
    pdf.toString("latin1").match(/\/Type\s*\/Page\b/g).length,
  ).toBeGreaterThan(1);
  await exported.close();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    window.print = () => {
      window.markdownPrint = true;
    };
  });
  await preview.getByRole("button", { name: "Print / Save PDF" }).click();
  await expect.poll(() => page.evaluate(() => window.markdownPrint)).toBe(true);

  await page.emulateMedia({ media: "print" });
  await expect(preview.locator(".text-preview-header")).toBeHidden();
  await expect(preview.locator(".viewer-footer")).toBeHidden();
  await expect(page.locator(".recipient > .content")).toBeHidden();
  await expect(preview.locator(".markdown-preview")).toHaveCSS(
    "overflow",
    "visible",
  );
  const nativePdf = await page.pdf({ format: "A4", scale: 1 });
  expect(
    nativePdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0,
  ).toBeGreaterThan(1);
  expect(violations).toEqual([]);
});
