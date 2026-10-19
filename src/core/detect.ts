/**
 * Find secret-shaped spans in composer text. Detection is conservative:
 * known vendor prefixes first, then high-entropy assignments. The goal is
 * to catch an accidental paste, not to classify every UUID as a key.
 */

import { inferProvider } from "./providers.js";
import type { DetectedSecret } from "./types.js";
import { HANDLE_RE } from "./types.js";

const KNOWN = String.raw`sk-ant-[A-Za-z0-9_-]{20,}|sk-(?:proj-|live-|svcacct-)?[A-Za-z0-9_-]{20,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{20,}|npm_[A-Za-z0-9]{20,}|xai-[A-Za-z0-9]{20,}`;

const ASSIGNMENT = /(?:api[_-]?key|secret|token|password|passwd|bearer)\s*[:=]\s*['"]?([A-Za-z0-9_\-./+]{16,})['"]?/gi;

const KNOWN_RE = new RegExp(KNOWN, "g");

export function looksLikeSecret(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 12) return false;
  if (inferProvider(trimmed)) return true;
  if (KNOWN_RE.test(trimmed)) return true;
  KNOWN_RE.lastIndex = 0;
  return entropy(trimmed) >= 3.5 && trimmed.length >= 20 && !/\s/.test(trimmed);
}

export function detectSecrets(text: string): DetectedSecret[] {
  const found: DetectedSecret[] = [];
  const occupied: Array<[number, number]> = [];

  const push = (raw: string, start: number, end: number) => {
    if (occupied.some(([a, b]) => start < b && end > a)) return;
    if (isInsideHandle(text, start, end)) return;
    occupied.push([start, end]);
    found.push({ raw, start, end, provider: inferProvider(raw) });
  };

  for (const match of text.matchAll(KNOWN_RE)) {
    if (match.index === undefined) continue;
    push(match[0], match.index, match.index + match[0].length);
  }

  for (const match of text.matchAll(ASSIGNMENT)) {
    const raw = match[1];
    if (!raw || match.index === undefined) continue;
    const start = match.index + match[0].lastIndexOf(raw);
    if (looksLikeSecret(raw)) push(raw, start, start + raw.length);
  }

  return found.sort((a, b) => a.start - b.start);
}

/**
 * Replace every detected secret with a callback result (a handle). Walks
 * right-to-left so earlier offsets stay valid.
 */
export function replaceSecrets(text: string, replace: (hit: DetectedSecret, index: number) => string): string {
  const hits = detectSecrets(text);
  let next = text;
  for (let i = hits.length - 1; i >= 0; i -= 1) {
    const hit = hits[i];
    next = next.slice(0, hit.start) + replace(hit, i) + next.slice(hit.end);
  }
  return next;
}

function isInsideHandle(text: string, start: number, end: number): boolean {
  HANDLE_RE.lastIndex = 0;
  for (const match of text.matchAll(HANDLE_RE)) {
    if (match.index === undefined) continue;
    const a = match.index;
    const b = a + match[0].length;
    if (start >= a && end <= b) return true;
  }
  return false;
}

function entropy(value: string): number {
  const freq = new Map<string, number>();
  for (const ch of value) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let sum = 0;
  for (const count of freq.values()) {
    const p = count / value.length;
    sum -= p * Math.log2(p);
  }
  return sum;
}
