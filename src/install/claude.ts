/**
 * Claude install covers two apps that share a vault and do not share a
 * hook system. Claude Code gets UserPromptSubmit, SessionStart, and
 * PostToolUse. Claude Desktop only gets the MCP server — its config has
 * no prompt hook, so the user seals before sending.
 */

import { join } from "node:path";
import { mergeNestedHooks, mergeServerMap, readJson, writeJson } from "./merge.js";
import { claudeDesktopConfig } from "./paths.js";
import { ensureRuntime, hookCommand, installSkill, resolveInstall, type InstallOptions } from "./runtime.js";

export function installClaude(options: InstallOptions = {}): string {
  const env = ensureRuntime(resolveInstall(import.meta.url, options));
  const server = { command: env.node, args: [env.cli, "mcp"] };

  const userConfig = join(env.home, ".claude.json");
  writeJson(userConfig, mergeServerMap(readJson(userConfig), "mcpServers", "keybox", server));

  const settingsPath = join(env.home, ".claude", "settings.json");
  const settings = mergeNestedHooks(readJson(settingsPath), [
    { event: "UserPromptSubmit", command: hookCommand(env, "before-submit", "claude") },
    { event: "SessionStart", command: hookCommand(env, "session-start", "claude") },
    { event: "PostToolUse", command: hookCommand(env, "redact-tool", "claude") },
  ]);
  writeJson(settingsPath, settings);

  installSkill(env.repoRoot, join(env.home, ".claude", "skills", "keybox"));

  const desktopPath = claudeDesktopConfig(env.home, env.platform, env.appData);
  writeJson(desktopPath, mergeServerMap(readJson(desktopPath), "mcpServers", "keybox", server));
  return settingsPath;
}
