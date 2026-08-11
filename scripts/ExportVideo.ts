async function main() {
  const projectId = requiredArgument("--project");
  const preset = optionalArgument("--preset") || "original-format";
  if (preset !== "original-format" && preset !== "tiktok-60" && preset !== "tiktok-software") throw new Error(`Unsupported --preset: ${preset}`);
  const receipt = await renderProjectVideo(projectId, { preset, onProgress: (progress) => console.info(JSON.stringify({ scope: "cutroom-export", event: "export_cli_progress", projectId, preset, ...progress })) });
  console.info(JSON.stringify({ scope: "cutroom-export", event: "export_cli_completed", projectId, receipt }));
}

function optionalArgument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || null : null;
}

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

void main().catch((error) => {
  console.error(JSON.stringify({ scope: "cutroom-export", event: "export_cli_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { renderProjectVideo } from "../server/VideoExportPipeline";
