import { test, expect } from "@playwright/test";

test("owner shares the verified domain while Markdown links still use the DU token", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const canonical = "http://127.0.0.1:3001/Abc123";
  let shareUrl = "https://site.example.com/";
  const record = () => ({
    id: "site",
    state: "ready",
    created: Date.now(),
    expires: null,
    ttl: 0,
    url: canonical,
    shareUrl,
    revision: "r",
    name: "files.zip",
    size: 30,
    files: [
      { name: "README.md", size: 15, preview: true },
      { name: "docs/next.md", size: 8, preview: true },
      { name: "index.html", size: 7, preview: true },
    ],
  });
  await page.route("**/api/session", (r) => r.fulfill({ json: { ok: true } }));
  await page.route("**/api/transfers", (r) => r.fulfill({ json: [record()] }));
  await page.route("**/api/transfers/site/text/0", (r) =>
    r.fulfill({
      body: "# Hello\n\n[Next](docs/next.md)",
      contentType: "text/plain",
    }),
  );
  const history = async () => {
    await page.goto("/");
    await page.getByLabel("Settings", { exact: true }).click();
    await page.getByRole("button", { name: "History", exact: true }).click();
  };
  await history();
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(shareUrl);
  await page.locator(".history-toggle").click();
  await page
    .getByRole("button", { name: "Preview README.md", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Next", exact: true }),
  ).toHaveAttribute("href", "/Abc123?file=docs%2Fnext.md");
  await page
    .getByRole("button", { name: "Close preview", exact: true })
    .click();
  shareUrl = canonical;
  await history();
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(canonical);
});

test("recipient copy, QR and native share use the verified domain", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "share", {
      value: async (value) => {
        window.sharedURL = value.url;
      },
      configurable: true,
    }),
  );
  const shareUrl = "https://site.example.com/";
  await page.route("**/public/Abc123", (r) =>
    r.fulfill({
      json: {
        locked: false,
        demo: false,
        name: "files.zip",
        shareUrl,
        expires: null,
        files: [
          { name: "index.html", size: 5 },
          { name: "style.css", size: 5 },
        ],
      },
    }),
  );
  await page.goto("/Abc123");
  await page.getByLabel("Transfer details", { exact: true }).click();
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(shareUrl);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.sharedURL)).toBe(shareUrl);
  await page.getByRole("button", { name: "QR code", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Link QR code", exact: true }),
  ).toBeVisible();
});
