import test from "node:test";
import assert from "node:assert/strict";
import { detect } from "../src/detect.js";
test("automatic language identification uses filename, shebang, JSON and a plain-text fallback", () => {
  for (const [name, code, language] of [
    ["example.py", 'print("Привет")', "Python"],
    ["example.js", "const x=1;", "JavaScript"],
    ["config.json", "{}", "JSON"],
    ["query.sql", "select 1", "SQL"],
    ["script.ps1", "$x=1", "PowerShell"],
    ["script.sh", "echo hello", "Shell"],
  ])
    assert.equal(detect(code, name).label, language);
  assert.equal(detect("#!/usr/bin/env python3\nprint(1)").label, "Python");
  assert.equal(detect("#!/bin/bash\necho hello").label, "Shell");
  assert.equal(detect('{"message":"Привет 🌍"}').label, "JSON");
  assert.equal(detect("Привет, забери ключи вечером.").label, "?");
  assert.equal(detect("").label, "?");
});
