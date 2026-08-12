async function main() {
  await mkdir(serverDirectory, { recursive: true });
  await mkdir(scriptDirectory, { recursive: true });
  await mkdir(assetDirectory, { recursive: true });
  await build({ entryPoints: [join(appRoot, "scripts/CutroomServer.ts")], outfile: join(serverDirectory, "CutroomServer.mjs"), bundle: true, platform: "node", target: "node23", format: "esm", packages: "bundle", sourcemap: true });
  await copyFile(join(appRoot, "scripts/RemoveVideoBackground.py"), join(scriptDirectory, "RemoveVideoBackground.py"));
  await copyFile(join(appRoot, "src/assets/tiktok-sans/TikTokSans-Variable.ttf"), join(assetDirectory, "TikTokSans-Variable.ttf"));
  await copyFile(join(appRoot, "src/assets/tiktok-sans/OFL.txt"), join(assetDirectory, "TikTokSans-OFL.txt"));
  console.info(JSON.stringify({ scope: "com.vanja.cutroom", event: "service_runtime_built", serverDirectory }));
}

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverDirectory = join(appRoot, "dist/server");
const scriptDirectory = join(appRoot, "dist/scripts");
const assetDirectory = join(serverDirectory, "assets");

void main().catch((error) => {
  console.error(JSON.stringify({ scope: "com.vanja.cutroom", event: "service_runtime_build_failed", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
