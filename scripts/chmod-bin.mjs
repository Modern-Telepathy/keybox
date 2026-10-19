import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist", "cli.js");
const source = readFileSync(cli, "utf8");
if (!source.startsWith("#!")) {
  writeFileSync(cli, `#!/usr/bin/env node\n${source}`);
}
chmodSync(cli, 0o755);
