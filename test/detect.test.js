import test from "node:test";
import assert from "node:assert/strict";
import { detect } from "#src/shared/lib/code/detect.js";
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

test("Markdown structure wins over false Gherkin matches without changing real feature files", () => {
  const markdown =
    "# План\n\n## Feature\n\n- Given список задач\n- When нажать кнопку\n- Then показать результат\n\n**Важно**: [проверить](https://example.com).\n";
  assert.equal(detect(markdown).label, "Markdown");
  assert.equal(
    detect(markdown, "text-20261116-123456789.dart").label,
    "Markdown",
  );
  assert.equal(detect(markdown, "docs/README.md").label, "Markdown");
  assert.equal(
    detect("void main() { print('hello'); }", "example.dart").label,
    "Dart",
  );
  assert.equal(
    detect(markdown, "text-20261116-123456789.feature").label,
    "Markdown",
  );
  const feature =
    "Feature: download\n  Scenario: valid files\n    Given uploaded files\n    When I download\n    Then I receive a ZIP\n";
  assert.equal(detect(feature, "download.feature").label, "Gherkin");
  assert.ok(!detect(feature).label.startsWith("Markdown"));
  assert.equal(
    detect("# Python comment\n\nvalue = 2\n", "program.py").label,
    "Python",
  );
});
