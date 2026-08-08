async function main() {
  const projectId = requiredArgument("--project");
  const artifact = await analyzeProjectPitch(projectId);
  console.info(JSON.stringify({ scope: "cutroom-pitch", event: "pitch_cli_completed", projectId, artifactPath: `projects/${projectId}/analysis/pitch-v2.json`, points: artifact.points.length, voiced: artifact.points.filter((point) => point.hz !== null).length }));
}

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

void main().catch((error) => {
  console.error(JSON.stringify({ scope: "cutroom-pitch", event: "pitch_cli_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { analyzeProjectPitch } from "../server/pitch-analysis";
