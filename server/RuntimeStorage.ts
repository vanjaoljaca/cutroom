export async function assertRuntimeStorageAvailable(): Promise<void> {
  try {
    const resolved = await realpath(runtimeRoot);
    if (!configuredRuntimeRoot && resolved !== runtimeRoot) throw new Error(`resolved to ${resolved}`);
  } catch (error) {
    throw unavailableStorageError(error);
  }
}

export function assertRuntimeStorageAvailableSync(): void {
  try {
    const resolved = realpathSync(runtimeRoot);
    if (!configuredRuntimeRoot && resolved !== runtimeRoot) throw new Error(`resolved to ${resolved}`);
  } catch (error) {
    throw unavailableStorageError(error);
  }
}

function unavailableStorageError(cause: unknown): Error {
  const error = new Error(`Cutroom storage is unavailable at ${runtimeRoot}. Connect VanjaOljacaX before continuing.`);
  error.cause = cause;
  return error;
}

export const runtimeRoot = process.env.CUTROOM_RUNTIME_ROOT || "/Volumes/VanjaOljacaX/Cutroom";
export const projectsRoot = join(runtimeRoot, "projects");
export const transcriptionModelPath = process.env.CUTROOM_TRANSCRIPTION_MODEL || join(runtimeRoot, "runtime/models/parakeet-tdt-0.6b-v2-coreml");

import { realpathSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { join } from "node:path";

const configuredRuntimeRoot = process.env.CUTROOM_RUNTIME_ROOT;
