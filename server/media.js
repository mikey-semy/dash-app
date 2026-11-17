import { resourceName } from "#common/resource-name.js";
const types = {
  svg: ["image", "image/svg+xml"],
  png: ["image", "image/png"],
  jpg: ["image", "image/jpeg"],
  jpeg: ["image", "image/jpeg"],
  gif: ["image", "image/gif"],
  webp: ["image", "image/webp"],
  avif: ["image", "image/avif"],
  bmp: ["image", "image/bmp"],
  pdf: ["pdf", "application/pdf"],
  mp4: ["video", "video/mp4"],
  webm: ["video", "video/webm"],
  mov: ["video", "video/quicktime"],
  mp3: ["audio", "audio/mpeg"],
  wav: ["audio", "audio/wav"],
  m4a: ["audio", "audio/mp4"],
  ogg: ["audio", "audio/ogg"],
  opus: ["audio", "audio/ogg"],
  flac: ["audio", "audio/flac"],
};
export const mediaType = (file) =>
  types[
    resourceName(file?.name || "")
      .split(".")
      .pop()
      ?.toLowerCase()
  ] || null;
