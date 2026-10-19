/**
 * Codex install. MCP servers live in config.toml under [mcp_servers.*].
 * Hooks use the same event names as Claude Code and are loaded from
 * hooks.json only when features.hooks is true, so the installer sets that
 * flag without removing other feature keys.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mergeNestedHooks, readJson, setTomlKeyInTable, tomlString, upsertTomlTable, writeJson } from "./merge.js";
import { ensureRuntime, hookCommand, installSkill, resolveInstall, type InstallOptions } from "./runtime.js";

export function installCodex(options: InstallOptions = {}): string {
  const env = ensureRuntime(resolveInstall(import.meta.url, options));
  const dir = join(env.home, ".codex");
  mkdirSync(dir, { recursive: true });

  const configPath = join(dir, "config.toml");
  const current = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  const withServer = upsertTomlTable(current, "[mcp_servers.keybox]", [
    `command = ${tomlString(env.node)}`,
    `args = [${tomlString(env.cli)}, "mcp"]`,
  ]);
  const withHooks = setTomlKeyInTable(withServer, "[features]", "hooks", "true");
  writeFileSync(configPath, withHooks);

  const hooksPath = join(dir, "hooks.json");
  writeJson(
    hooksPath,
    mergeNestedHooks(readJson(hooksPath), [
      { event: "UserPromptSubmit", command: hookCommand(env, "before-submit", "codex") },
      { event: "SessionStart", command: hookCommand(env, "session-start", "codex") },
      { event: "PostToolUse", command: hookCommand(env, "redact-tool", "codex") },
    ]),
  );

  installSkill(env.repoRoot, join(dir, "skills", "keybox"));
  return configPath;
}
