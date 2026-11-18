// Shared product policy. Keep component state and implementation details local.
export const UPLOAD_TRANSFER = Object.freeze({
  concurrency: 4,
  retries: 2,
  retryDelay: 500,
  idleTimeout: 120000,
});
export const PART = 8 * 1024 * 1024;
export const ARCHIVE_TRANSFER = Object.freeze({ concurrency: 2 });
export const LIMIT = 2_000_000_000;
export const QUOTA = 20_000_000_000;
export const TEXT_LIMIT = 5 * 1024 * 1024;
export const MAX_FILES = 100;
export const DEFAULT_RETENTION = 86400;
export const RETENTION_SECONDS = Object.freeze([
  0, 3600, 21600, 86400, 259200, 604800,
]);
export const LOCALE = "en-GB";
export const LANGUAGE = "en";
export const TIME_ZONE = "Europe/Moscow";
export const PIN_DIGITS = 6;
export const PIN_PATTERN = new RegExp(`^\\d{${PIN_DIGITS}}$`);
export const UI = Object.freeze({
  iconSize: 18,
  iconStroke: 1.4,
  settingsIconSize: 22,
  dropIconSize: 28,
});
export const TIMING = Object.freeze({
  feedback: 1500,
  multiClick: 350,
  confirmation: 4000,
  dialogClose: 180,
  detectionDebounce: 300,
  detectionTimeout: 2000,
  workerStartup: 15000,
});
