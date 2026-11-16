import { test, expect } from "@playwright/test";
import { unzipSync } from "fflate";
async function login(page) {
  await page.goto("/");
  await page.getByLabel("Password", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".owner")).toBeVisible();
}
test("folder drop reviews ignored files, restores a folder and uploads a complete nested ZIP", async ({
  page,
  context,
}) => {
  await login(page);
  await page.evaluate(() => {
    const f = (name, text) => ({
      name,
      isFile: true,
      isDirectory: false,
      file: (ok) => ok(new File([text], name)),
    });
    const d = (name, list) => ({
      name,
      isDirectory: true,
      isFile: false,
      createReader() {
        let done = false;
        return {
          readEntries(ok) {
            ok(done ? [] : list);
            done = true;
          },
        };
      },
    });
    const root = d("project", [
      f(".gitignore", "build/\n"),
      f(".env", "secret"),
      f(".env.example", "KEY="),
      d("node_modules", [f("big.js", "excluded")]),
      d("build", [f("index.js", "compiled")]),
      d("src", [f("main.py", 'print("Привет")\n')]),
      d("empty", []),
    ]);
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: {
        items: [{ kind: "file", webkitGetAsEntry: () => root }],
        files: [],
      },
    });
    document.querySelector("main").dispatchEvent(event);
  });
  const dialog = page.getByRole("dialog", { name: "Folders", exact: true });
  await expect(
    dialog.getByText("project/src/main.py", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("project/node_modules/", { exact: true }),
  ).toBeHidden();
  await dialog.locator("summary").click();
  await expect(
    dialog.getByText("project/node_modules/", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Restore project/build", exact: true })
    .click();
  await expect(
    dialog.getByText("project/build/index.js", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Upload folders", exact: true })
    .click();
  await expect(page.locator(".share-ready")).toBeVisible();
  const transfer = await page.evaluate(
    async () => (await (await fetch("/api/transfers")).json())[0],
  );
  expect(
    transfer.files.some((file) => file.name === "project/src/main.py"),
  ).toBe(true);
  expect(transfer.files.some((file) => file.name.endsWith(".zip"))).toBe(false);
  expect(transfer.size).toBeGreaterThan(0);
  const data = unzipSync(
    new Uint8Array(
      await (
        await context.request.get(
          "/public/" + transfer.url.split("/").pop() + "/download",
        )
      ).body(),
    ),
  );
  expect(new TextDecoder().decode(data["project/src/main.py"])).toBe(
    'print("Привет")\n',
  );
  expect(data["project/build/index.js"]).toBeTruthy();
  expect(data["project/empty/"]).toBeTruthy();
  expect(data["project/.env"]).toBeUndefined();
  expect(data["project/node_modules/big.js"]).toBeUndefined();
});
test("wrong login keeps input in place, clears it and resets the inline error on typing", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.getByLabel("Password", { exact: true }),
    before = await input.boundingBox();
  await input.fill("000000");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Incorrect password", exact: true }),
  ).toBeVisible();
  await expect(input).toHaveValue("");
  const after = await input.boundingBox();
  expect(after.x).toBe(before.x);
  expect(after.y).toBe(before.y);
  expect(after.height).toBe(before.height);
  await input.fill("1");
  await expect(
    page.getByRole("img", { name: "Incorrect password", exact: true }),
  ).toHaveCount(0);
});
test("current and history settings change their own retention and PIN through one lock button", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
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
  const initialPin = await page.evaluate(() => navigator.clipboard.readText());
  await page.mouse.click(20, 200);
  await page.locator("input[type=file]").setInputFiles({
    name: "settings.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.from([0, 1, 2]),
  });
  await expect(page.locator(".share-ready")).toBeVisible();
  await page.getByLabel("Settings", { exact: true }).click();
  await expect(page.getByRole("button", { name: /^Retention:/ })).toBeHidden();
  await page.mouse.click(20, 200);
  await page
    .locator(".share-ready")
    .getByRole("button", { name: "Transfer settings", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
      name: "Transfer settings",
      exact: true,
    }),
    lock = dialog.getByRole("button", {
      name: "Generate and copy transfer password",
      exact: true,
    });
  await expect(dialog.getByLabel("Current transfer password")).toHaveValue(
    initialPin,
  );
  await lock.click();
  await expect(lock.locator("svg")).toHaveClass(/lucide-check/);
  const pin = await page.evaluate(() => navigator.clipboard.readText());
  expect(pin).toMatch(/^\d{6}$/);
  const get = () =>
    page.evaluate(
      async () => (await (await fetch("/api/transfers")).json())[0],
    );
  let transfer = await get();
  expect(transfer.hasPassword).toBe(true);
  const url = transfer.url;
  await dialog
    .getByRole("button", { name: "Current retention: 24 hours", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "Current retention: 3 days",
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await page.reload();
  await page.getByLabel("Settings", { exact: true }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page
    .locator(".history-item")
    .first()
    .getByRole("button", { name: "Transfer settings", exact: true })
    .click();
  await expect(dialog.getByLabel("Current transfer password")).toHaveValue(pin);
  await expect(
    dialog.getByRole("button", {
      name: "Current retention: 3 days",
      exact: true,
    }),
  ).toBeVisible();
  await lock.dblclick();
  await expect.poll(async () => (await get()).hasPassword).toBe(false);
  expect((await get()).url).toBe(url);
  await dialog
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
});
test("unavailable cross returns to upload or login", async ({ page }) => {
  await page.route("**/public/Dead12", (r) =>
    r.fulfill({ status: 404, json: { error: "missing" } }),
  );
  await page.goto("/Dead12");
  const cross = page.getByRole("link", {
    name: "Back to upload",
    exact: true,
  });
  await expect(cross).toHaveAttribute("href", "/");
  await cross.click();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
});
