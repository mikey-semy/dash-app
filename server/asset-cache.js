import express from "express";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const assetName = /^[\w][\w.-]*-[\w-]{8}\.[a-z0-9]+$/i;
const buildName = /^[a-f0-9]{40}$/;

export function legacyAssets(directory) {
  const serve = express.static(directory, {
    index: false,
    dotfiles: "deny",
    setHeaders: (response) =>
      response.setHeader(
        "Cache-Control",
        "public, max-age=31536000, immutable",
      ),
  });
  return (request, response, next) =>
    assetName.test(request.path.slice(1))
      ? serve(request, response, next)
      : next();
}

export async function cacheBuildAssets({
  source,
  directory,
  build,
  keep = 10,
}) {
  if (
    !source ||
    !directory ||
    !buildName.test(build) ||
    !Number.isInteger(keep) ||
    keep < 1
  )
    throw new Error("Invalid asset cache configuration");
  const cache = path.resolve(directory),
    manifests = path.join(cache, ".releases");
  await mkdir(manifests, { recursive: true });
  const assets = [];
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (!entry.isFile() || !assetName.test(entry.name)) continue;
    assets.push(entry.name);
    const target = path.join(cache, entry.name);
    try {
      await stat(target);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const temporary = path.join(cache, `.${entry.name}.${process.pid}.tmp`);
      await copyFile(path.join(source, entry.name), temporary);
      await rename(temporary, target);
    }
  }
  if (!assets.length) throw new Error("Build contains no hashed assets");
  const temporary = path.join(manifests, `${build}.tmp`);
  await writeFile(temporary, JSON.stringify(assets));
  await rename(temporary, path.join(manifests, `${build}.json`));
  const releases = await Promise.all(
    (await readdir(manifests))
      .filter(
        (name) =>
          buildName.test(name.replace(/\.json$/, "")) && name.endsWith(".json"),
      )
      .map(async (name) => ({
        name,
        modified: (await stat(path.join(manifests, name))).mtimeMs,
      })),
  );
  releases.sort(
    (a, b) =>
      b.modified - a.modified ||
      (a.name === `${build}.json`
        ? -1
        : b.name === `${build}.json`
          ? 1
          : a.name.localeCompare(b.name)),
  );
  const retained = new Set();
  for (const release of releases.slice(0, keep)) {
    const names = JSON.parse(
      await readFile(path.join(manifests, release.name), "utf8"),
    );
    if (
      !Array.isArray(names) ||
      names.some((name) => typeof name !== "string" || !assetName.test(name))
    )
      throw new Error("Invalid asset cache manifest");
    names.forEach((name) => retained.add(name));
  }
  for (const release of releases.slice(keep))
    await unlink(path.join(manifests, release.name));
  for (const entry of await readdir(cache, { withFileTypes: true }))
    if (
      entry.isFile() &&
      assetName.test(entry.name) &&
      !retained.has(entry.name)
    )
      await unlink(path.join(cache, entry.name));
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await cacheBuildAssets({
    source: process.argv[2],
    directory: process.argv[3],
    build: process.argv[4],
  });
