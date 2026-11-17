import path from "node:path";
import { aliases, importScope, resolveProjectImport } from "./imports.mjs";

const layers = ["app", "pages", "widgets", "features", "entities", "shared"];

export function importViolation(file, specifier, { resource = false } = {}) {
  if (resource && specifier.startsWith("#"))
    return "Resource URLs must stay relative to import.meta.url.";
  const source = path.resolve(file);
  const target = resolveProjectImport(file, specifier);
  if (!target)
    return specifier.startsWith("#") ? "Unknown project import alias." : null;
  const root = path.resolve("src") + path.sep;
  const server = path.resolve("server") + path.sep;
  const common = path.resolve("shared") + path.sep;
  if (
    source.startsWith(common) &&
    (target.startsWith(root) || target.startsWith(server))
  )
    return "Shared policy must stay independent of client and server implementations.";
  if (source.startsWith(root) && target.startsWith(server))
    return "Client modules must not import server implementations.";
  if (
    source.startsWith(server) &&
    target.startsWith(root) &&
    /\.(js|jsx)$/.test(target)
  )
    return "Server modules must use root shared policy rather than client JavaScript.";
  if (!source.startsWith(root) || !target.startsWith(root))
    return importStyle(source, target, specifier, resource);
  const from = path.relative(root, source).split(path.sep);
  const to = path.relative(root, target).split(path.sep);
  const sourceLayer = layers.indexOf(from[0]);
  const targetLayer = layers.indexOf(to[0]);
  if (to[0] === "styles" && from[0] === "app")
    return importStyle(source, target, specifier, resource);
  if (sourceLayer < 0 || targetLayer < 0)
    return "Client modules must belong to an FSD layer.";
  if (targetLayer < sourceLayer)
    return "FSD imports must point to a lower layer.";
  const sliced = !["app", "shared"].includes(from[0]);
  if (sourceLayer === targetLayer && sliced && from[1] !== to[1])
    return "FSD slices on the same layer must not import each other.";
  if (
    !["app", "shared"].includes(to[0]) &&
    (sourceLayer !== targetLayer || from[1] !== to[1]) &&
    to.length !== 3
  )
    return "Import another slice through its public entry point.";
  return importStyle(source, target, specifier, resource);
}

function importStyle(source, target, specifier, resource) {
  if (resource || !importScope(source)) return null;
  const sameScope = importScope(source) === importScope(target);
  if (sameScope && specifier.startsWith("#"))
    return "Use relative imports inside the same slice or shared segment.";
  if (
    !sameScope &&
    specifier.startsWith(".") &&
    Object.values(aliases).some((root) => target.startsWith(root + path.sep))
  )
    return "Use a project alias across slices, shared segments or common policy.";
  return null;
}
