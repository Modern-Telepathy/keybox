/**
 * Build the zip the marketing site offers as the Keybox download.
 *
 * The archive is the CLI, editor extension, host installers, and macOS
 * hotkey source — not node_modules or build output. Recipients install
 * with npm install, npm run build, and node dist/cli.js install <host>.
 * Zip bytes are written here, with a fixed timestamp, so Vercel does not
 * need a zip binary and two packs of the same tree share a checksum.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const folder = `keybox-${version}`;

// ---------------------------------------------------------------------------
// Stage
//
// Copy only what a clean machine needs to build and install. kb-secret.md
// is a local scratch note and stays out. The website packager stays out too.
// ---------------------------------------------------------------------------

const stage = join(root, "site", ".stage", folder);
rmSync(join(root, "site", ".stage"), { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
delete pkg.scripts["site:pack"];
writeFileSync(join(stage, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
copyRel("package-lock.json");
copyRel("tsconfig.json");
copyRel("vitest.config.ts");
copyRel("README.md");
copyRel(".gitignore");
copyRel("src");
copyRel("plugin");
mkdirSync(join(stage, "scripts"), { recursive: true });
copyRel("scripts/chmod-bin.mjs");
copyRel("extension/package.json");
copyRel("extension/tsconfig.json");
copyRel("extension/src");
copyRel("site/icon.svg", "icon.svg");
copyRel("site/keybox-icon.png", "icon.png");

writeFileSync(join(stage, "INSTALL.txt"), installText(version));

const files = walk(stage, folder).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
const required = [
  `${folder}/package.json`,
  `${folder}/plugin/.cursor-plugin/plugin.json`,
  `${folder}/src/cli.ts`,
  `${folder}/src/macos/Hotkey.swift`,
  `${folder}/extension/src/extension.ts`,
  `${folder}/INSTALL.txt`,
  `${folder}/icon.svg`,
  `${folder}/icon.png`,
];
for (const name of required) {
  if (!files.some((file) => file.name === name)) {
    throw new Error(`Download archive is missing ${name}`);
  }
}
if (files.some((file) => file.name.includes("kb-secret") || file.name.includes("node_modules"))) {
  throw new Error("Download archive picked up a file that should stay local");
}

const page = readFileSync(join(root, "site", "index.html"), "utf8");
if (!page.includes(`${folder}.zip`)) {
  throw new Error(`site/index.html does not link to ${folder}.zip`);
}

// ---------------------------------------------------------------------------
// Zip + checksum
//
// Timestamps are pinned so the sha256 follows the file bytes, not the clock.
// ---------------------------------------------------------------------------

const zip = buildZip(files);
const outDir = join(root, "site", "downloads");
mkdirSync(outDir, { recursive: true });
const zipName = `${folder}.zip`;
const zipPath = join(outDir, zipName);
writeFileSync(zipPath, zip);
const sha256 = createHash("sha256").update(zip).digest("hex");
writeFileSync(join(outDir, `${folder}.sha256`), `${sha256}  ${zipName}\n`);
writeFileSync(
  join(outDir, `${folder}.json`),
  JSON.stringify({ file: zipName, bytes: zip.length, sha256, version }, null, 2) + "\n",
);
rmSync(join(root, "site", ".stage"), { recursive: true, force: true });
process.stdout.write(`${zipName} ${zip.length} bytes\n${sha256}\n`);

function copyRel(from, to = from) {
  copyEntry(join(root, from), join(stage, to));
}

function copyEntry(src, dest) {
  let entries;
  try {
    entries = readdirSync(src, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOTDIR") {
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, readFileSync(src));
      return;
    }
    throw error;
  }
  mkdirSync(dest, { recursive: true });
  for (const entry of entries) {
    if (entry.name === ".DS_Store" || entry.name === "out") continue;
    const from = join(src, entry.name);
    const target = join(dest, entry.name);
    if (entry.isDirectory()) copyEntry(from, target);
    else if (entry.isFile()) writeFileSync(target, readFileSync(from));
  }
}

function walk(dir, prefix) {
  /** @type {{ name: string, data: Buffer }[]} */
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const abs = join(dir, entry.name);
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(abs, rel));
    else if (entry.isFile()) out.push({ name: rel, data: readFileSync(abs) });
  }
  return out;
}

