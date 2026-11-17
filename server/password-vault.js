import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
export function passwordVault(env) {
  const key = createHash("sha256")
    .update(
      "du-passwords-v1\0" +
        (env.S3_SECRET_KEY || "") +
        "\0" +
        (env.APP_SECRET || env.ADMIN_PASSWORD),
    )
    .digest();
  return {
    seal(id, password) {
      if (!password) return null;
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(id));
      return Buffer.concat([
        iv,
        cipher.update(password, "utf8"),
        cipher.final(),
        cipher.getAuthTag(),
      ]).toString("base64");
    },
    open(id, value) {
      if (!value) return null;
      try {
        const data = Buffer.from(value, "base64"),
          cipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
        cipher.setAAD(Buffer.from(id));
        cipher.setAuthTag(data.subarray(-16));
        return Buffer.concat([
          cipher.update(data.subarray(12, -16)),
          cipher.final(),
        ]).toString("utf8");
      } catch {
        return null;
      }
    },
  };
}
