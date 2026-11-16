import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
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
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:3000" } },
});
