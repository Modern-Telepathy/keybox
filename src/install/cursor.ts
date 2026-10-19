/**
 * Cursor install. The plugin directory has to be a real copy — Cursor will
 * not follow a symlink that points outside ~/.cursor/plugins/local. User
 * hooks are merged so a second install does not delete other hook commands.
 */

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mergeCursorHooks, readJson, writeJson } from "./merge.js";
import { ensureRuntime, hookCommand, installExtension, resolveInstall, type InstallOptions } from "./runtime.js";

export function installCursor(options: InstallOptions = {}): string {
  const env = ensureRuntime(resolveInstall(import.meta.url, options));
  const pluginSrc = join(env.repoRoot, "plugin");
  const dest = join(env.home, ".cursor", "plugins", "local", "keybox");

  mkdirSync(join(env.home, ".cursor", "plugins", "local"), { recursive: true });
  rmSync(dest, { recursive: true, force: true });
  cpSync(pluginSrc, dest, { recursive: true });

  const mcp = {
    mcpServers: {
      keybox: { command: env.node, args: [env.cli, "mcp"] },
    },
  };
  writeFileSync(join(dest, "mcp.json"), JSON.stringify(mcp, null, 2) + "\n");

  const run = (hook: string) => hookCommand(env, hook, "cursor");
  const keyboxHooks = {
    beforeSubmitPrompt: [{ command: run("before-submit"), failClosed: true }],
    sessionStart: [{ command: run("session-start") }],
    postToolUse: [{ command: run("redact-tool"), matcher: "MCP:" }],
  };
  writeFileSync(join(dest, "hooks", "hooks.json"), JSON.stringify({ version: 1, hooks: keyboxHooks }, null, 2) + "\n");

  const userHooksPath = join(env.home, ".cursor", "hooks.json");
  const merged = mergeCursorHooks(readJson(userHooksPath), keyboxHooks);
  writeJson(userHooksPath, merged);

  installExtension(env.repoRoot, join(env.home, ".cursor", "extensions", "keybox.keybox-0.1.0"));
  return dest;
}
