export function planSourcePreservingExport(input: SourcePlanInput): SourcePreservingPlan {
  const spans = input.cuts.flatMap((cut, index) => planCut(input, cut, index));
  const copied = spans.filter((span) => span.mode === "stream-copy").length;
  const transcoded = spans.length - copied;
  const strategy = transcoded === 0 ? "stream-copy" : copied === 0 ? "full-transcode" : "partial-transcode";
  const supported = strategy === "stream-copy";
  return { version: 1, preset: "original-format", projectId: input.projectId, source: input.source, strategy, supported, spans, blocker: supported ? null : hybridBlocker(strategy), alternatives: supported ? [] : ["Use Export for TikTok for an explicit H.264/MP4 delivery transcode.", "Adjust every cut and overlay boundary to complete source GOPs and remove burned-in overlays for a true HEVC/MOV stream copy.", "Explicitly authorize a full HEVC/MOV transcode in a future export preset."] };
}

function planCut(input: SourcePlanInput, cut: SourcePlanCut, index: number): SourcePlanSpan[] {
  const before = input.cuts.slice(0, index).reduce((sum, item) => sum + item.end - item.start, 0);
  const duration = cut.end - cut.start;
  const boundaries = unique([cut.start, cut.end, ...input.keyframes.filter((time) => time > cut.start && time < cut.end), ...input.overlays.flatMap((overlay) => overlayBoundaries(overlay, before, duration, cut.start))]);
  return boundaries.slice(0, -1).map((start, part) => makeSpan(input, cut, before, start, boundaries[part + 1]));
}

function makeSpan(input: SourcePlanInput, cut: SourcePlanCut, before: number, sourceStart: number, sourceEnd: number): SourcePlanSpan {
  const cutStart = before + sourceStart - cut.start;
  const cutEnd = before + sourceEnd - cut.start;
  const overlay = input.overlays.some((item) => item.start < cutEnd - epsilon && item.end > cutStart + epsilon);
  const randomAccess = keyframe(input.keyframes, sourceStart) && keyframe(input.keyframes, sourceEnd);
  const mode = !overlay && randomAccess ? "stream-copy" : "transcode";
  const reasons = [...(overlay ? ["burned-in image overlay modifies pixels"] : []), ...(!randomAccess ? ["span boundary is inside an HEVC GOP"] : [])];
  return { cutStart, cutEnd, sourceStart, sourceEnd, mode, reasons, videoCodec: mode === "stream-copy" ? "copy hevc/hvc1" : "would require HEVC re-encode", audioCodec: mode === "stream-copy" ? "copy aac" : "timing decision required" };
}

function overlayBoundaries(overlay: SourcePlanOverlay, before: number, duration: number, sourceStart: number): number[] {
  const localStart = Math.max(0, overlay.start - before);
  const localEnd = Math.min(duration, overlay.end - before);
  return localEnd > localStart ? [sourceStart + localStart, sourceStart + localEnd] : [];
}

function hybridBlocker(strategy: "partial-transcode" | "full-transcode"): string {
  if (strategy === "full-transcode") return "Every selected span changes pixels or begins/ends inside an HEVC GOP; preserving the exact edit requires a full transcode, which the original-format preset will not perform without explicit authorization.";
  return "The edit mixes copyable Apple hvc1 GOPs with spans that require re-encoding. FFmpeg/libx265 cannot guarantee matching hvcC parameter sets and seamless hvc1 sample descriptions when those independently encoded spans are concatenated, so the default exporter refuses an unsafe hybrid file.";
}

function keyframe(keyframes: number[], time: number): boolean { return keyframes.some((candidate) => Math.abs(candidate - time) <= epsilon); }
function unique(values: number[]): number[] { return [...new Set(values.map((value) => Number(value.toFixed(6))))].sort((left, right) => left - right); }

const epsilon = 0.002;

export type SourcePlanCut = { id: string; start: number; end: number };
export type SourcePlanOverlay = { id: string; start: number; end: number };
export type SourcePlanInput = { projectId: string; source: SourcePlanMedia; cuts: SourcePlanCut[]; overlays: SourcePlanOverlay[]; keyframes: number[] };
export type SourcePlanMedia = { path: string; container: "mov"; videoCodec: "hevc"; videoTag: "hvc1"; audioCodec: "aac"; averageFps: number; width: number; height: number; rotation: number; color: "bt709" };
export type SourcePlanSpan = { cutStart: number; cutEnd: number; sourceStart: number; sourceEnd: number; mode: "stream-copy" | "transcode"; reasons: string[]; videoCodec: string; audioCodec: string };
export type SourcePreservingPlan = { version: 1; preset: "original-format"; projectId: string; source: SourcePlanMedia; strategy: "stream-copy" | "partial-transcode" | "full-transcode"; supported: boolean; spans: SourcePlanSpan[]; blocker: string | null; alternatives: string[] };
