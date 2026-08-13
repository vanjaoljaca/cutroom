export function exportFileStem(input: ExportFileNameInput): string {
  const title = exportProjectTitle(input.projectTitle);
  const timestamp = localTimestamp(input.createdAt);
  const version = String(input.exportVersion).padStart(3, "0");
  const preset = input.preset === "tiktok-60" ? "TikTok Hardware" : input.preset === "tiktok-software" ? "TikTok Software" : input.preset === "lan-review" ? "LAN Review" : "Original";
  return `${title} - ${timestamp} - v${version} - ${preset}`;
}

function localTimestamp(date: Date) {
  const day = [date.getFullYear(), two(date.getMonth() + 1), two(date.getDate())].join("-");
  const time = [two(date.getHours()), two(date.getMinutes()), two(date.getSeconds())].join(".");
  return `${day} ${time}`;
}

function two(value: number) {
  return String(value).padStart(2, "0");
}

type ExportFileNameInput = { projectTitle: string; preset: ExportPreset; exportVersion: number; createdAt: Date };

import type { ExportPreset } from "../src/analysis-model";
import { exportProjectTitle } from "../src/ProjectTitle";
