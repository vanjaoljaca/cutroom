async function main() {
  const directory = requiredArgument("--directory");
  const port = Number(optionalArgument("--port") || "4174");
  await assertReviewDirectory(directory);
  const address = await lanAddress();
  const server = createServer((request, response) => { void serve(directory, request, response); });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "0.0.0.0", resolve); });
  log("lan_review_started", { directory, bind: "0.0.0.0", url: `http://${address}:${port}` });
  registerShutdown(server);
}

async function serve(directory: string, request: IncomingMessage, response: ServerResponse) {
  const pathname = decodeURIComponent(new URL(request.url || "/", "http://cutroom").pathname);
  const file = resolve(directory, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!file.startsWith(`${resolve(directory)}${sep}`)) return send(response, 403, "text/plain", "Forbidden");
  try { const info = await stat(file); response.writeHead(200, { "content-type": contentType(file), "content-length": info.size, "cache-control": "no-cache" }); createReadStream(file).pipe(response); }
  catch { send(response, 404, "text/plain", "Not found"); }
}

async function assertReviewDirectory(directory: string) {
  const resolved = resolve(directory);
  if (!resolved.startsWith(`${reviewRoot}${sep}`)) throw new Error(`LAN review directory must be under ${reviewRoot}.`);
  const html = await readFile(join(resolved, "index.html"), "utf8");
  if (/localhost|127\.0\.0\.1/.test(html)) throw new Error("LAN review HTML contains a Mac-only URL.");
}

async function lanAddress() {
  const { stdout } = await execFile("/usr/sbin/ipconfig", ["getifaddr", "en0"]);
  const address = stdout.trim();
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(address)) throw new Error("Wi-Fi LAN address is unavailable.");
  return address;
}

function registerShutdown(server: HttpServer) { const stop = () => server.close(() => process.exit(0)); process.once("SIGINT", stop); process.once("SIGTERM", stop); }
function send(response: ServerResponse, status: number, type: string, body: string) { response.writeHead(status, { "content-type": type, "content-length": Buffer.byteLength(body) }); response.end(body); }
function contentType(path: string) { return path.endsWith(".html") ? "text/html; charset=utf-8" : path.endsWith(".mp4") ? "video/mp4" : path.endsWith(".css") ? "text/css; charset=utf-8" : "application/octet-stream"; }
function requiredArgument(name: string) { const value = optionalArgument(name); if (!value) throw new Error(`Missing ${name}`); return value; }
function optionalArgument(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] || null : null; }
function log(event: string, details: Record<string, unknown>) { console.info(JSON.stringify({ scope: "cutroom-lan-review", event, ...details })); }

const reviewRoot = "/Volumes/VanjaOljacaX/Cutroom/reviews";

void main().catch((error) => { console.error(JSON.stringify({ scope: "cutroom-lan-review", event: "lan_review_failed", error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; });

import { execFile as execFileCallback } from "node:child_process";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
