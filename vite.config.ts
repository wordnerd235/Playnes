import { defineConfig } from "vite";

// Relative base so the build works from any static host path (e.g. GitHub Pages /Playnes/).
const sha = (process.env.GITHUB_SHA ?? "local").slice(0, 7);
const date = new Date().toISOString().slice(0, 16).replace("T", " ");

export default defineConfig({
  base: "./",
  define: {
    __BUILD__: JSON.stringify(`${sha} · ${date} UTC`),
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
