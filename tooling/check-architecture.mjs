import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parse } from "@babel/parser";
import postcss from "postcss";
import { importViolation } from "./fsd.mjs";

const failures = [];
const files = async (directory) =>
  (
    await Promise.all(
      (await readdir(directory, { withFileTypes: true })).map((entry) =>
        entry.isDirectory()
          ? files(path.join(directory, entry.name))
          : path.join(directory, entry.name),
      ),
    )
  ).flat();
function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "extra", "comments", "tokens"].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((item) => walk(item, visit));
    else if (value && typeof value === "object") walk(value, visit);
  }
}
const fail = (file, node, message) =>
  failures.push(
    `${file}:${node.loc?.start.line || node.source?.start.line || 1}: ${message}`,
  );
for (const directory of ["src", "server", "shared"]) {
  for (const file of await files(directory)) {
    if (!/\.(js|jsx)$/.test(file)) continue;
    const source = await readFile(file, "utf8");
    const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });
    walk(ast, (node) => {
      const dependency = [
        "ImportDeclaration",
        "ExportNamedDeclaration",
        "ExportAllDeclaration",
        "ImportExpression",
      ].includes(node.type)
        ? node.source
        : node.type === "NewExpression" && node.callee.name === "URL"
          ? node.arguments[0]
          : null;
      if (dependency?.type === "StringLiteral") {
        const violation = importViolation(file, dependency.value);
        if (violation) fail(file, node, violation);
      }
      if (node.type === "StringLiteral" && /[А-Яа-яЁё]/.test(node.value))
        fail(
          file,
          node,
          "Product strings must come from the English dictionary.",
        );
      if (node.type === "TemplateElement" && /[А-Яа-яЁё]/.test(node.value.raw))
        fail(file, node, "Product templates must use the English dictionary.");
      if (node.type === "JSXText" && /[A-Za-zА-Яа-яЁё]/.test(node.value))
        fail(file, node, "Move visible copy to shared/copy.js.");
      if (
        node.type === "JSXAttribute" &&
        ["aria-label", "title", "placeholder", "alt"].includes(
          node.name?.name,
        ) &&
        node.value?.type === "StringLiteral" &&
        /[A-Za-zА-Яа-яЁё]/.test(node.value.value)
      )
        fail(
          file,
          node,
          "Move accessible names and tooltips to shared/copy.js.",
        );
      if (node.type === "StringLiteral" && /^#[\da-f]{3,8}$/i.test(node.value))
        fail(file, node, "Read colors from CSS design tokens.");
      if (
        node.type === "JSXOpeningElement" &&
        node.name?.name === "button" &&
        node.attributes.some(
          (attribute) =>
            attribute.name?.name === "className" &&
            source
              .slice(attribute.start, attribute.end)
              .includes("icon-button"),
        ) &&
        !file.endsWith("IconButton.jsx")
      )
        fail(file, node, "Use the shared IconButton component.");
      if (
        node.type === "ImportDeclaration" &&
        directory === "shared" &&
        /(?:src|server)\//.test(node.source.value)
      )
        fail(
          file,
          node,
          "Shared policy must stay independent of client and server implementations.",
        );
    });
  }
}
const cssFiles = (await files("src/styles")).filter((file) =>
  file.endsWith(".css"),
);
const definitions = new Set();
for (const file of cssFiles)
  postcss
    .parse(await readFile(file, "utf8"), { from: file })
    .walkDecls((declaration) => {
      if (declaration.prop.startsWith("--")) definitions.add(declaration.prop);
    });
for (const file of cssFiles) {
  if (file.endsWith("tokens.css")) continue;
  const sheet = postcss.parse(await readFile(file, "utf8"), { from: file });
  sheet.walkDecls((declaration) => {
    if (
      declaration.parent.type === "atrule" &&
      declaration.parent.name === "font-face"
    )
      return;
    for (const match of declaration.value.matchAll(/var\((--[\w-]+)/g))
      if (!definitions.has(match[1]))
        fail(file, declaration, `Undefined design token ${match[1]}.`);
    const value = declaration.value.replace(/var\([^)]*\)/g, "");
    if (
      /#[\da-f]{3,8}\b/i.test(value) ||
      /(?:^|[^\w-])(?:\d*\.)?\d+px\b/.test(value)
    )
      fail(
        file,
        declaration,
        "Move colors and fixed dimensions to tokens.css.",
      );
    if (
      ["font-size", "font-family", "font-weight", "border-radius"].includes(
        declaration.prop,
      ) &&
      value.trim() &&
      !["inherit", "normal"].includes(value.trim())
    )
      fail(file, declaration, "Use a typography or radius token.");
  });
  sheet.walkAtRules("media", (rule) => {
    if (/\d+px/.test(rule.params))
      fail(file, rule, "Use a custom media definition from tokens.css.");
  });
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    "Architecture checks passed: English copy, shared controls, dependency boundaries and design tokens.",
  );
