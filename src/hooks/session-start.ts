/**
 * Remind the agent, once per chat, that secrets arrive as «kb:name»
 * handles and are spent with http_request — never requested in plaintext.
 */

import { listPublicState } from "../core/vault.js";

export function handleSessionStart(): { additional_context: string } {
  const { openSpend, secrets } = listPublicState();
  const lines = secrets.length
    ? secrets.map((s) => `- «kb:${s.name}» hosts=${s.hosts.join(",") || "(none)"}`).join("\n")
    : "(none yet — the user seals a secret with ⌘⌥L on macOS, Keybox: Seal Key in an editor, or keybox seal)";

  const spendRule = openSpend
    ? "Open-spend is ON: you may call any HTTPS URL with a sealed handle. The value is still never returned to you."
    : "Open-spend is OFF: only call hosts listed on that secret. If a host is missing, ask the user to `keybox allow <name> <host>` or enable open-spend.";

  return {
    additional_context: [
      "Keybox is active. Never ask the user to paste a raw API key, password, or token.",
      "If they grant a secret you will see a handle like «kb:openai». Spend it with the Keybox http_request tool.",
      "There is no way to read the underlying value. Do not try.",
      spendRule,
      `Available secrets:\n${lines}`,
    ].join("\n"),
  };
}
