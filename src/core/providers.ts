/**
 * Guess a provider from a secret's shape so a mid-chat seal can pick hosts
 * and an auth header without asking. Unknown values stay unspendable until
 * the user attaches a host — we never default to "call anywhere."
 */

import type { Provider } from "./types.js";

export const PROVIDERS: Provider[] = [
  {
    id: "openai",
    label: "OpenAI",
    kind: "api_key",
    hosts: ["api.openai.com"],
    auth: "bearer",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    kind: "api_key",
    hosts: ["api.anthropic.com"],
    auth: "header",
    header: "x-api-key",
  },
  {
    id: "github",
    label: "GitHub",
    kind: "token",
    hosts: ["api.github.com", "github.com"],
    auth: "bearer",
  },
  {
    id: "stripe",
    label: "Stripe",
    kind: "api_key",
    hosts: ["api.stripe.com"],
    auth: "bearer",
  },
  {
    id: "slack",
    label: "Slack",
    kind: "token",
    hosts: ["slack.com", "www.slack.com"],
    auth: "bearer",
  },
  {
    id: "google",
    label: "Google",
    kind: "api_key",
    hosts: ["generativelanguage.googleapis.com", "www.googleapis.com"],
    auth: "query",
    queryParam: "key",
  },
  {
    id: "npm",
    label: "npm",
    kind: "token",
    hosts: ["registry.npmjs.org"],
    auth: "bearer",
  },
];

const PREFIX_RULES: Array<{ test: (value: string) => boolean; id: string }> = [
  { id: "openai", test: (v) => /^sk-(proj-|live-|svcacct-)?[A-Za-z0-9_-]{16,}$/.test(v) && !v.startsWith("sk-ant-") },
  { id: "anthropic", test: (v) => v.startsWith("sk-ant-") },
  { id: "github", test: (v) => /^(ghp_|gho_|ghu_|ghs_|github_pat_)/.test(v) },
  { id: "stripe", test: (v) => /^(sk|rk|pk)_(live|test)_/.test(v) },
  { id: "slack", test: (v) => /^(xox[baprs]-)/.test(v) },
  { id: "google", test: (v) => /^AIza[0-9A-Za-z_-]{20,}$/.test(v) },
  { id: "npm", test: (v) => /^npm_[A-Za-z0-9]{20,}$/.test(v) },
];

export function findProvider(id: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function inferProvider(value: string): Provider | undefined {
  const trimmed = value.trim();
  const rule = PREFIX_RULES.find((r) => r.test(trimmed));
  return rule ? findProvider(rule.id) : undefined;
}

export function slugFromProvider(provider?: Provider, fallback = "secret"): string {
  return provider?.id ?? fallback;
}
