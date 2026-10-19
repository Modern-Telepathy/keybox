/**
 * Shared shapes for Keybox. A Secret is what we store; a Handle is what the
 * model is allowed to see. If a field would let the model reconstruct the
 * value, it does not belong on any agent-facing type.
 */

export type SecretKind = "api_key" | "password" | "token" | "other";

export type AuthStyle = "bearer" | "header" | "basic" | "query";

export interface Provider {
  id: string;
  label: string;
  kind: SecretKind;
  /** Hostnames this secret may be sent to. Deny-by-default outside this list. */
  hosts: string[];
  auth: AuthStyle;
  header?: string;
  queryParam?: string;
}

export interface SecretRecord {
  id: string;
  name: string;
  kind: SecretKind;
  providerId?: string;
  /** Ciphertext lives only inside the vault file; this field is plaintext in memory. */
  value: string;
  hosts: string[];
  auth: AuthStyle;
  header?: string;
  queryParam?: string;
  createdAt: string;
  lastUsedAt?: string;
  /** Session grants die; vault items do not. */
  ephemeral: boolean;
  expiresAt?: string;
}

export interface VaultSettings {
  /**
   * When true, spend may target any HTTPS (or localhost) URL.
   * The model still never receives the secret value. Host allowlists
   * become advisory. Off by default — this is the confused-deputy tradeoff.
   */
  openSpend: boolean;
}

export interface VaultFile {
  version: 1;
  secrets: SecretRecord[];
  audit: AuditEvent[];
  settings?: VaultSettings;
}

export interface AuditEvent {
  at: string;
  action: "seal" | "spend" | "deny" | "list" | "revoke" | "config" | "place";
  secretName: string;
  detail: string;
}

export interface DetectedSecret {
  raw: string;
  start: number;
  end: number;
  provider?: Provider;
}

export interface SealResult {
  name: string;
  handle: string;
  providerId?: string;
  hosts: string[];
  ephemeral: boolean;
}

export const HANDLE_RE = /(?:«kb:([a-z0-9][a-z0-9-]*)»|\[kb:([a-z0-9][a-z0-9-]*)\]|kb:\/\/([a-z0-9][a-z0-9-]*))/gi;

export function parseHandleName(handle: string): string | null {
  const match = /^(?:«kb:([a-z0-9][a-z0-9-]*)»|\[kb:([a-z0-9][a-z0-9-]*)\]|kb:\/\/([a-z0-9][a-z0-9-]*)|kb:([a-z0-9][a-z0-9-]*))$/i.exec(
    handle.trim(),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? match?.[4] ?? null;
}

export function formatHandle(name: string): string {
  return `«kb:${name}»`;
}
