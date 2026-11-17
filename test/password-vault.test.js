import test from "node:test";
import assert from "node:assert/strict";
import { passwordVault } from "../server/password-vault.js";
test("stable application secret preserves existing transfer passwords when sign-in changes", () => {
  const original = {
    ADMIN_PASSWORD: "123456",
    S3_SECRET_KEY: "fixture-storage-secret",
  };
  const old = passwordVault(original),
    sealed = old.seal("fixture-id", "654321");
  const rotated = passwordVault({
    ...original,
    ADMIN_PASSWORD: "four",
    APP_SECRET: original.ADMIN_PASSWORD,
  });
  assert.equal(rotated.open("fixture-id", sealed), "654321");
  assert.equal(
    old.open("fixture-id", rotated.seal("fixture-id", "987654")),
    "987654",
  );
  assert.equal(rotated.open("other-id", sealed), null);
});
