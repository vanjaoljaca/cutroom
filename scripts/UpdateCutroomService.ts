async function main() {
  const revision = optionalArgument("--revision") || await gitRevision();
  await assertInputs();
  const desired = stablePlist(config);
  const installed = await optionalRead(plistPath);
  const loaded = await isLoaded();
  const plan = updatePlan(installed, desired, loaded);
  const release = await stageRelease(revision);
  await installSupervisor(plan.plistChanged || process.argv.includes("--refresh-supervisor"));
  await applyPlist(plan, desired);
  await switchRelease(release);
  await activate(plan);
  await verifyRevision(revision);
  await writeReceipt(revision, release, plan);
}

async function stageRelease(revision: string) {
  const release = join(releasesRoot, revision);
  const staging = `${release}.staging.${randomUUID()}`;
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  await cp(join(appRoot, "dist/client"), join(staging, "client"), { recursive: true });
  await cp(join(appRoot, "dist/server"), join(staging, "server"), { recursive: true });
  await cp(join(appRoot, "dist/scripts"), join(staging, "scripts"), { recursive: true });
  await rm(release, { recursive: true, force: true });
  await rename(staging, release);
  log("release_staged", { revision, release });
  return release;
}

async function installSupervisor(refresh: boolean) {
  await mkdir(binRoot, { recursive: true });
  if (!refresh && await exists(executablePath)) return log("supervisor_unchanged", { executablePath });
  const candidate = join(supportRoot, `Cutroom.${randomUUID()}`);
  await execFile("/usr/bin/xcrun", ["swiftc", join(appRoot, "service/CutroomSupervisor.swift"), "-o", candidate]);
  const changed = await filesDiffer(candidate, executablePath);
  if (changed) { await chmod(candidate, 0o755); await rename(candidate, executablePath); }
  else await rm(candidate);
  log("supervisor_installed", { executablePath, changed });
}

async function applyPlist(plan: UpdatePlan, desired: string) {
  if (!plan.plistChanged) return log("plist_unchanged", { plistPath, launchAction: plan.launchAction });
  await mkdir(dirname(plistPath), { recursive: true });
  const temporary = `${plistPath}.${randomUUID()}`;
  await writeFile(temporary, desired);
  await rename(temporary, plistPath);
  log("plist_written", { plistPath, launchAction: plan.launchAction });
}

async function switchRelease(release: string) {
  await mkdir(dirname(currentLink), { recursive: true });
  const temporary = `${currentLink}.${randomUUID()}`;
  await symlink(relative(dirname(currentLink), release), temporary);
  await rename(temporary, currentLink);
  log("release_activated", { release, currentLink });
}

async function activate(plan: UpdatePlan) {
  if (plan.launchAction === "migrate") await execFile("/bin/launchctl", ["bootout", launchDomain, plistPath]).catch(ignoreMissingJob);
  if (plan.launchAction !== "reload-child") await execFile("/bin/launchctl", ["bootstrap", launchDomain, plistPath]);
  else await execFile("/bin/kill", ["-HUP", String(await servicePid())]);
  log("service_activated", { launchAction: plan.launchAction });
}

async function verifyRevision(revision: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { const status = await getStatus(); if (status.sourceRevision === revision) return log("service_verified", status); }
    catch { /* Service may still be switching. */ }
    await delay(100);
  }
  throw new Error(`Cutroom did not serve revision ${revision}.`);
}

async function getStatus() {
  const response = await fetch("http://127.0.0.1:4173/api/service/status");
  if (!response.ok) throw new Error(`Status returned ${response.status}.`);
  return await response.json() as { sourceRevision: string; pid: number };
}

async function writeReceipt(revision: string, release: string, plan: UpdatePlan) {
  const plist = await stat(plistPath);
  const receipt = { version: 1, service: serviceLabel, revision, release, plan, plist: { path: plistPath, inode: plist.ino, mtimeMs: plist.mtimeMs, sha256: await fileHash(plistPath) }, pid: await servicePid(), updatedAt: new Date().toISOString() };
  await writeFile(join(supportRoot, "service-update-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  console.info(JSON.stringify({ scope: serviceLabel, event: "service_update_complete", ...receipt }));
}

async function assertInputs() {
  await stat(join(appRoot, "dist/server/CutroomServer.mjs"));
  await stat(runtimeRoot);
}

async function isLoaded() { try { await servicePid(); return true; } catch { return false; } }
async function servicePid() { const { stdout } = await execFile("/bin/launchctl", ["print", `${launchDomain}/${serviceLabel}`]); const match = /\bpid = (\d+)/.exec(stdout); if (!match) throw new Error("Cutroom service has no PID."); return Number(match[1]); }
async function gitRevision() { const { stdout } = await execFile("/usr/bin/git", ["rev-parse", "--short=8", "HEAD"], { cwd: appRoot }); return stdout.trim(); }
async function optionalRead(path: string) { try { return await readFile(path, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } }
async function exists(path: string) { try { await stat(path); return true; } catch { return false; } }
async function filesDiffer(left: string, right: string) { try { return (await fileHash(left)) !== (await fileHash(right)); } catch { return true; } }
async function fileHash(path: string) { return createHash("sha256").update(await readFile(path)).digest("hex"); }
async function delay(milliseconds: number) { await new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function optionalArgument(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] || null : null; }
function ignoreMissingJob(error: unknown) { if (!String(error).includes("No such process")) throw error; }
function log(event: string, details: Record<string, unknown>) { console.info(JSON.stringify({ scope: serviceLabel, event, ...details })); }

const serviceLabel = "com.vanja.cutroom";
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = homedir();
const supportRoot = join(home, "Library/Application Support", serviceLabel);
const runtimeRoot = "/Volumes/VanjaOljacaX/Cutroom";
const releasesRoot = join(supportRoot, "runtime/releases");
const currentLink = join(supportRoot, "runtime/current");
const binRoot = join(supportRoot, "bin");
const executablePath = join(binRoot, "Cutroom");
const plistPath = join(home, "Library/LaunchAgents", `${serviceLabel}.plist`);
const launchDomain = `gui/${process.getuid!()}`;
const config: ServiceConfig = { label: serviceLabel, executable: executablePath, supportRoot, runtimeRoot, nodePath: "/opt/homebrew/bin/node", stdoutPath: join(supportRoot, `${serviceLabel}.stdout.log`), stderrPath: join(supportRoot, `${serviceLabel}.stderr.log`) };

import { execFile as execFileCallback } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, cp, mkdir, readFile, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { stablePlist, updatePlan, type ServiceConfig, type UpdatePlan } from "../server/CutroomServiceLifecycle";

const execFile = promisify(execFileCallback);

void main().catch((error) => { console.error(JSON.stringify({ scope: serviceLabel, event: "service_update_failed", error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; });
