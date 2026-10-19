/**
 * AES-256-GCM with a random 32-byte master key. The key never goes in the
 * vault file. On macOS we keep it in the login keychain via `security`;
 * everywhere else it is a 0600 file under ~/.keybox.
 */

import { execFileSync } from "node:child_process";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { masterKeyPath } from "./paths.js";

const SERVICE = "keybox";
const ACCOUNT = "vault-master";

export function loadMasterKey(): Buffer {
  if (process.platform === "darwin") {
    try {
      const hex = execFileSync(
        "security",
        ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"],
        { encoding: "utf8" },
      ).trim();
      if (hex) return Buffer.from(hex, "hex");
    } catch {
      // First run — create one below.
    }
    const key = randomBytes(32);
    execFileSync("security", [
      "add-generic-password",
      "-U",
      "-s",
      SERVICE,
      "-a",
      ACCOUNT,
      "-w",
      key.toString("hex"),
    ]);
    return key;
  }

  const path = masterKeyPath();
  if (existsSync(path)) return readFileSync(path);
  const key = randomBytes(32);
  writeFileSync(path, key, { mode: 0o600 });
  chmodSync(path, 0o600);
  return key;
}

export function encryptJson(value: unknown, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

export function decryptJson<T>(blob: Buffer, key: Buffer): T {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ciphertext = blob.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
