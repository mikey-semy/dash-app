import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import { aliases, resolveProjectImport } from "../tooling/imports.mjs";
import { unusedImports } from "../tooling/unused-imports.mjs";

test("Node, Vite and editor aliases resolve to the same project files", () => {
  const config = JSON.parse(
    readFileSync(new URL("../jsconfig.json", import.meta.url), "utf8"),
  );
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(
    Object.keys(config.compilerOptions.paths).sort(),
    Object.keys(pkg.imports).sort(),
  );
  for (const name of Object.keys(aliases))
    assert.deepEqual(config.compilerOptions.paths[name + "/*"], [
      pkg.imports[name + "/*"],
    ]);
  for (const name of ["#src/shared/lib/password.js", "#common/config.js"]) {
    assert.equal(
      fileURLToPath(import.meta.resolve(name)),
      resolveProjectImport("src/app/main.jsx", name),
    );
  }
});

test("unused imports distinguish JSX, namespaces, re-exports and shadowed names", () => {
  const source = `
    import React, { useState, Component } from "react";
    import Button from "./Button.jsx";
    import * as icons from "./icons.js";
    import { shared } from "./shared.js";
    import { shadowed } from "./other.js";
    import "./setup.js";
    export { shared };
    export class Boundary extends Component {}
    export function View() { return <Button><icons.Check /></Button>; }
    export function local(shadowed) { return shadowed; }
  `;
  const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });
  assert.deepEqual(
    unusedImports(ast)
      .map((node) => node.name)
      .sort(),
    ["React", "shadowed", "useState"],
  );
});
