import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import postcssCustomMedia from "postcss-custom-media";
import { copy } from "./shared/copy.js";
import { LANGUAGE } from "./shared/config.js";
import { manifest } from "./shared/manifest.js";
import { readFileSync } from "node:fs";
const themeColor = readFileSync(
  new URL("./src/styles/tokens.css", import.meta.url),
  "utf8",
)
  .match(/--color-surface:\s*([^;]+);/)[1]
  .trim();
const appManifest = {
  ...manifest,
  background_color: themeColor,
  theme_color: themeColor,
};
export default defineConfig({
  // The DOM-free export also works in the language detector's Web Worker.
  resolve: {
    alias: {
      "decode-named-character-reference": fileURLToPath(
        new URL(
          "./node_modules/decode-named-character-reference/index.js",
          import.meta.url,
        ),
      ),
    },
  },
  plugins: [
    react(),
    {
      name: "du-metadata",
      transformIndexHtml: (html) =>
        html
          .replace("__APP_TITLE__", copy.files)
          .replace("__APP_LANGUAGE__", LANGUAGE)
          .replace("__THEME_COLOR__", themeColor),
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "manifest.webmanifest",
          source: JSON.stringify(appManifest, null, 2),
        });
      },
      configureServer(server) {
        server.middlewares.use("/manifest.webmanifest", (_req, res) => {
          res.setHeader("Content-Type", "application/manifest+json");
          res.end(JSON.stringify(appManifest));
        });
      },
    },
  ],
  css: { postcss: { plugins: [postcssCustomMedia()] } },
  server: { proxy: { "/api": "http://localhost:3000" } },
});
