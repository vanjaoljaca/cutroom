export function stablePlist(config: ServiceConfig) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n${entry("Label", config.label)}${array("ProgramArguments", [config.executable])}${entry("WorkingDirectory", config.supportRoot)}${entry("ProcessType", "Interactive")}${entry("StandardOutPath", config.stdoutPath)}${entry("StandardErrorPath", config.stderrPath)}${environment(config)}  <key>RunAtLoad</key><true/>\n  <key>KeepAlive</key><true/>\n</dict></plist>\n`;
}

export function updatePlan(installed: string | null, desired: string, loaded: boolean): UpdatePlan {
  if (installed === null) return { plistChanged: true, launchAction: "bootstrap" };
  if (normalizePlist(installed) !== normalizePlist(desired)) return { plistChanged: true, launchAction: "migrate" };
  return { plistChanged: false, launchAction: loaded ? "reload-child" : "bootstrap" };
}

export function normalizePlist(value: string) { return value.replace(/>\s+</g, "><").trim(); }
function environment(config: ServiceConfig) { return `  <key>EnvironmentVariables</key><dict>\n${entry("CUTROOM_NODE_PATH", config.nodePath, 4)}${entry("CUTROOM_RUNTIME_ROOT", config.runtimeRoot, 4)}${entry("CUTROOM_SUPPORT_ROOT", config.supportRoot, 4)}  </dict>\n`; }
function entry(key: string, value: string, spaces = 2) { const indent = " ".repeat(spaces); return `${indent}<key>${escapeXml(key)}</key><string>${escapeXml(value)}</string>\n`; }
function array(key: string, values: string[]) { return `  <key>${escapeXml(key)}</key><array>${values.map((value) => `<string>${escapeXml(value)}</string>`).join("")}</array>\n`; }
function escapeXml(value: string) { return value.replace(/[&<>"']/g, (character) => xmlEntities[character]!); }
const xmlEntities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" };
export type ServiceConfig = { label: string; executable: string; supportRoot: string; runtimeRoot: string; nodePath: string; stdoutPath: string; stderrPath: string };
export type UpdatePlan = { plistChanged: boolean; launchAction: "bootstrap" | "migrate" | "reload-child" };
