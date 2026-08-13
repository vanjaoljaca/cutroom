export async function startLanReviewServer() {
  const directory = await currentReviewDirectory();
  const host = lanHost();
  const server = createServer((request, response) => { void serveReview(directory, request, response); });
  await listen(server, host, reviewPort);
  log("lan_review_started", { directory, host, port: reviewPort, url: `http://${host}:${reviewPort}` });
  return server;
}

export async function serveLanReviewRequest(request: IncomingMessage, response: ServerResponse) {
  return serveReview(await currentReviewDirectory(), request, response);
}

export function isPhoneReviewHost(host: string | undefined) {
  return host?.split(":", 1)[0].toLowerCase() === "cutroom.local";
}

async function serveReview(directory: string, request: IncomingMessage, response: ServerResponse) {
  const pathname = decodeURIComponent(new URL(request.url || "/", "http://cutroom-review").pathname);
  if (pathname === "/") return serveFeed(directory, request, response);
  const file = resolve(directory, `.${pathname}`);
  if (!file.startsWith(`${directory}${sep}`)) return sendText(response, 403, "Forbidden");
  try { await serveFile(file, request, response); }
  catch { sendText(response, 404, "Not found"); }
}

async function serveFeed(directory: string, request: IncomingMessage, response: ServerResponse) {
  const manifest = validateManifest(JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")));
  const body = Buffer.from(feedPage(manifest));
  response.writeHead(200, headers("text/html; charset=utf-8", body.length));
  response.end(request.method === "HEAD" ? null : body);
}

async function serveFile(file: string, request: IncomingMessage, response: ServerResponse) {
  const info = await stat(file);
  const range = parseRange(request.headers.range, info.size);
  const [start, end] = range ?? [0, info.size - 1];
  response.writeHead(range ? 206 : 200, { ...headers(contentType(file), end - start + 1), "accept-ranges": "bytes", ...(range ? { "content-range": `bytes ${start}-${end}/${info.size}` } : {}) });
  if (request.method === "HEAD") return response.end();
  createReadStream(file, { start, end }).pipe(response);
}

async function currentReviewDirectory() {
  const root = process.env.CUTROOM_REVIEW_ROOT || "/Volumes/VanjaOljacaX/Cutroom/reviews";
  const entries = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse();
  for (const entry of entries) { const directory = resolve(root, entry); if (await exists(join(directory, "manifest.json"))) return directory; }
  throw new Error(`No LAN review manifest under ${root}.`);
}

function feedPage(manifest: ReviewManifest) {
  const proposals = manifest.items.map((item, index) => `<section class="proposal"><video controls playsinline preload="metadata" src="./${escapeHtml(item.media)}"></video><div class="identity"><strong>${escapeHtml(item.title)}</strong><span>${formatDuration(item.durationSeconds)} · ${index + 1}/${manifest.items.length}</span><a href="http://cutroom/project/${escapeHtml(item.projectId)}">Edit on desktop</a></div></section>`).join("");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#000"><title>${escapeHtml(manifest.title)}</title><style>${feedStyles}</style></head><body><main>${proposals}</main></body></html>`;
}

function validateManifest(value: unknown): ReviewManifest {
  const manifest = value as ReviewManifest;
  if (manifest.version !== 1 || !manifest.items?.length) throw new Error("Invalid LAN review manifest.");
  for (const item of manifest.items) if (!item.title || !/^[a-z0-9._-]+\.mp4$/i.test(item.media)) throw new Error("Invalid LAN review item.");
  return manifest;
}

function parseRange(value: string | undefined, size: number): [number, number] | null {
  if (!value) return null;
  const match = /^bytes=(\d+)-(\d*)$/.exec(value);
  if (!match) throw new Error("Unsupported range.");
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start > end || start >= size) throw new Error("Invalid range.");
  return [start, end];
}

function lanHost() {
  const configured = process.env.CUTROOM_LAN_HOST;
  if (configured) return configured;
  const address = networkInterfaces().en0?.find((item) => item.family === "IPv4" && !item.internal)?.address;
  if (!address) throw new Error("Wi-Fi LAN address is unavailable.");
  return address;
}

function listen(server: HttpServer, host: string, port: number) {
  return new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, host, resolve); });
}

async function exists(path: string) { try { await stat(path); return true; } catch { return false; } }
function headers(type: string, length: number) { return { "content-type": type, "content-length": length, "cache-control": "no-cache" }; }
function sendText(response: ServerResponse, status: number, body: string) { response.writeHead(status, headers("text/plain; charset=utf-8", Buffer.byteLength(body))); response.end(body); }
function contentType(path: string) { return path.endsWith(".mp4") ? "video/mp4" : path.endsWith(".css") ? "text/css; charset=utf-8" : "application/octet-stream"; }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => htmlEntities[character]!); }
function formatDuration(seconds: number) { return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`; }
function log(event: string, details: Record<string, unknown>) { console.info(JSON.stringify({ scope: "com.vanja.cutroom", service: "Cutroom", event, ...details })); }

const reviewPort = Number(process.env.CUTROOM_REVIEW_PORT || 4174);
const feedStyles = `*{box-sizing:border-box}html,body,main{margin:0;width:100%;height:100%;background:#000;color:#fff;font:16px system-ui}main{overflow-y:auto;scroll-snap-type:y mandatory}.proposal{position:relative;width:100%;height:100svh;scroll-snap-align:start;scroll-snap-stop:always;background:#000}.proposal video{width:100%;height:100%;object-fit:contain;background:#000}.identity{position:absolute;left:max(16px,env(safe-area-inset-left));right:max(16px,env(safe-area-inset-right));bottom:max(64px,calc(env(safe-area-inset-bottom) + 20px));display:grid;gap:4px;pointer-events:none;text-shadow:0 1px 4px #000}.identity strong{font-size:17px}.identity span{font-size:13px;color:#ddd}.identity a{justify-self:start;color:#fff;font-size:13px;pointer-events:auto}`;
const htmlEntities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };

type ReviewManifest = { version: 1; title: string; items: Array<{ projectId: string; title: string; durationSeconds: number; media: string }> };

import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { join, resolve, sep } from "node:path";
