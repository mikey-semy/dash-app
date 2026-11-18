import { mkdirSync } from "node:fs";
import { openDB, PART } from "./core.js";
import { UPLOAD_TRANSFER, UPLOAD_TUNING } from "#common/config.js";
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
if (process.env.ADMIN_PASSWORD.length > 256)
  throw new Error("ADMIN_PASSWORD exceeds 256 characters");
mkdirSync("data", { recursive: true });
function readInteger(name, fallback, min, max) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return value;
}
const mib = 1024 * 1024;
const service = new Service(openDB("data/flash.db"), new Store(process.env), {
  concurrency: readInteger(
    "UPLOAD_CONCURRENCY",
    UPLOAD_TRANSFER.concurrency,
    UPLOAD_TUNING.minConcurrency,
    UPLOAD_TUNING.maxConcurrency,
  ),
  partSize:
    mib *
    readInteger(
      "UPLOAD_PART_MIB",
      PART / mib,
      UPLOAD_TUNING.minPartMiB,
      UPLOAD_TUNING.maxPartMiB,
    ),
});
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
