import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "dist/cloudflare-public");
const files = [
  "signal-mvp.html", "index.html", "admin.html", "echo-prototype.html", "ia-prototype.html",
  "app.js", "content-library.mjs", "chat-sharing.mjs", "styles.css", "sw.js", "manifest.webmanifest",
  "agent-admin.html", "agent-admin.mjs", "agent-admin.css", "card.html",
  "card-play.mjs", "card-poster.mjs", "vendor/qrcode-generator/qrcode.mjs"
];
const extensions = new Set([".jpg", ".jpeg", ".png", ".svg", ".mp4"]);
// This directory contains only this script's generated public allowlist.
if (existsSync(output)) rmSync(output, { recursive: true });
mkdirSync(output, { recursive: true });
let count = 0;
function copy(relative) {
  const source = join(root, relative);
  if (!lstatSync(source).isFile()) throw new Error(`Public asset must be a regular file: ${relative}`);
  mkdirSync(join(output, relative, ".."), { recursive: true });
  cpSync(source, join(output, relative));
  count++;
}
function assets(relative) {
  mkdirSync(join(output, relative), { recursive: true });
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
    const child = join(relative, entry.name);
    if (entry.isDirectory()) assets(child);
    else if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) copy(child);
  }
}
for (const file of files) copy(file);
assets("assets");
console.log(`Built ${count} public files; server code, credentials and databases are excluded.`);
