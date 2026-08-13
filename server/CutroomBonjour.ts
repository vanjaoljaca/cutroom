export function startCutroomBonjour(onFailure: (error: Error) => void): CutroomBonjour {
  const address = lanAddress();
  const args = ["-P", "Cutroom", "_http._tcp", "local", "80", "cutroom.local", address, "path=/"];
  const child = spawn("/usr/bin/dns-sd", args, { stdio: ["ignore", "pipe", "pipe"] });
  let stopping = false;
  child.stdout.on("data", (chunk) => log("bonjour_output", { message: String(chunk).trim() }));
  child.stderr.on("data", (chunk) => log("bonjour_error", { message: String(chunk).trim() }));
  child.once("spawn", () => log("bonjour_started", { pid: child.pid, hostname: "cutroom.local", address, port: 80 }));
  child.once("exit", (code, signal) => { if (!stopping) onFailure(new Error(`Bonjour publisher exited (${code ?? signal}).`)); });
  return { stop: () => { stopping = true; child.kill("SIGTERM"); } };
}

function lanAddress() {
  const address = networkInterfaces().en0?.find((item) => item.family === "IPv4" && !item.internal)?.address;
  if (!address) throw new Error("Wi-Fi LAN address is unavailable for cutroom.local.");
  return address;
}

function log(event: string, details: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "com.vanja.cutroom", service: "Cutroom", event, ...details }));
}

export type CutroomBonjour = { stop: () => void };

import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
