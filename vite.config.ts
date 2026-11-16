import { defineConfig, type Plugin } from "vite";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Content fingerprints for the playne models and pictures, so a changed file gets a new
// address and the iPad's offline cache can't keep showing the old one ("models/ch47.glb" ->
// "models/ch47.glb?v=1a2b3c4d"). Unchanged files keep their address (no re-download).
function assetVersions(dir = "public/models", prefix = "models"): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) Object.assign(out, assetVersions(full, `${prefix}/${name}`));
    else if (/\.(glb|webp)$/.test(name)) out[`${prefix}/${name}`] = createHash("sha1").update(readFileSync(full)).digest("hex").slice(0, 8);
  }
  return out;
}

// Relative base so the build works from any static host path (e.g. GitHub Pages /Playnes/).
const sha = (process.env.GITHUB_SHA ?? "local").slice(0, 7);
const date = new Date().toISOString().slice(0, 16).replace("T", " ");

// The test copy (PLAYNES_TEST=1, published at .../Playnes/test/): its own saved progress
// (see src/testCopy.ts) and a service worker that caches nothing, so every reload shows the
// newest test version and the stable game's offline cache is never involved.
const testCopy = process.env.PLAYNES_TEST === "1";
function testServiceWorker(): Plugin {
  let outDir = "dist";
  return {
    name: "playnes-test-sw",
    apply: "build",
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      if (!testCopy) return;
      writeFileSync(
        join(outDir, "sw.js"),
        `// Playnes TEST copy: no offline cache; always the newest files from the network.\nself.addEventListener("install", () => self.skipWaiting());\nself.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));\n`,
      );
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [testServiceWorker()],
  define: {
    __TEST__: JSON.stringify(testCopy),
    __BUILD__: JSON.stringify(`${sha} · ${date} UTC`),
    __ASSET_V__: JSON.stringify(assetVersions()),
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 6000,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
