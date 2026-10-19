/**
 * VS Code install. Copilot reads ~/.copilot/mcp-config.json directly. The
 * profile mcp.json uses a different key, "servers", and is what the MCP:
 * Open User Configuration command shows. Both get the same Keybox entry.
 * VS Code has no prompt hook, so sealing stays on the editor command and
 * the macOS hotkey.
 */

import { join } from "node:path";
import { mergeServerMap, readJson, writeJson } from "./merge.js";
import { copilotMcp, vscodeUserMcp } from "./paths.js";
import { ensureRuntime, installExtension, resolveInstall, type InstallOptions } from "./runtime.js";

export function installVscode(options: InstallOptions = {}): string {
  const env = ensureRuntime(resolveInstall(import.meta.url, options));
  const server = { command: env.node, args: [env.cli, "mcp"] };
  const dest = join(env.home, ".vscode", "extensions", "keybox.keybox-0.1.0");
  installExtension(env.repoRoot, dest);

  const copilotPath = copilotMcp(env.home, env.copilotHome);
  writeJson(copilotPath, mergeServerMap(readJson(copilotPath), "mcpServers", "keybox", server));

  const profilePath = vscodeUserMcp(env.home, env.platform, env.appData);
  writeJson(profilePath, mergeServerMap(readJson(profilePath), "servers", "keybox", { type: "stdio", ...server }));
  return dest;
}
