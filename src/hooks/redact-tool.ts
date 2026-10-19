/**
 * Belt-and-suspenders: if any tool result still contains a known secret
 * value, replace the payload the model will see.
 */

import { knownSecretValues } from "../core/vault.js";
import { redactJson, redactSecrets } from "../core/redact.js";

export function handleRedactTool(input: {
  tool_output?: string;
  result_json?: string;
}): { updated_mcp_tool_output?: unknown; additional_context?: string } {
  const secrets = knownSecretValues();
  if (secrets.length === 0) return {};

  const raw = input.result_json ?? input.tool_output;
  if (!raw) return {};

  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const redacted = redactSecrets(raw, secrets);
    if (redacted === raw) return {};
    return { updated_mcp_tool_output: { text: redacted } };
  }

  const redacted = redactJson(parsed, secrets);
  if (JSON.stringify(redacted) === JSON.stringify(parsed)) return {};
  return { updated_mcp_tool_output: redacted };
}
