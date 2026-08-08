# Video task workflow

Each source video gets one visible Codex task. The task—not the webpage—is the workflow owner and semantic editor.

1. Create the project under the configured runtime root:

   ```sh
   npm run video:create -- --source /absolute/path/to/video.mov
   ```

2. Read the emitted `projectPath`. FluidAudio/Parakeet supplies timestamped words; the deterministic parser supplies only an initial scene/take proposal.
3. Use Codex reasoning and source evidence to correct scene boundaries, take grouping, selection, and order in `project.json`. Never present parser rules as Codex reasoning.
4. Open the emitted URL. The page is a projection of `project.json`; take selection, scene order, and trim changes save back to that file.
5. Create comparison clips or ask the user a focused question when the intended edit is ambiguous.

## Project image overlays

Assets live inside the project's directory and receive a content-derived stable ID:

```sh
npm run asset:import -- --project <project-id> --source /absolute/path/image.png --label "Reaction image"
```

### Five-candidate image bundles

Import each candidate with its own attribution, create one stable bundle, add candidates in display order, then attach the bundle's selected image:

```sh
npm run asset:import -- --project <project-id> --source /absolute/candidate-1.png \
  --label "Candidate 1" --source-url "https://source.example/image" \
  --attribution "Creator name" --license "License or usage note"
npm run bundle:create -- --project <project-id> --label "Motte and bailey" \
  --source-url "https://search-or-reference.example" --attribution "Candidate sources stored per asset"
npm run bundle:add -- --project <project-id> --bundle <bundle-id> --asset <candidate-1-asset-id>
# Repeat bundle:add for candidates 2–5 in the desired order.
npm run overlay:attach -- --project <project-id> --bundle <bundle-id> \
  --scene 2 --take 2 --start 0.25 --end 2.25 \
  --placement avoid-face-left --width 0.5 --layer 10 --label "Motte and bailey"
```

The bundle label names the editorial idea, not the chooser UI; do not append words such as “options” or “candidates.” The first added candidate becomes selected. Change it headlessly with:

```sh
npm run bundle:select -- --project <project-id> --bundle <bundle-id> --asset <candidate-asset-id>
```

Candidate selection updates the bundle and every attached overlay's `assetId` in one validated atomic project write. Clicking the labeled image clip opens its candidate thumbnails in a contextual popover; switching a candidate preserves timing, placement, size, opacity, and layer.

To attach a bundle to an existing overlay without changing its timing or layout:

```sh
npm run overlay:bundle -- --project <project-id> --overlay <overlay-id> --bundle <bundle-id>
```

Attach the emitted asset ID to a take-relative interval. Scene and take accept either their stable ID or their one-based order:

```sh
npm run overlay:attach -- --project <project-id> --asset <asset-id> \
  --scene 2 --take 1 --start 0.25 --end 2.75 \
  --placement avoid-face-left --width 0.34 --layer 10 --label "Scene 2 reaction"
```

For an interval in the assembled selected cut, use `--cut-start` and `--cut-end` instead of scene/take. Explicit placement accepts `--anchor`, normalized `--x`/`--y`, `--width`, optional `--height`, `--layer`, and `--opacity`. Remove an overlay, then an unreferenced asset, with:

```sh
npm run overlay:remove -- --project <project-id> --overlay <overlay-id>
npm run asset:remove -- --project <project-id> --asset <asset-id>
```

The same validated project contract is available over `GET`/`PUT /api/projects/:projectId`; image bytes are served by `GET /api/projects/:projectId/assets/:assetId`. Codex should use the CLI for asset copying and common mutations, then treat `project.json` as the inspectable source of truth.

## Pitch analysis

Create or refresh cached pitch data headlessly:

```sh
npm run pitch:analyze -- --project <project-id>
```

The artifact is `$CUTROOM_RUNTIME_ROOT/projects/<project-id>/analysis/pitch-v2.json`. `project.json` stores this validated reference:

```json
{
  "pitchAnalysis": {
    "version": 2,
    "artifactPath": "analysis/pitch-v2.json",
    "algorithm": "normalized-autocorrelation",
    "algorithmVersion": "1.1.0",
    "sampleRate": 16000,
    "windowSize": 2048,
    "hopSize": 320,
    "confidenceThreshold": 0.3,
    "pointCount": 2434,
    "voicedPointCount": 1191,
    "generatedAt": "<ISO timestamp>"
  }
}
```

API equivalents are `GET /api/projects/:projectId/pitch` and `POST /api/projects/:projectId/pitch`. The POST performs local analysis and returns the artifact.

## Export

Plan/render the source-preserving default, or explicitly request the TikTok delivery transcode:

```sh
npm run video:export -- --project <project-id> --preset original-format
npm run video:export -- --project <project-id> --preset tiktok-60
```

The glyph-only top-right export control exposes those same two choices. The supervised server contract is:

- `GET /api/projects/:projectId/exports` returns the current snapshot hash, latest receipt, and whether it is still current.
- `POST /api/projects/:projectId/exports` with `{ "preset": "original-format" }` or `{ "preset": "tiktok-60" }` starts or reuses an active job.
- `GET /api/projects/:projectId/exports/:jobId` returns `queued`, `exporting`, `completed`, `failed`, or `cancelled`, progress, message, error, and receipt.
- `DELETE /api/projects/:projectId/exports/:jobId` safely cancels an active job.
- `GET /api/projects/:projectId/exports/:jobId/file` serves only a completed MOV or MP4 receipt.

Completed receipts are appended to `project.json`:

```json
{
  "version": 3,
  "jobId": "export-...",
  "projectSnapshotHash": "sha256...",
  "selectedCutDuration": 5.68,
  "outputPath": "exports/img-9340-tiktok-60-....mp4",
  "manifestPath": "exports/collision-safe-name.json",
  "codec": { "video": "h264", "audio": "aac" },
  "preset": "tiktok-60",
  "strategy": "full-transcode",
  "container": "mp4",
  "width": 1080,
  "height": 1920,
  "sourceCadence": { "averageFps": 59.996, "reportedFps": 60, "frameCount": 2926 },
  "outputCadence": { "averageFps": 60, "reportedFps": 60, "frameCount": 340 },
  "qualityProfile": { "encoder": "libx264", "preset": "slow", "crf": 14, "profile": "high", "level": "4.2", "pixelFormat": "yuv420p", "color": "bt709", "fpsMode": "cfr-60", "audio": "aac-lc-48k-256k" },
  "bytes": 15199190,
  "createdAt": "<ISO timestamp>"
}
```

All files, manifests, plans, and partials stay under the project's Cutroom runtime directory. The original-format manifest lists copy/transcode intent and the exact blocker when safe smart rendering is impossible. A delivery file is not presented until ffprobe and its preset validator pass.

A video task should not modify editor code; route missing tools, state-machine defects, and UI changes back to the editor-development task.
