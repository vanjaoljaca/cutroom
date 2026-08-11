async function main() {
  const [command] = process.argv.slice(2);
  const args = parseArgs(process.argv.slice(3));
  if (command === "ingest") return output(await ingestRawMedia(required(args, "path")));
  if (command === "list") return output(await readRawMediaLibrary());
  if (command === "attach") return output(await attachRawMedia({ projectId: required(args, "project"), rawMediaId: required(args, "raw"), sourceId: args.source, role: role(args.role), label: args.label, primary: args.primary === "true" }));
  if (command === "detach") return output(await detachRawMedia(required(args, "project"), required(args, "raw")));
  throw new Error("Usage: raw-media <ingest|list|attach|detach> [--path ...] [--project ...] [--raw ...]");
}

function parseArgs(values: string[]) {
  const args: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 2) if (values[index]?.startsWith("--") && values[index + 1]) args[values[index].slice(2)] = values[index + 1];
  return args;
}

function required(args: Record<string, string>, key: string) {
  if (!args[key]) throw new Error(`Missing --${key}.`);
  return args[key];
}

function role(value = "creator"): "instruction" | "creator" | "reference" {
  if (value === "instruction" || value === "creator" || value === "reference") return value;
  throw new Error(`Invalid media role: ${value}`);
}

function output(value: unknown) { console.info(JSON.stringify({ scope: "cutroom-raw-media-cli", event: "command_completed", value }, null, 2)); }

main().catch((error) => { console.error(JSON.stringify({ scope: "cutroom-raw-media-cli", event: "command_failed", error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; });

import { attachRawMedia, detachRawMedia, ingestRawMedia, readRawMediaLibrary } from "../server/RawMediaLibrary";
