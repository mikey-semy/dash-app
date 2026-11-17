import mime from "mime-types";
import { resourceName } from "#common/resource-name.js";
export { resourceName };
export function resourceType(name, destination = "") {
  const clean = resourceName(name),
    base = clean.split("/").pop();
  let extension = base.split(".").pop().toLowerCase();
  if (
    destination === "script" ||
    /^(?:ScriptResource(?:\(\d+\))?|WebResource)\.axd$/i.test(base)
  )
    extension = "js";
  if (destination === "style") extension = "css";
  const type =
    extension === "js" || extension === "mjs" || extension === "cjs"
      ? "application/javascript"
      : mime.lookup(extension) || "application/octet-stream";
  return { extension, type };
}
