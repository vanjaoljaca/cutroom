async function main() {
  const input = parseInput(process.argv.slice(2));
  const started = await startCutoutJob(input.projectId, input);
  log("cutout_cli_started", { projectId: input.projectId, jobId: started.jobId, overlayId: started.overlayId });
  const completed = await waitForCompletion(input.projectId, started.jobId);
  if (completed.state === "failed") throw new Error(completed.error || "Subject cutout failed.");
  process.stdout.write(`${JSON.stringify(completed, null, 2)}\n`);
}

async function waitForCompletion(projectId: string, jobId: string): Promise<CutoutJobStatus> {
  while (true) {
    const status = cutoutJobStatus(projectId, jobId);
    if (status.state === "completed" || status.state === "failed") return status;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function parseInput(args: string[]): CreateCutoutInput & { projectId: string } {
  const [projectId, sourceId, sourceStart, sourceEnd, targetClipId, ...label] = args;
  if (!projectId || !sourceId || !targetClipId || !label.length) throw new Error(usage);
  const input = { projectId, sourceId, sourceStart: Number(sourceStart), sourceEnd: Number(sourceEnd), targetClipId, label: label.join(" ") };
  if (!(input.sourceEnd > input.sourceStart)) throw new Error(usage);
  return input;
}

function log(event: string, details: Record<string, unknown>) { console.info(JSON.stringify({ scope: "cutroom-cutout-cli", event, ...details })); }

const usage = "Usage: npm run video:cutout -- <project-id> <source-id> <source-start> <source-end> <target-clip-id> <label>";

void main().catch((error) => { console.error(JSON.stringify({ scope: "cutroom-cutout-cli", event: "cutout_cli_failed", error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; });

import type { CreateCutoutInput, CutoutJobStatus } from "../src/CutoutModel";
import { cutoutJobStatus, startCutoutJob } from "../server/CutoutJobs";
