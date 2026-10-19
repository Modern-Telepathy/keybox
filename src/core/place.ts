/**
 * Place a sealed secret into a fixed app store. Keybox holds the plaintext
 * and writes it itself. The model names a target and receives last-4 only.
 */

import { spawn } from "node:child_process";
import { parseHandleName } from "./types.js";
import { recordSpend, unlockForSpend } from "./vault.js";

export const PLACE_TARGETS = ["kosmos-openrouter"] as const;
export type PlaceTarget = (typeof PLACE_TARGETS)[number];

export interface PlaceResult {
  target: PlaceTarget;
  last4: string;
  length: number;
}

type Deliver = (secret: string) => Promise<void>;

const MARK = "\n__KEYBOX_SECRET__\n";

export async function placeSecret(handle: string, target: string, deliver: Deliver = deliverKosmosOpenRouter): Promise<PlaceResult> {
  if (!isPlaceTarget(target)) {
    throw new Error(`Unknown place target "${target}". Known: ${PLACE_TARGETS.join(", ")}`);
  }
  const name = parseHandleName(handle) ?? handle;
  const record = unlockForSpend(name);
  if (!record) {
    recordSpend(name, "unknown secret", "deny");
    throw new Error(`No sealed secret named "${name}".`);
  }
  if (!record.value.startsWith("sk-or-")) {
    recordSpend(name, "refused non-openrouter key", "deny");
    throw new Error(`«kb:${name}» is not an OpenRouter key.`);
  }

  try {
    await deliver(record.value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message.split(record.value).join("[redacted]"));
  }
  recordSpend(name, `placed into ${target}`, "place");
  return { target, last4: record.value.slice(-4), length: record.value.length };
}

function isPlaceTarget(target: string): target is PlaceTarget {
  return (PLACE_TARGETS as readonly string[]).includes(target);
}

function deliverKosmosOpenRouter(secret: string): Promise<void> {
  const remote = `
import json, subprocess, sys
from pathlib import Path
key = SECRET
if not key.startswith("sk-or-"):
    sys.exit("rejected")
canvas = Path("/var/lib/docker/volumes/agent-canvas-data/_data/settings.json")
data = json.loads(canvas.read_text())
llm = data["agent_settings"]["llm"]
llm["api_key"] = key
llm["model"] = "openrouter/anthropic/claude-sonnet-4.5"
llm["base_url"] = "https://openrouter.ai/api/v1"
canvas.write_text(json.dumps(data, indent=2) + "\\n")
canvas.chmod(0o600)
node = r"""
const crypto = require("crypto");
const fs = require("fs");
const key = fs.readFileSync(0, "utf8").trim();
const kek = crypto.createHash("sha256").update(process.env.ARCO_SECRETS_KEK, "utf8").digest();
function enc(aesKey, plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
  const ciphertext = Buffer.concat([c.update(plain), c.final()]);
  return { ciphertext, iv, tag: c.getAuthTag() };
}
function seal(plaintext) {
  const dek = crypto.randomBytes(32);
  const body = enc(dek, Buffer.from(plaintext, "utf8"));
  const wrap = enc(kek, dek);
  return {
    v: 1, keyId: "env:default",
    ciphertext: body.ciphertext.toString("base64"),
    iv: body.iv.toString("base64"),
    tag: body.tag.toString("base64"),
    wrappedDek: wrap.ciphertext.toString("base64"),
    wrapIv: wrap.iv.toString("base64"),
    wrapTag: wrap.tag.toString("base64"),
  };
}
const vaultPath = "/data/secrets.vault.json";
const vault = JSON.parse(fs.readFileSync(vaultPath, "utf8"));
const now = new Date().toISOString();
function upsert(id, name, envName) {
  const existing = vault.secrets.find((s) => s.id === id);
  const record = {
    id, name, scope: "llm", envName, last4: key.slice(-4), keyId: "env:default",
    createdAt: (existing && existing.createdAt) || now, updatedAt: now, sealed: seal(key),
  };
  if (existing) Object.assign(existing, record);
  else vault.secrets.push(record);
}
upsert("settings/llm-api-key", "LLM API key", "LLM_API_KEY");
upsert("settings/apiKeys/openrouter", "API key (openrouter)", "openrouter");
fs.writeFileSync(vaultPath, JSON.stringify(vault, null, 2));
fs.chmodSync(vaultPath, 0o600);
const settings = JSON.parse(fs.readFileSync("/data/settings.json", "utf8"));
settings.provider = "openrouter";
settings.model = "anthropic/claude-sonnet-4.5";
settings.baseUrl = "https://openrouter.ai/api/v1";
settings.apiKey = "";
settings.apiKeys = Object.assign({}, settings.apiKeys || {}, { openrouter: "" });
fs.writeFileSync("/data/settings.json", JSON.stringify(settings, null, 2));
process.stdout.write("sealed\\n");
"""
proc = subprocess.run(["docker", "exec", "-i", "kosmos-os-4600", "node", "-e", node], input=key.encode(), capture_output=True)
sys.stdout.buffer.write(proc.stdout)
sys.stderr.buffer.write(proc.stderr)
sys.exit(proc.returncode)
`;
  const bootstrap = `import sys\nblob = sys.stdin.read()\nsrc, secret = blob.split(${JSON.stringify(MARK)}, 1)\nexec(src, {"SECRET": secret})\n`;
  const command = `python3 -c "import base64; exec(base64.b64decode('${Buffer.from(bootstrap).toString("base64")}'))"`;
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", ["-o", "BatchMode=yes", "telepathy", command], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      err += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const scrubbedOut = out.split(secret).join("[redacted]");
      const scrubbedErr = err.split(secret).join("[redacted]");
      if (code !== 0 || !scrubbedOut.includes("sealed")) {
        reject(new Error(scrubbedErr.trim() || scrubbedOut.trim() || `place failed (${code})`));
        return;
      }
      resolve();
    });
    child.stdin.write(remote + MARK + secret);
    child.stdin.end();
  });
}
