/**
 * All Keybox state lives under ~/.keybox. The vault file is ciphertext;
 * the master key is in the OS keychain (macOS) or a 0600 sidecar file.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

export function keyboxHome(): string {
  const dir = process.env.KEYBOX_HOME ?? join(homedir(), ".keybox");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function vaultPath(): string {
  return join(keyboxHome(), "vault.json.enc");
}

export function masterKeyPath(): string {
  return join(keyboxHome(), "master.key");
}
