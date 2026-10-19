/**
 * Seal every secret-shaped span in a block of text and return the rewritten
 * string plus the grants we created. Used by highlight-to-seal, clipboard
 * seal, and the send-time backstop (which cannot rewrite the composer, so
 * it copies this result for the user to paste).
 */

import { detectSecrets, replaceSecrets } from "./detect.js";
import { sealSecret } from "./vault.js";
import type { DetectedSecret, SealResult } from "./types.js";

export function sealText(text: string, ephemeral = true): { text: string; seals: SealResult[]; hits: DetectedSecret[] } {
  const hits = detectSecrets(text);
  const seals: SealResult[] = [];
  const rewritten = replaceSecrets(text, (hit) => {
    const sealed = sealSecret(hit.raw, { ephemeral, name: hit.provider?.id });
    seals.push(sealed);
    return sealed.handle;
  });
  return { text: rewritten, seals, hits };
}

export function sealValue(value: string, options: { name?: string; hosts?: string[]; ephemeral?: boolean } = {}): SealResult {
  return sealSecret(value, { ephemeral: options.ephemeral ?? true, ...options });
}