function installText(ver) {
  return `Keybox ${ver}
Seal a secret for Cursor, VS Code, Claude, or Codex. The agent can spend it. The model never reads it.

Requires
- Node.js 20 or newer
- One of: Cursor, VS Code, Claude Code, Claude Desktop, Codex, or any MCP client
- macOS and Xcode Command Line Tools (swiftc), only for the Command-Option-L hotkey

Build once
1. Unzip this archive and open a terminal in the keybox-${ver} folder.
2. npm install
3. npm run build

Then install the host you use. node dist/cli.js install all registers every host.
install-cursor is an alias for install cursor.

Cursor
  node dist/cli.js install cursor
  Reload Cursor (Developer: Reload Window). Confirm Keybox under Customize.
  A send-time hook blocks a raw key. Press Command-Option-L once and allow
  Accessibility for keybox-hotkey. In an editor file, the same keys are a
  Keybox keybinding.

VS Code
  node dist/cli.js install vscode
  Reload VS Code. Keybox is in ~/.copilot/mcp-config.json and the user mcp.json.
  VS Code has no send-time hook. Seal first with Keybox: Seal Key, or
  Command-Option-L in an editor (Ctrl+Alt+L on Windows and Linux).

Claude
  node dist/cli.js install claude
  Restart Claude Code and Claude Desktop.
  Claude Code blocks a raw key on submit and redacts tool results. It can still
  store the submitted prompt in its local session file. The model does not receive it.
  Claude Desktop is MCP only. Seal with Command-Option-L or keybox seal before you send.

Codex
  node dist/cli.js install codex
  Restart Codex. A raw key is blocked on submit, and tool results are redacted.

Other MCP clients
  After one install, the server command is ~/.keybox/bin/keybox mcp
  (keybox.cmd mcp on Windows). Tools: list_secrets, describe_secret,
  http_request, place_secret, revoke_secret. None return a secret.
  Seal with keybox seal before you send unless that client has a Keybox hook.

Use
Highlight a secret and seal it. The selection becomes a handle such as «kb:openai».
Send that. The agent spends it with the Keybox http_request tool.

The macOS hotkey is skipped on Windows and Linux. If swiftc is missing, run
xcode-select --install.
`;
}

/**
 * CRC-32 (ISO 3309). Checked against the standard "123456789" vector
 * so a bad table cannot ship a zip that unzip rejects.
 */
function crc32(buffer) {
  let c = ~0;
  for (let i = 0; i < buffer.length; i++) {
    c ^= buffer[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

const crcCheck = crc32(Buffer.from("123456789"));
if (crcCheck !== 0xcbf43926) {
  throw new Error(`crc32 self-check failed: ${crcCheck.toString(16)}`);
}

/**
 * Minimal ZIP (method 8, no data descriptor). Unix mode 0644 is stored
 * in the central-directory external attributes so macOS Archive Utility
 * extracts the tree as normal files.
 */
function buildZip(entries) {
  const time = 0;
  const date = ((2026 - 1980) << 9) | (10 << 5) | 19;
  const parts = [];
  const central = [];
  let offset = 0;

  for (const file of entries) {
    const name = Buffer.from(file.name, "utf8");
    const crc = crc32(file.data);
    const compressed = deflateRawSync(file.data);
    const store = compressed.length >= file.data.length;
    const method = store ? 0 : 8;
    const payload = store ? file.data : compressed;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE((3 << 8) | 20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x800, 8);
    cen.writeUInt16LE(method, 10);
    cen.writeUInt16LE(time, 12);
    cen.writeUInt16LE(date, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(payload.length, 20);
    cen.writeUInt32LE(file.data.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    // Mode lives in the high 16 bits. The shift exceeds 2^31, so force
// an unsigned value before writeUInt32LE rejects it as negative.
cen.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    cen.writeUInt32LE(offset, 42);

    parts.push(local, name, payload);
    central.push(cen, name);
    offset += local.length + name.length + payload.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, centralBuf, end]);
}
