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
  const proposals = manifest.items.map((item, index) => `<section><video controls playsinline preload="metadata" src="./${escape(item.media)}"></video><div><strong>${escape(item.title)}</strong><span>${format(item.durationSeconds)} · ${index + 1}/${manifest.items.length}</span><a href="http://cutroom/project/${escape(item.projectId)}">Edit on desktop</a></div></section>`).join("");
  return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${escape(manifest.title)}</title><style>${styles}</style><main>${proposals}</main>`;
}

function escape(value: string) { return value.replace(/[&<>"']/g, (character) => entities[character]!); }
function format(seconds: number) { return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`; }
function requiredArgument(name: string) { const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1] : null; if (!value) throw new Error(`Missing ${name}`); return value; }
function log(event: string, details: Record<string, unknown>) { console.info(JSON.stringify({ scope: "cutroom-lan-review", event, ...details })); }

const styles = `*{box-sizing:border-box}html,body,main{margin:0;width:100%;height:100%;background:#000;color:#fff;font:16px system-ui}main{overflow-y:auto;scroll-snap-type:y mandatory}section{position:relative;width:100%;height:100svh;scroll-snap-align:start;scroll-snap-stop:always}video{width:100%;height:100%;object-fit:contain}section div{position:absolute;left:16px;right:16px;bottom:max(64px,calc(env(safe-area-inset-bottom) + 20px));display:grid;gap:4px;text-shadow:0 1px 4px #000;pointer-events:none}strong{font-size:17px}span,a{font-size:13px;color:#fff}a{justify-self:start;pointer-events:auto}`;
const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };

type ReviewManifest = { version: 1; title: string; items: Array<{ projectId: string; title: string; durationSeconds: number; media: string }> };

void main().catch((error) => { console.error(JSON.stringify({ scope: "cutroom-lan-review", event: "lan_review_build_failed", error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; });

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
