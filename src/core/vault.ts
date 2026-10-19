/**
 * The only process that is allowed to hold plaintext secrets. Callers ask
 * for metadata, seals, or a spend — never for the value itself. The vault
 * file is replaced atomically so a crash cannot leave a half-written box.
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decryptJson, encryptJson, loadMasterKey } from "./crypto.js";
import { inferProvider, slugFromProvider } from "./providers.js";
import { vaultPath } from "./paths.js";
import { formatHandle, type AuditEvent, type SealResult, type SecretRecord, type VaultFile, type VaultSettings } from "./types.js";

const DEFAULT_SETTINGS: VaultSettings = { openSpend: false };

function emptyVault(): VaultFile {
  return { version: 1, secrets: [], audit: [], settings: { ...DEFAULT_SETTINGS } };
}

function withSettings(vault: VaultFile): VaultFile {
  return { ...vault, settings: { ...DEFAULT_SETTINGS, ...vault.settings } };
}

function readVault(): VaultFile {
  const key = loadMasterKey();
  const path = vaultPath();
  if (!existsSync(path)) return emptyVault();
  return withSettings(decryptJson<VaultFile>(readFileSync(path), key));
}

function writeVault(vault: VaultFile): void {
  const key = loadMasterKey();
  const path = vaultPath();
  const tmp = join(tmpdir(), `keybox-${randomBytes(8).toString("hex")}.enc`);
  writeFileSync(tmp, encryptJson(vault, key), { mode: 0o600 });
  renameSync(tmp, path);
}

function uniqueName(vault: VaultFile, base: string): string {
  const taken = new Set(vault.secrets.map((s) => s.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function pruneExpired(vault: VaultFile): VaultFile {
  const now = Date.now();
  return {
    ...vault,
    secrets: vault.secrets.filter((s) => !s.expiresAt || Date.parse(s.expiresAt) > now),
  };
}

function audit(vault: VaultFile, event: Omit<AuditEvent, "at">): void {
  vault.audit.push({ at: new Date().toISOString(), ...event });
  vault.audit = vault.audit.slice(-200);
}

export function listPublicSecrets(): Array<{
  name: string;
  kind: SecretRecord["kind"];
  providerId?: string;
  hosts: string[];
  ephemeral: boolean;
  expiresAt?: string;
}> {
  return listPublicState().secrets;
}

export function listPublicState(): {
  openSpend: boolean;
  secrets: Array<{
    name: string;
    kind: SecretRecord["kind"];
    providerId?: string;
    hosts: string[];
    ephemeral: boolean;
    expiresAt?: string;
  }>;
} {
  const vault = pruneExpired(readVault());
  writeVault(vault);
  return {
    openSpend: vault.settings?.openSpend ?? false,
    secrets: vault.secrets.map(({ name, kind, providerId, hosts, ephemeral, expiresAt }) => ({
      name,
      kind,
      providerId,
      hosts,
      ephemeral,
      expiresAt,
    })),
  };
}

export function describeSecret(name: string) {
  return listPublicSecrets().find((s) => s.name === name) ?? null;
}

export function sealSecret(value: string, options: { name?: string; hosts?: string[]; ephemeral?: boolean; ttlHours?: number } = {}): SealResult {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Nothing to seal.");

  const vault = pruneExpired(readVault());
  const provider = inferProvider(trimmed);
  const base = options.name ?? slugFromProvider(provider);
  const name = uniqueName(vault, base);
  const now = new Date();
  const ephemeral = options.ephemeral ?? true;
  const ttlHours = options.ttlHours ?? 12;
  const record: SecretRecord = {
    id: randomBytes(8).toString("hex"),
    name,
    kind: provider?.kind ?? "other",
    providerId: provider?.id,
    value: trimmed,
    hosts: options.hosts ?? provider?.hosts ?? [],
    auth: provider?.auth ?? "bearer",
    header: provider?.header,
    queryParam: provider?.queryParam,
    createdAt: now.toISOString(),
    ephemeral,
    expiresAt: ephemeral ? new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString() : undefined,
  };
  vault.secrets.push(record);
  audit(vault, { action: "seal", secretName: name, detail: ephemeral ? "session grant" : "vault item" });
  writeVault(vault);
  return {
    name,
    handle: formatHandle(name),
    providerId: provider?.id,
    hosts: record.hosts,
    ephemeral,
  };
}

export function revokeSecret(name: string): boolean {
  const vault = readVault();
  const next = vault.secrets.filter((s) => s.name !== name);
  if (next.length === vault.secrets.length) return false;
  vault.secrets = next;
  audit(vault, { action: "revoke", secretName: name, detail: "revoked" });
  writeVault(vault);
  return true;
}

/** Internal: used only by the spender. Never expose this on MCP. */
export function unlockForSpend(name: string): SecretRecord | null {
  const vault = pruneExpired(readVault());
  const record = vault.secrets.find((s) => s.name === name) ?? null;
  if (record) {
    record.lastUsedAt = new Date().toISOString();
    writeVault(vault);
  }
  return record;
}

export function recordSpend(name: string, detail: string, action: AuditEvent["action"] = "spend"): void {
  const vault = readVault();
  audit(vault, { action, secretName: name, detail });
  writeVault(vault);
}

export function knownSecretValues(): string[] {
  return pruneExpired(readVault()).secrets.map((s) => s.value);
}

export function setHosts(name: string, hosts: string[]): boolean {
  const vault = readVault();
  const record = vault.secrets.find((s) => s.name === name);
  if (!record) return false;
  record.hosts = hosts;
  writeVault(vault);
  return true;
}

export function getSettings(): VaultSettings {
  return withSettings(readVault()).settings ?? { ...DEFAULT_SETTINGS };
}

export function isOpenSpend(): boolean {
  return getSettings().openSpend;
}

export function setOpenSpend(enabled: boolean): VaultSettings {
  const vault = readVault();
  vault.settings = { ...DEFAULT_SETTINGS, ...vault.settings, openSpend: enabled };
  audit(vault, {
    action: "config",
    secretName: "*",
    detail: enabled ? "open-spend on" : "open-spend off",
  });
  writeVault(vault);
  return vault.settings;
}
