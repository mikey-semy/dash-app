import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const { imports } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
export const aliases = Object.fromEntries(
  Object.entries(imports).map(([name, target]) => [
    name.replace(/\/\*$/, ""),
    path.resolve(root, target.replace(/\/\*$/, "")),
  ]),
);

export function resolveProjectImport(file, specifier) {
  if (specifier.startsWith("."))
    return path.resolve(path.dirname(file), specifier);
  for (const [name, target] of Object.entries(aliases))
    if (specifier.startsWith(name + "/"))
      return path.resolve(target, specifier.slice(name.length + 1));
  return null;
}

export function importScope(file) {
  const parts = path.relative(root, path.resolve(file)).split(path.sep);
  if (parts[0] === "src") {
    if (parts[1] === "shared") return parts.slice(0, 3).join("/");
    if (parts[1] === "app") return "src/app";
    return parts.slice(0, 3).join("/");
  }
  if (["server", "shared"].includes(parts[0])) return parts[0];
  return null;
}
