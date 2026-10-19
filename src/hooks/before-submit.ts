/**
 * Send-time backstop. Hosts that can block a prompt call this before the
 * model sees the text. The prompt is rewritten to handles. The raw value
 * stays in the vault. The message the host shows is the safe prompt.
 */

import { sealText } from "../core/seal-text.js";
import { execFileSync } from "node:child_process";

export function handleBeforeSubmit(input: { prompt?: string }): { continue: boolean; user_message?: string } {
  const prompt = input.prompt ?? "";
  const { text, seals } = sealText(prompt);
  if (seals.length === 0) return { continue: true };

  const names = seals.map((s) => s.handle).join(", ");
  copySafe(text);
  return {
    continue: false,
    user_message:
      `Keybox sealed ${seals.length} secret${seals.length === 1 ? "" : "s"} (${names}) so it never reached the model. ` +
      `Send this instead:\n${text}`,
  };
}

function copySafe(text: string): void {
  const attempts: Array<[string, string[]]> =
    process.platform === "darwin"
      ? [["pbcopy", []]]
      : process.platform === "win32"
        ? [["clip", []]]
        : [
            ["wl-copy", []],
            ["xclip", ["-selection", "clipboard"]],
          ];
  for (const [command, args] of attempts) {
    try {
      execFileSync(command, args, { input: text });
      return;
    } catch {
      // Clipboard is a convenience. The hook message still carries the safe prompt.
    }
  }
}
