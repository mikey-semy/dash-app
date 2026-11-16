import { PIN_PATTERN } from "../shared/config.js";
import { mkdirSync } from "node:fs";
import { openDB } from "./core.js";
import { Store } from "./s3.js";
import { Service } from "./service.js";
import { createApp } from "./app.js";
for (const key of [
  "PUBLIC_URL",
  "ADMIN_PASSWORD",
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
])
  if (!process.env[key]) throw new Error("Missing " + key);
if (!PIN_PATTERN.test(process.env.ADMIN_PASSWORD))
  throw new Error("ADMIN_PASSWORD must contain exactly six digits");
mkdirSync("data", { recursive: true });
const service = new Service(openDB("data/flash.db"), new Store(process.env));
const app = createApp(service, process.env);
const server = app.listen(3000, () => console.log("Listening on port 3000"));
const tick = () =>
  service.tick().catch(() => console.error("Background task failed"));
tick();
const timer = setInterval(tick, 60000);
const refreshSites = () =>
  app.locals.hosting
    .refresh()
    .catch((error) => console.error("[DU] domain refresh", error));
refreshSites();
const sitesTimer = setInterval(refreshSites, 30000);
process.on("SIGTERM", () => {
  clearInterval(timer);
  clearInterval(sitesTimer);
  server.close(() => process.exit(0));
});
