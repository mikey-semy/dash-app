import { copy } from "./copy.js";
import { LANGUAGE } from "./config.js";

export const manifest = Object.freeze({
  id: "/",
  name: copy.files,
  short_name: copy.files,
  lang: LANGUAGE,
  start_url: "/",
  scope: "/",
  display: "standalone",
  icons: [192, 512].map((size) => ({
    src: `/icon-${size}.png`,
    sizes: `${size}x${size}`,
    type: "image/png",
    purpose: "any maskable",
  })),
});
