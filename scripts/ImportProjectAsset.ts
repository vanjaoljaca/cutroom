async function main() {
  const projectId = requiredArgument("--project");
  const source = resolve(requiredArgument("--source"));
  const project = await readStoredProject(projectId);
  const metadata = await inspectImage(source);
  const hash = await hashFile(source);
  const id = `image-${hash.slice(0, 16)}`;
  const asset = await importAsset(project, source, id, hash, metadata);
  console.info(JSON.stringify({ event: "project_asset_imported", projectId, asset }));
}

async function importAsset(project: VideoProject, source: string, id: string, sha256: string, image: ImageInfo): Promise<ImageAsset> {
  const existing = project.assetLibrary.assets.find((asset) => asset.id === id);
  if (existing) return existing;
  const relativePath = `assets/${id}.${image.extension}`;
  await mkdir(join(projectDirectory(project.id), "assets"), { recursive: true });
  await copyFile(source, join(projectDirectory(project.id), relativePath));
  const info = await stat(source);
  const asset = { id, kind: "image" as const, label: optionalArgument("--label") || basename(source), originalName: basename(source), relativePath, mimeType: image.mimeType, width: image.width, height: image.height, bytes: info.size, sha256, importedAt: new Date().toISOString(), source: { sourceUrl: optionalArgument("--source-url") || null, attribution: optionalArgument("--attribution") || null, license: optionalArgument("--license") || null } };
  await writeStoredProject({ ...project, assetLibrary: { ...project.assetLibrary, assets: [...project.assetLibrary.assets, asset] } });
  return asset;
}

async function inspectImage(path: string): Promise<ImageInfo> {
  const extension = normalizedExtension(path);
  const { stdout } = await execFile(ffprobePath, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", path]);
  const stream = JSON.parse(stdout).streams?.[0];
  if (!stream?.width || !stream?.height) throw new Error("Image has no readable dimensions.");
  return { extension, mimeType: mimeTypes[extension], width: stream.width, height: stream.height };
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function normalizedExtension(path: string): ImageExtension {
  const extension = extname(path).toLowerCase().replace("jpeg", "jpg").slice(1);
  if (!(extension in mimeTypes)) throw new Error(`Unsupported image type: ${extension || "none"}`);
  return extension as ImageExtension;
}

function requiredArgument(name: string): string {
  const value = optionalArgument(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function optionalArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

void main().catch((error) => {
  console.error(JSON.stringify({ event: "project_asset_import_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

const ffprobePath = process.env.CUTROOM_FFPROBE || "ffprobe";
const mimeTypes = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;
type ImageExtension = keyof typeof mimeTypes;
type ImageInfo = { extension: ImageExtension; mimeType: typeof mimeTypes[ImageExtension]; width: number; height: number };

import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { ImageAsset, VideoProject } from "../src/analysis-model";
import { projectDirectory, readStoredProject, writeStoredProject } from "../server/project-store";

const execFile = promisify(execFileCallback);
