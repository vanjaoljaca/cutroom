# Stitch editing contract

Cutroom keeps edit truth in each runtime-backed `project.json`. SQLite may later index that state, but callers use the CLI/API and project schema rather than the storage implementation.

## Reference sources

Add a remotely regenerable reference:

```sh
npm run media:reference:add -- <project-id> <remote-url> "Reference label"
```

This adds `mediaLibrary.sources[]` with a stable `media.reference.*` ID, durable remote origin, metadata, and disposable `cache/media/<sha256>.<ext>` under `$CUTROOM_RUNTIME_ROOT`.

HTTP equivalents:

```text
POST   /api/projects/:projectId/media/references
GET    /api/projects/:projectId/media/:sourceId
POST   /api/projects/:projectId/media/:sourceId/cache
DELETE /api/projects/:projectId/media/:sourceId
```

The POST body is `{ "url": "https://…", "label": "…" }`. A reference cannot be removed while a `programTimeline.clips[]` record still uses it.

## Program timeline

`programTimeline.clips[]` is the exported movie order. Scene clips and inserted reference clips share the same contract:

```json
{
  "id": "clip.source.<stable-id>",
  "kind": "source",
  "sourceId": "media.reference.<stable-id>",
  "label": "Referenced post",
  "sourceStart": 12.4,
  "sourceEnd": 15.1,
  "sceneId": null,
  "takeId": null,
  "createdAt": "2026-08-08T12:00:00.000Z"
}
```

The Source workspace marks an interval and inserts it before/after the selected clip or at either end. Reordering ripples later clips; project autosave persists order and trims.

## Subject cutouts

Create a local person cutout and attach it to a program clip:

```sh
npm run video:cutout -- <project-id> <source-id> <source-start> <source-end> <target-clip-id> "Me watching"
```

HTTP equivalents:

```text
POST /api/projects/:projectId/cutouts
GET  /api/projects/:projectId/cutouts/:jobId
GET  /api/projects/:projectId/cutouts/:cutoutId/preview
```

POST body:

```json
{
  "sourceId": "media.primary",
  "sourceStart": 12.1,
  "sourceEnd": 14.6,
  "targetClipId": "clip.source.example",
  "label": "Me watching"
}
```

The durable `cutoutOverlays[]` record owns the source interval, clip-relative target interval, normalized position/size, opacity, layer, provider/version, status, and runtime-relative preview/render/recipe paths. Preview artifacts are VP9-alpha WebM; export artifacts are ProRes 4444 alpha MOV. The installed runtime and model live under `$CUTROOM_RUNTIME_ROOT/runtime/rembg`.

TikTok export composites all program sources, images, and ready cutouts at 1080×1920/60 fps. Original-format export rejects a multi-source stitch when bitstream-safe smart rendering is unavailable instead of silently transcoding it.
