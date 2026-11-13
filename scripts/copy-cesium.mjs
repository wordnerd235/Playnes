// Copies CesiumJS runtime assets (workers, widgets CSS, textures) into public/cesium
// so Vite serves them as static files. Runs automatically before dev and build.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "cesium", "Build", "Cesium");
const dest = join(root, "public", "cesium");
const version = JSON.parse(readFileSync(join(root, "node_modules", "cesium", "package.json"), "utf8")).version;
const stamp = join(dest, ".version");

if (existsSync(stamp) && readFileSync(stamp, "utf8") === version) {
  console.log(`cesium ${version} assets already in public/cesium`);
} else {
  mkdirSync(dest, { recursive: true });
  for (const dir of ["Workers", "ThirdParty", "Assets", "Widgets"]) {
    cpSync(join(src, dir), join(dest, dir), { recursive: true });
  }
  writeFileSync(stamp, version);
  console.log(`copied cesium ${version} assets to public/cesium`);
}
