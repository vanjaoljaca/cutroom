import type { SourceRange } from "./editor-model";

export type WordTiming = {
  word: string;
  startTime: number;
  endTime: number;
  confidence: number;
};

export type CutProposal = SourceRange & {
  label: string;
  reason: string;
  transcript: string;
  confidence: number;
};

export type TakeProposal = CutProposal & {
  selected: boolean;
};

export type SceneProposal = {
  id: string;
  order: number;
  label: string;
  reason: string;
  takes: TakeProposal[];
};

export type AnalysisResult = {
  provider: "fluid-audio";
  model: "parakeet-tdt-0.6b-v2";
  transcript: string;
  words: WordTiming[];
  requestSummary: string;
  scenes: SceneProposal[];
  cuts: CutProposal[];
  artifactsDirectory: string;
};

export type VideoProject = AnalysisResult & {
  schemaVersion: 1;
  revision: number;
  id: string;
  title: string;
  sourcePath: string;
  sourceName: string;
  createdAt: string;
  recordingPlan?: RecordingPlan;
  mediaLibrary: MediaLibrary;
  programTimeline: ProgramTimeline;
  editorPreferences: EditorPreferences;
  assetLibrary: AssetLibrary;
  overlays: ImageOverlay[];
  cutoutOverlays: SubjectCutoutOverlay[];
  videoOverlays: VideoOverlay[];
  textOverlays: TextOverlay[];
  subtitleTrack: SubtitleTrack;
  pitchAnalysis: PitchAnalysisReference | null;
  exportHistory: ExportReceipt[];
};

export type RecordingPlan = {
  version: 1;
  sourceId: string;
  sourceLabel: string;
  outputs: RecordingPlanOutput[];
};

export type RecordingPlanOutput = {
  id: string;
  projectId: string;
  projectTitle: string;
  intent: "new" | "existing";
  status: "planned" | "ready";
  summary: string;
  sourceRanges: RecordingPlanRange[];
};

export type RecordingPlanRange = {
  start: number;
  end: number;
};

export type ProjectSummary = {
  id: string;
  title: string;
  sourceName: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  sceneCount: number;
  exportCount: number;
  provenance: ProjectMediaProvenance[];
};

export type ProjectMediaProvenance = {
  provenanceId: string;
  rawMediaId?: string | null;
  sourceId: string;
  label: string;
  role: VideoMediaSource["role"];
  primary: boolean;
};

export type ProjectTrashReceipt = {
  projectId: string;
  title: string;
  trashPath: string;
  trashedAt: string;
};

export type EditorPreferences = {
  timelineWindow: TimelineWindow;
};

export type TimelineWindow = "auto" | "15" | "60" | "180" | "300";

export type MediaLibrary = {
  version: 1;
  primarySourceId: string;
  sources: VideoMediaSource[];
};

export type VideoMediaSource = {
  id: string;
  kind: "video";
  role: "instruction" | "creator" | "reference";
  label: string;
  rawMediaId?: string | null;
  origin: MediaOrigin;
  cache: RemoteMediaCache | null;
  transcript?: MediaTranscriptReference | null;
  metadata: VideoMediaMetadata | null;
  createdAt: string;
};

export type MediaTranscriptReference = {
  version: 1;
  artifactPath: string;
  language: string;
  wordCount: number;
  generatedAt: string;
};

export type RawMediaLibrary = { version: 1; records: RawMediaRecord[] };

export type ReferenceMediaLibrary = { version: 1; records: ReferenceMediaRecord[] };

export type ReferenceMediaRecord = {
  id: string;
  source: VideoMediaSource;
  projectIds: string[];
  cacheAvailable: boolean;
};

export type RawMediaRecord = {
  id: string;
  sha256: string;
  originalFilename: string;
  intakePath: string;
  usbPath: string;
  bytes: number;
  ingestedAt: string;
  metadata: RawMediaMetadata;
  projectIds: string[];
};

export type RawMediaMetadata = {
  duration: number;
  container: string;
  videoCodec: string;
  width: number;
  height: number;
  frameRate: string;
  audioCodec: string | null;
  audioSampleRate: number | null;
  audioChannels: number | null;
  bitRate: number;
};

export type MediaOrigin =
  | { type: "local"; path: string }
  | { type: "remote"; url: string };

export type RemoteMediaCache = {
  relativePath: string;
  sha256: string;
  bytes: number;
  cachedAt: string;
};

export type VideoMediaMetadata = {
  duration: number;
  width: number;
  height: number;
  averageFps: number;
  videoCodec: string;
  audioCodec: string | null;
  container: string;
};

export type ProgramTimeline = {
  version: 1;
  clips: ProgramClip[];
  deletedClips?: DeletedProgramClip[];
};

export type DeletedProgramClip = {
  clip: ProgramClip;
  formerIndex: number;
  previousClipId: string | null;
  nextClipId: string | null;
  formerProgramStart: number;
  formerProgramEnd: number;
  deletedAt: string;
  editorialState: Pick<VideoProject, "overlays" | "videoOverlays" | "textOverlays">;
};

export type ProgramClip = {
  id: string;
  kind: "scene" | "source";
  sourceId: string;
  label: string;
  sourceStart: number;
  sourceEnd: number;
  sceneId: string | null;
  takeId: string | null;
  createdAt: string;
};

export type SubjectCutoutOverlay = {
  id: string;
  kind: "subject-cutout";
  subjectTrackId?: string;
  label: string;
  sourceId: string;
  sourceStart: number;
  sourceEnd: number;
  target: { type: "program-clip"; clipId: string; start: number; end: number };
  layout: OverlayLayout;
  crop: { top: number; right: number; bottom: number; left: number };
  layer: number;
  opacity: number;
  processing: CutoutProcessing;
  createdAt: string;
};

