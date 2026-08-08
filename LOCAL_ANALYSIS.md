# Local analysis runtime

Cutroom's local speech adapter is intentionally separate from its project format and UI.

- Runtime: FluidAudio `v0.15.3`, commit `3c6e79f1d74411cae1f3daf50260dd19a585dc2d`
- CLI/build cache: `$CUTROOM_RUNTIME_ROOT/runtime`
- Working jobs: `$CUTROOM_RUNTIME_ROOT/jobs`
- Model: FluidVoice's existing `parakeet-tdt-0.6b-v2-coreml`
- Output: transcript plus word-level start/end timestamps and confidence

The per-video Codex task invokes `npm run video:create -- --source <absolute-path>`. The tool writes its job and project under the configured runtime root, extracts 16 kHz mono audio with FFmpeg, invokes FluidAudio with argv arrays, and produces our own `VideoProject` contract. The browser only opens an existing project; it contains no source-media picker.

`VideoProject` is the state machine: source, timestamped words, scenes, ordered takes, selected takes, the current cut, a project-owned image asset library, and deterministic image-overlay records. Browser changes persist to `project.json`, where the owning Codex task can inspect and revise them.

Assets are copied under `$CUTROOM_RUNTIME_ROOT/projects/<project-id>/assets`. Overlay target times are either relative to a named take or absolute in the assembled selected cut. Final placement is normalized to the video frame, so playback does not depend on viewport pixels; `avoid-face-left` and `avoid-face-right` preserve the placement intent alongside the resolved geometry.

## Pitch analysis

`npm run pitch:analyze -- --project <project-id>` reuses the project's existing 16 kHz mono USB audio and writes `analysis/pitch-v2.json` inside that project. The artifact is validated before `project.json` receives its compact `pitchAnalysis` reference. It records the detector (`normalized-autocorrelation` `1.1.0`), sample rate, window and hop sizes, confidence threshold, generation time, and timestamped `{ time, hz, confidence }` points. Unvoiced points use `hz: null` so the UI never draws a misleading line through silence. V2 uses a 128 ms analysis window, a 20 ms hop, a speech-focused 60–500 Hz range, and a calibrated 0.30 autocorrelation threshold. V1 references are normalized to unavailable and regenerated on demand instead of being mistaken for current cache data.

The Pitch toggle is UI-local and defaults off. Selected-cut mode maps source pitch points through the chosen takes in assembled order and starts a new SVG segment at every cut boundary; original mode uses source time directly. The graph labels octave C notes with Hz, has its own time axis, states voiced coverage, and explicitly identifies gaps as unvoiced or below confidence. Pitch loading or analysis failure never gates video loading or playback.

## Deterministic export presets

The glyph-only header control exposes two explicit presets. `original-format` is the default CLI/API intent and preserves the source HEVC/hvc1 MOV plus AAC by stream copy only when every cut is random-access aligned and no pixel-changing overlay applies. Its planner records each assembled interval as copyable or transcode-required. When an edit would require an unsafe mixture of Apple hvc1 GOPs and independently encoded libx265 spans, it writes a blocked plan manifest and refuses to silently full-transcode.

`npm run video:export -- --project <project-id> --preset tiktok-60` is the separately authorized delivery transcode. It renders once from the project/source to H.264 High Profile MP4 at exact constant 60 fps, CRF 14/slow, 1080×1920 square-pixel yuv420p BT.709, and 48 kHz stereo AAC-LC at 256 kb/s. Bundle overlays resolve through their persisted selected asset; selected-cut overlays are composited in assembled movie time and can cross take boundaries. The TikTok validator requires MP4/H.264/AAC, 23–60 fps and Cutroom's exact 60 fps contract, portrait dimensions, BT.709, and a file below 4 GB.

Exports and JSON manifests live in `projects/<project-id>/exports`. Filenames include the preset, timestamp, project snapshot hash, and job suffix. Partials remain in `.partials`. Completed receipts disclose preset, stream-copy/full-transcode strategy, container, source/output cadence and frame counts, codec, quality profile, dimensions, bytes, and creation time. A later edit makes that receipt visibly stale.

The default runtime root is `~/Movies/Cutroom`. Paths can be replaced with `CUTROOM_RUNTIME_ROOT`, `CUTROOM_TRANSCRIBER`, `CUTROOM_TRANSCRIPTION_MODEL`, `CUTROOM_FFMPEG`, and `CUTROOM_FFPROBE` without changing the editor.
