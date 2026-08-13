process.title = "Cutroom";

async function main() {
  const server = createServer(serve);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, host, resolve); });
  log("service_started", { pid: process.pid, sourceRevision, clientRoot, url: "http://cutroom" });
  registerShutdown(server);
}

async function serve(request: IncomingMessage, response: ServerResponse) {
  if (handleVideoProjectRequest(request, response)) return;
  try { await serveClient(request, response); }
  catch (error) { log("client_request_failed", { path: request.url, error: error instanceof Error ? error.message : String(error) }); send(response, 500, "text/plain", "Cutroom failed to load."); }
}

async function serveClient(request: IncomingMessage, response: ServerResponse) {
  const pathname = decodeURIComponent(new URL(request.url || "/", "http://cutroom").pathname);
  if (!["GET", "HEAD"].includes(request.method || "GET")) return send(response, 405, "text/plain", "Method not allowed.");
  if (pathname.startsWith("/api/")) return send(response, 404, "application/json", JSON.stringify({ error: "Not found." }));
  const file = await clientFile(pathname);
  const body = await readFile(file);
  send(response, 200, contentType(file), request.method === "HEAD" ? null : body, file.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable");
}

async function clientFile(pathname: string) {
  const requested = resolve(clientRoot, `.${pathname}`);
  if (!requested.startsWith(`${clientRoot}${sep}`)) return join(clientRoot, "index.html");
  try { if ((await stat(requested)).isFile()) return requested; }
  catch { /* App routes fall through to the client shell. */ }
  return join(clientRoot, "index.html");
}

function send(response: ServerResponse, status: number, type: string, body: Buffer | string | null, cache = "no-store") {
  response.writeHead(status, { "content-type": type, "cache-control": cache, ...(body ? { "content-length": Buffer.byteLength(body) } : {}) });
  response.end(body);
}

function contentType(path: string) {
  const extension = extname(path);
  return extension === ".html" ? "text/html; charset=utf-8" : extension === ".js" ? "text/javascript; charset=utf-8" : extension === ".css" ? "text/css; charset=utf-8" : extension === ".svg" ? "image/svg+xml" : extension === ".png" ? "image/png" : "application/octet-stream";
}

function registerShutdown(server: HttpServer) {
  const stop = (signal: NodeJS.Signals) => { log("service_stopping", { pid: process.pid, signal }); server.close(() => process.exit(0)); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

function log(event: string, details: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: serviceLabel, event, service: serviceLabel, sourceRevision, ...details }));
}

const serviceLabel = "com.vanja.cutroom";
const sourceRevision = process.env.CUTROOM_SOURCE_REVISION || "working-tree";
const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../client");
const host = "127.0.0.1";
const port = Number(process.env.CUTROOM_PORT || 4173);

void main().catch((error) => {
  console.error(JSON.stringify({ scope: serviceLabel, event: "service_failed", service: serviceLabel, sourceRevision, pid: process.pid, error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { handleVideoProjectRequest } from "../server/video-project-api";