export type VideoOverlay = {
  id: string;
  kind: "video";
  label: string;
  sourceId: string;
  sourceStart: number;
  sourceEnd: number;
  target: { type: "selected-cut"; start: number; end: number };
  layout: OverlayLayout;
  layer: number;
  opacity: number;
  muted: boolean;
  createdAt: string;
};

export type TextOverlay = {
  id: string;
  kind: "text";
  role: "title" | "caption";
  text: string;
  target: { type: "selected-cut"; start: number; end: number } | { type: "program-clip"; clipId: string; sourceId: string; sourceStart: number; sourceEnd: number };
  layout: { anchor: "top" | "center" | "bottom"; x: number; y: number; maxWidth: number; safeZone: boolean };
  style: { fontFamily: "system-sans" | "classic-social" | "tiktok-sans"; fontSize: number; fontWeight: 400 | 600 | 700; color: string; backgroundColor: string | null; strokeColor: string | null; strokeWidth: number; shadow: boolean; align: "left" | "center" | "right" };
  layer: number;
  opacity: number;
  enabled: boolean;
  provenance: { sourceId: string | null; attribution: string | null };
  createdAt: string;
};

export type SubtitleTrack = {
  version: 1;
  visible: boolean;
  style: SubtitleStyle;
  cues: SubtitleCue[];
  deletedCues: DeletedSubtitleCue[];
};

export type SubtitleCue = {
  id: string;
  text: string;
  target: { type: "selected-cut"; start: number; end: number };
  provenance: { sourceId: string; clipId: string; sourceStart: number; sourceEnd: number; wordStart: number; wordEnd: number };
  createdAt: string;
};

export type DeletedSubtitleCue = { cue: SubtitleCue; formerIndex: number; deletedAt: string };

export type SubtitleStyle = TextOverlay["style"] & { anchor: "bottom"; x: number; y: number; maxWidth: number; safeZone: boolean; layer: number; opacity: number };

export type CutoutProcessing = {
  provider: "rembg-u2net-human" | "rembg-u2net-human-coreml";
  providerVersion: "1.0.0" | "2.0.0";
  status: "queued" | "processing" | "ready" | "failed";
  previewPath: string | null;
  renderPath: string | null;
  recipePath: string;
  error: string | null;
  jobId?: string | null;
  phase?: "queued" | "extracting" | "segmenting" | "encoding-preview" | "encoding-render" | "finalizing" | "ready" | "failed";
  progress?: number;
  statusPath?: string | null;
};

export type PitchAnalysisReference = {
  version: 2;
  artifactPath: "analysis/pitch-v2.json";
  algorithm: "normalized-autocorrelation";
  algorithmVersion: "1.1.0";
  sampleRate: number;
  windowSize: number;
  hopSize: number;
  confidenceThreshold: number;
  pointCount: number;
  voicedPointCount: number;
  generatedAt: string;
};

export type ExportReceipt = {
  version: 1 | 2 | 3;
  jobId: string;
  projectSnapshotHash: string;
  exportVersion: number;
  selectedCutDuration: number;
  outputPath: string;
  manifestPath: string;
  codec: { video: "hevc" | "h264"; audio: "aac" };
  width: number;
  height: number;
  bytes: number;
  createdAt: string;
  sourceCadence: ExportCadence | null;
  outputCadence: ExportCadence | null;
  qualityProfile: ExportQualityProfile | null;
  preset: ExportPreset | null;
  strategy: ExportStrategy | null;
  container: "mov" | "mp4" | null;
};

export type ExportCadence = { averageFps: number; reportedFps: number; frameCount: number };
export type ExportQualityProfile = { encoder: "libx264" | "h264_videotoolbox"; preset: "slow" | "veryfast" | "hardware"; crf: 14 | 18 | null; profile: "high"; level: "4.2"; pixelFormat: "yuv420p"; color: "bt709"; fpsMode: "cfr-60" | "cfr-30"; audio: "aac-lc-48k-256k" };
export type ExportPreset = "original-format" | "tiktok-60" | "tiktok-software" | "lan-review";
export type ExportStrategy = "stream-copy" | "partial-transcode" | "full-transcode";

export type AssetLibrary = {
  version: 1;
  assets: ImageAsset[];
  bundles: ImageAssetBundle[];
};

export type ImageAsset = {
  id: string;
  kind: "image";
  label: string;
  originalName: string;
  relativePath: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  importedAt: string;
  source: AssetSource;
};

export type AssetSource = {
  sourceUrl: string | null;
  attribution: string | null;
  license: string | null;
};

export type ImageAssetBundle = {
  id: string;
  kind: "image-candidates";
  label: string;
  source: AssetSource;
  candidateAssetIds: string[];
  selectedAssetId: string | null;
  createdAt: string;
};

export type ImageOverlay = {
  id: string;
  kind: "image";
  assetId: string;
  bundleId: string | null;
  label: string;
  target: OverlayTarget;
  layout: OverlayLayout;
  layer: number;
  opacity: number;
  createdAt: string;
};

export type OverlayTarget =
  | { type: "take"; sceneId: string; takeId: string; start: number; end: number }
  | { type: "selected-cut"; start: number; end: number };

export type OverlayLayout = {
  anchor: "top-left" | "top-right" | "center" | "bottom-left" | "bottom-right";
  x: number;
  y: number;
  width: number;
  height: number | null;
  fit: "contain" | "cover";
  placementIntent: "explicit" | "avoid-face-left" | "avoid-face-right";
};
