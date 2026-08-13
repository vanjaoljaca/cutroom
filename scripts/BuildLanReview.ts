async function main() {
  const manifestPath = requiredArgument("--manifest");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ReviewManifest;
  validate(manifest);
  const directory = dirname(manifestPath);
  await writeFile(join(directory, "index.html"), page(manifest));
  log("lan_review_built", { directory, items: manifest.items.length });
}

function validate(manifest: ReviewManifest) {
  if (manifest.version !== 1 || !manifest.title.trim() || !manifest.items.length) throw new Error("Invalid LAN review manifest.");
  for (const item of manifest.items) {
    if (!/^[a-z0-9-]+$/.test(item.projectId) || !item.title.trim() || !(item.durationSeconds > 0)) throw new Error(`Invalid review item: ${item.projectId}`);
    if (!/^[a-z0-9._-]+\.mp4$/i.test(item.media)) throw new Error(`Review media must be a local MP4 filename: ${item.media}`);
  }
}

function page(manifest: ReviewManifest) {
  const cards = manifest.items.map((item) => `<article><h2>${escape(item.title)}</h2><p>${format(item.durationSeconds)}</p><video controls playsinline preload="metadata" src="./${escape(item.media)}"></video><a href="http://cutroom/project/${escape(item.projectId)}">Open desktop project</a></article>`).join("");
  return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(manifest.title)}</title><style>${styles}</style><main><h1>${escape(manifest.title)}</h1>${cards}</main>`;
}

function escape(value: string) { return value.replace(/[&<>"']/g, (character) => entities[character]!); }
function format(seconds: number) { return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`; }
function requiredArgument(name: string) { const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1] : null; if (!value) throw new Error(`Missing ${name}`); return value; }
function log(event: string, details: Record<string, unknown>) { console.info(JSON.stringify({ scope: "cutroom-lan-review", event, ...details })); }

const styles = `*{box-sizing:border-box}body{margin:0;background:#0e100f;color:#f4f5f2;font:16px system-ui}main{width:min(100%,720px);margin:auto;padding:20px}h1{font-size:28px}article{margin:0 0 28px;padding:16px;background:#181b19;border:1px solid #343936;border-radius:12px}h2{margin:0;font-size:20px}p{margin:4px 0 12px;color:#aeb4b0}video{display:block;width:100%;max-height:72vh;background:#000;border-radius:8px}a{display:inline-block;margin-top:12px;color:#71d6b6}`;
const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };

type ReviewManifest = { version: 1; title: string; items: Array<{ projectId: string; title: string; durationSeconds: number; media: string }> };

void main().catch((error) => { console.error(JSON.stringify({ scope: "cutroom-lan-review", event: "lan_review_build_failed", error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; });

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
