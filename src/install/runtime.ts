/**
 * Shared install runtime. Every host launches the same CLI, so the shim
 * and the macOS hotkey are created once under ~/.keybox and reused by
 * Cursor, VS Code, Claude, and Codex.
 */

import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, platform } from "node:os";

export interface InstallOptions {
  home?: string;
  repoRoot?: string;
  /** Compile and load the macOS hotkey. Tests pass false so they stay offline. */
  hotkey?: boolean;
  platform?: NodeJS.Platform;
  appData?: string;
  copilotHome?: string;
}

export interface ResolvedInstall {
  home: string;
  repoRoot: string;
  hotkey: boolean;
  platform: NodeJS.Platform;
  appData?: string;
  copilotHome?: string;
  node: string;
  cli: string;
  shim: string;
}

/**
 * Locate the repo from a compiled file in dist/install/. Callers in tests
 * pass repoRoot instead, so this path is only the production default.
 */
export function resolveInstall(metaUrl: string, options: InstallOptions = {}): ResolvedInstall {
  const home = options.home ?? homedir();
  const repoRoot = options.repoRoot ?? join(dirname(fileURLToPath(metaUrl)), "..", "..");
  const node = process.execPath;
  const cli = join(repoRoot, "dist", "cli.js");
  return {
    home,
    repoRoot,
    hotkey: options.hotkey ?? true,
    platform: options.platform ?? platform(),
    appData: options.appData,
    copilotHome: options.copilotHome,
    node,
    cli,
    shim: join(home, ".keybox", "bin", process.platform === "win32" ? "keybox.cmd" : "keybox"),
  };
}

/**
 * Write the keybox command the hooks invoke. Cursor's hook runner does not
 * have node on PATH, so macOS and Linux get a shell shim. Windows gets a
 * cmd wrapper because a shell script will not run there.
 */
export function ensureRuntime(env: ResolvedInstall): ResolvedInstall {
  const binDir = join(env.home, ".keybox", "bin");
  mkdirSync(binDir, { recursive: true, mode: 0o700 });
  if (env.platform === "win32") {
    const cmd = join(binDir, "keybox.cmd");
    writeFileSync(cmd, `@echo off\r\n"${env.node}" "${env.cli}" %*\r\n`);
    env.shim = cmd;
  } else {
    const shim = join(binDir, "keybox");
    writeFileSync(shim, `#!/bin/sh\nexec "${env.node}" "${env.cli}" "$@"\n`, { mode: 0o755 });
    chmodSync(shim, 0o755);
    env.shim = shim;
  }
  if (env.hotkey) installMacHotkey(env);
  return env;
}

/** One shell string for a hook. The format selects Cursor, Claude, or Codex JSON. */
export function hookCommand(env: ResolvedInstall, hook: string, format: "cursor" | "claude" | "codex"): string {
  return `"${env.shim}" hook ${hook} --format ${format}`;
}

/**
 * Copy the editor extension. The build must already have produced
 * extension/out — the installer does not compile TypeScript itself.
 */
export function installExtension(repoRoot: string, dest: string): void {
  const out = join(repoRoot, "extension", "out");
  if (!existsSync(out)) {
    throw new Error("Extension build is missing. Run npm run build, then install again.");
  }
  mkdirSync(dest, { recursive: true });
  cpSync(join(repoRoot, "extension", "package.json"), join(dest, "package.json"));
  cpSync(out, join(dest, "out"), { recursive: true });
}

export function installSkill(repoRoot: string, dest: string): void {
  cpSync(join(repoRoot, "plugin", "skills", "keybox"), dest, { recursive: true });
}

function installMacHotkey(env: ResolvedInstall): void {
  if (env.platform !== "darwin") return;

  const binDir = join(env.home, ".keybox", "bin");
  const binary = join(binDir, "keybox-hotkey");
  const source = join(env.repoRoot, "src", "macos", "Hotkey.swift");
  const tmp = join(env.home, ".keybox", "tmp");
  const moduleCache = join(env.home, ".keybox", "clang-cache");
  mkdirSync(tmp, { recursive: true });
  mkdirSync(moduleCache, { recursive: true });
  execFileSync(
    "swiftc",
    [
      "-parse-as-library",
      "-O",
      "-module-cache-path",
      moduleCache,
      "-framework",
      "AppKit",
      "-framework",
      "Carbon",
      "-framework",
      "ApplicationServices",
      "-o",
      binary,
      source,
    ],
    { stdio: "inherit", env: { ...process.env, TMPDIR: tmp } },
  );
  chmodSync(binary, 0o755);

  const uid = process.getuid?.() ?? 501;
  const plistPath = join(env.home, "Library", "LaunchAgents", "com.keybox.hotkey.plist");
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.keybox.hotkey</string>
  <key>ProgramArguments</key>
  <array>
    <string>${binary}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${join(env.home, ".keybox", "hotkey.out.log")}</string>
  <key>StandardErrorPath</key>
  <string>${join(env.home, ".keybox", "hotkey.err.log")}</string>
</dict>
</plist>
`;
  writeFileSync(plistPath, plist);
  try {
    execFileSync("launchctl", ["bootout", `gui/${uid}`, plistPath], { stdio: "ignore" });
  } catch {
    // Not loaded yet.
  }
  execFileSync("launchctl", ["bootstrap", `gui/${uid}`, plistPath]);
}
