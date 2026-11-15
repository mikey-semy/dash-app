import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./test/ui",
  workers: 1,
  timeout: 30000,
  globalTeardown: "./test/ui-teardown.js",
  use: {
    baseURL: "http://127.0.0.1:3001",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_BUNDLED
        ? undefined
        : process.env.CHROME_PATH ||
          "C:/Program Files/Google/Chrome/Application/chrome.exe",
    },
    headless: true,
  },
  webServer: {
    command: "node test/ui-server.js",
    url: "http://127.0.0.1:3001",
    reuseExistingServer: false,
  },
  reporter: "list",
});
