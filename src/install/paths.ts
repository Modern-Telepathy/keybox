/**
 * Host config locations. Platform is an argument so tests can check Windows
 * and Linux paths without leaving the machine they run on.
 */

import { join } from "node:path";

export function claudeDesktopConfig(home: string, os: NodeJS.Platform, appData?: string): string {
  if (os === "darwin") return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (os === "win32") return join(appData ?? join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  return join(home, ".config", "Claude", "claude_desktop_config.json");
}

export function vscodeUserMcp(home: string, os: NodeJS.Platform, appData?: string): string {
  if (os === "darwin") return join(home, "Library", "Application Support", "Code", "User", "mcp.json");
  if (os === "win32") return join(appData ?? join(home, "AppData", "Roaming"), "Code", "User", "mcp.json");
  return join(home, ".config", "Code", "User", "mcp.json");
}

export function copilotMcp(home: string, copilotHome?: string): string {
  return join(copilotHome ?? join(home, ".copilot"), "mcp-config.json");
}
