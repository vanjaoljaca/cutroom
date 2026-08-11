# Stitch editing contract

Cutroom keeps edit truth in each USB-backed `project.json`. SQLite may later index that state, but callers use the CLI/API and project schema rather than the storage implementation.

## Shared raw recordings

Raw recordings are deduplicated by SHA-256 in `/Volumes/VanjaOljacaX/Cutroom/raw-videos/raw-media.json`. Projects reference stable `raw.*` records through `mediaLibrary.sources[].rawMediaId`, so one recording can feed many projects and one project can use many recordings.

```sh
npm run raw-media -- ingest --path /absolute/path/to/recording.mov
npm run raw-media -- attach --project <project-id> --raw <raw-id> --role instruction --primary true
npm run raw-media -- detach --project <project-id> --raw <raw-id>
npm run recording:link-raw -- --raw <raw-id>
```

HTTP equivalents are `GET|POST /api/raw-media` and `POST|DELETE /api/projects/:projectId/media/raw[/:rawMediaId]`. Ingesting the same bytes twice returns the existing record and durable file. Cutroom fails clearly when `/Volumes/VanjaOljacaX/Cutroom` is unavailable; media never falls back to Downloads, `/tmp`, or a home cache.

## Reference sources

Add a remotely regenerable reference:

```sh
npm run media:reference:add -- <project-id> <remote-url> "Reference label"
```

This adds `mediaLibrary.sources[]` with a stable `media.reference.*` ID, durable remote origin, metadata, and disposable `cache/media/<sha256>.<ext>` under `/Volumes/VanjaOljacaX/Cutroom`.

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

The durable `cutoutOverlays[]` record owns the source interval, clip-relative target interval, normalized position/size, opacity, layer, provider/version, status, and USB-relative preview/render/recipe paths. Preview artifacts are VP9-alpha WebM; export artifacts are ProRes 4444 alpha MOV. The installed runtime and model live under `/Volumes/VanjaOljacaX/Cutroom/runtime/rembg`.

TikTok export composites all program sources, images, and ready cutouts at 1080×1920/60 fps. Original-format export rejects a multi-source stitch when bitstream-safe smart rendering is unavailable instead of silently transcoding it.

## Rectangular video overlays

Attach a project-owned picture-in-picture video:

```sh
npm run video-overlay:attach -- \
  --project <project-id> --path /absolute/path/to/overlay.mp4 --label "App demo" \
  --source-start 0 --source-end 11.33 --target-start 78.60 --target-end 89.93 \
  --x 0.03 --y 0.05 --width 0.32 --fit contain --placement avoid-face-left \
  --opacity 1 --muted true --layer 20
```

`videoOverlays[]` owns a stable ID, source interval, assembled-program target interval, normalized layout, aspect-preserving fit, opacity, mute state, layer, and source provenance. Preview, move, resize, trim, reload, and TikTok export all consume that same record. Original-format export reports a blocked source-preserving plan when compositing would require a transform; it never silently substitutes a transcode.
