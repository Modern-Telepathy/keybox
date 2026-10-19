/**
 * The only way a secret leaves the vault: attached to an outbound HTTPS
 * request Keybox makes itself. The model supplies a handle, method, and
 * path. If the host is not on the secret's allowlist, we refuse.
 */

import { isOpenSpend, knownSecretValues, recordSpend, unlockForSpend } from "./vault.js";
import { redactJson } from "./redact.js";
import { parseHandleName } from "./types.js";

const MAX_BODY = 1_000_000;

export interface SpendRequest {
  secret: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export async function spendHttp(req: SpendRequest): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
  const name = parseHandleName(req.secret) ?? req.secret;
  const record = unlockForSpend(name);
  if (!record) {
    recordSpend(name, "unknown secret", "deny");
    throw new Error(`No sealed secret named "${name}".`);
  }
  const openSpend = isOpenSpend();
  if (!openSpend && record.hosts.length === 0) {
    recordSpend(name, "no hosts configured", "deny");
    throw new Error(`Secret «kb:${name}» has no allowed hosts. Run: keybox allow ${name} <host>  (or: keybox config open-spend on)`);
  }

  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    throw new Error("Invalid URL.");
  }

  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) {
    recordSpend(name, `blocked protocol ${url.protocol}`, "deny");
    throw new Error("Only HTTPS (or localhost HTTP) is allowed.");
  }

  if (!openSpend && !hostAllowed(url.hostname, record.hosts)) {
    recordSpend(name, `blocked host ${url.hostname}`, "deny");
    throw new Error(`Host ${url.hostname} is not allowed for «kb:${name}». Allowed: ${record.hosts.join(", ")}`);
  }

  const headers = new Headers(req.headers ?? {});
  // Agent-supplied auth is dropped so it cannot exfiltrate by setting a second header.
  headers.delete("authorization");
  headers.delete("x-api-key");
  applyAuth(headers, url, record);

  const method = req.method.toUpperCase();
  const init: RequestInit = { method, headers };
  if (req.body !== undefined && method !== "GET" && method !== "HEAD") {
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    init.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }

  const response = await fetch(url, init);
  const raw = Buffer.from(await response.arrayBuffer());
  const clipped = raw.subarray(0, MAX_BODY);
  const text = clipped.toString("utf8");
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // keep text
  }

  const secrets = knownSecretValues();
  recordSpend(name, `${method} ${url.host}${url.pathname} → ${response.status}`);

  const outHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    if (!["set-cookie", "authorization", "x-api-key"].includes(key.toLowerCase())) {
      outHeaders[key] = value;
    }
  });

  return {
    status: response.status,
    headers: outHeaders,
    body: redactJson(parsed, secrets),
  };
}

function hostAllowed(hostname: string, hosts: string[]): boolean {
  const host = hostname.toLowerCase();
  return hosts.some((allowed) => {
    const a = allowed.toLowerCase();
    return host === a || host.endsWith(`.${a}`);
  });
}

function applyAuth(headers: Headers, url: URL, record: { value: string; auth: string; header?: string; queryParam?: string }): void {
  switch (record.auth) {
    case "header":
      headers.set(record.header ?? "x-api-key", record.value);
      break;
    case "basic":
      headers.set("authorization", `Basic ${Buffer.from(record.value).toString("base64")}`);
      break;
    case "query":
      url.searchParams.set(record.queryParam ?? "key", record.value);
      break;
    default:
      headers.set("authorization", `Bearer ${record.value}`);
  }
}
