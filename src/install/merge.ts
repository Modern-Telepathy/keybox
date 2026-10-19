/**
 * Installers merge into config the user already has. A Keybox entry is
 * replaced in place. Every other server, hook, and TOML table stays.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`Keybox could not parse ${path}. It was left unchanged.`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`Keybox could not merge ${path} because it is not a JSON object. It was left unchanged.`);
  }
  return parsed;
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

/** True when a hook command is one Keybox installed. */
export function isKeyboxCommand(command: unknown): boolean {
  return typeof command === "string" && command.includes("keybox") && command.includes("hook ");
}

export function mergeServerMap(
  existing: Record<string, unknown>,
  field: string,
  name: string,
  server: Record<string, unknown>,
): Record<string, unknown> {
  const map = isRecord(existing[field]) ? { ...existing[field] } : {};
  map[name] = server;
  return { ...existing, [field]: map };
}

interface HookGroup {
  hooks?: unknown[];
  [key: string]: unknown;
}

/**
 * Claude Code and Codex store hooks as event → matcher groups → handlers.
 * Drop earlier Keybox handlers, then append one command group for this event.
 */
export function mergeNestedHooks(
  existing: Record<string, unknown>,
  updates: Array<{ event: string; command: string }>,
): Record<string, unknown> {
  const hooks = isRecord(existing.hooks) ? { ...existing.hooks } : {};
  for (const update of updates) {
    const groups = Array.isArray(hooks[update.event]) ? (hooks[update.event] as HookGroup[]) : [];
    const kept = groups
      .map((group) => {
        const list = Array.isArray(group.hooks) ? group.hooks : [];
        return {
          ...group,
          hooks: list.filter((hook) => !(isRecord(hook) && isKeyboxCommand(hook.command))),
        };
      })
      .filter((group) => Array.isArray(group.hooks) && group.hooks.length > 0);
    hooks[update.event] = [...kept, { hooks: [{ type: "command", command: update.command }] }];
  }
  return { ...existing, hooks };
}

interface CursorHook {
  command?: string;
  [key: string]: unknown;
}

/** Cursor's hooks.json is event → flat command list, not nested groups. */
export function mergeCursorHooks(
  existing: Record<string, unknown>,
  updates: Record<string, CursorHook[]>,
): Record<string, unknown> {
  const hooks = isRecord(existing.hooks) ? { ...existing.hooks } : {};
  for (const [event, entries] of Object.entries(updates)) {
    const current = Array.isArray(hooks[event]) ? (hooks[event] as CursorHook[]) : [];
    const kept = current.filter((entry) => !(isRecord(entry) && isKeyboxCommand(entry.command)));
    hooks[event] = [...kept, ...entries];
  }
  return { ...existing, version: existing.version ?? 1, hooks };
}

/**
 * Replace one TOML table, from its header through the line before the next
 * header. Tables are identified by an exact header match, so
 * [mcp_servers.keybox] does not collide with [mcp_servers.other].
 */
export function upsertTomlTable(source: string, header: string, body: string[]): string {
  const normalized = source.replace(/\n$/, "");
  const lines = normalized ? normalized.split("\n") : [];
  const start = lines.findIndex((line) => line.trim() === header);
  const block = [header, ...body];
  if (start < 0) {
    const trimmed = source.replace(/\s*$/, "");
    return `${trimmed ? `${trimmed}\n\n` : ""}${block.join("\n")}\n`;
  }
  let end = start + 1;
  while (end < lines.length && !/^\s*\[/.test(lines[end])) end += 1;
  const next = [...lines.slice(0, start), ...block, ...lines.slice(end)];
  return `${next.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s*$/, "")}\n`;
}

/** Set one key inside a table, creating the table when it is absent. */
export function setTomlKeyInTable(source: string, header: string, key: string, literal: string): string {
  if (!source.split("\n").some((line) => line.trim() === header)) {
    return upsertTomlTable(source, header, [`${key} = ${literal}`]);
  }
  const lines = source.replace(/\n$/, "").split("\n");
  const start = lines.findIndex((line) => line.trim() === header);
  let end = start + 1;
  while (end < lines.length && !/^\s*\[/.test(lines[end])) end += 1;
  const section = lines.slice(start + 1, end);
  const keyRe = new RegExp(`^\\s*${key}\\s*=`);
  const index = section.findIndex((line) => keyRe.test(line));
  const assignment = `${key} = ${literal}`;
  if (index >= 0) section[index] = assignment;
  else section.unshift(assignment);
  return `${[...lines.slice(0, start + 1), ...section, ...lines.slice(end)].join("\n").replace(/\s*$/, "")}\n`;
}

export function tomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
