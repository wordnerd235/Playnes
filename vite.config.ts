import { defineConfig } from "vite";

// Relative base so the build works from any static host path (e.g. GitHub Pages /Playnes/).
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 6000,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
