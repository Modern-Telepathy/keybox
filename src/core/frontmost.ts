/**
 * Electron apps (Cursor's composer included) rarely expose selected text
 * through Accessibility. The reliable move is: copy, seal, paste. This
 * requires macOS Accessibility permission for System Events.
 */

import { execFileSync } from "node:child_process";
import { sealText, sealValue } from "./seal-text.js";
import { looksLikeSecret } from "./detect.js";

function runOsa(source: string): string {
  return execFileSync("osascript", ["-e", source], { encoding: "utf8" });
}

function clipboard(): string {
  return execFileSync("pbpaste", { encoding: "utf8" });
}

function setClipboard(value: string): void {
  execFileSync("pbcopy", { input: value });
}

export function sealFrontmostSelection(): { handle: string; rewritten?: string; name: string } {
  if (process.platform !== "darwin") {
    throw new Error("Highlight-to-seal in the composer needs macOS. Use: keybox seal --clipboard");
  }

  const previous = clipboard();
  runOsa('tell application "System Events" to keystroke "c" using command down');
  sleep(180);
  const selected = clipboard();

  if (!selected || selected === previous) {
    if (previous && looksLikeSecret(previous)) {
      const sealed = sealValue(previous);
      setClipboard(sealed.handle);
      return { handle: sealed.handle, name: sealed.name };
    }
    throw new Error("Could not read a selection. Highlight the secret, then press ⌘⌥L again.");
  }

  const { text, seals } = looksLikeSecret(selected) || detectAny(selected)
    ? multiOrSingle(selected)
    : { text: undefined, seals: [sealValue(selected)] };

  const handle = seals[0]?.handle;
  if (!handle) throw new Error("Nothing to seal.");

  setClipboard(text ?? handle);
  sleep(80);
  runOsa('tell application "System Events" to keystroke "v" using command down');
  return { handle, rewritten: text, name: seals[0].name };
}

function detectAny(selected: string): boolean {
  return selected.includes("sk-") || selected.includes("ghp_") || selected.includes("_key");
}

function multiOrSingle(selected: string) {
  const result = sealText(selected);
  if (result.seals.length === 0) {
    const sealed = sealValue(selected);
    return { text: sealed.handle, seals: [sealed] };
  }
  return { text: result.text, seals: result.seals };
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
