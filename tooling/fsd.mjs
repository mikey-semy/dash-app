import path from "node:path";

const layers = ["app", "pages", "widgets", "features", "entities", "shared"];

export function importViolation(file, specifier) {
  if (!specifier.startsWith(".")) return null;
  const source = path.resolve(file);
  const target = path.resolve(path.dirname(source), specifier);
  const root = path.resolve("src") + path.sep;
  const server = path.resolve("server") + path.sep;
  if (source.startsWith(root) && target.startsWith(server))
    return "Client modules must not import server implementations.";
  if (
    source.startsWith(server) &&
    target.startsWith(root) &&
    /\.(js|jsx)$/.test(target)
  )
    return "Server modules must use root shared policy rather than client JavaScript.";
  if (!source.startsWith(root) || !target.startsWith(root)) return null;
  const from = path.relative(root, source).split(path.sep);
  const to = path.relative(root, target).split(path.sep);
  const sourceLayer = layers.indexOf(from[0]);
  const targetLayer = layers.indexOf(to[0]);
  if (to[0] === "styles" && from[0] === "app") return null;
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
  return null;
}
