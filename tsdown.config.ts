import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: "packages/cli/src/index.ts",
    outDir: "dist/cli",
    platform: "node",
    env: { NODE_ENV: "production" },
  },
  {
    entry: "packages/daemon/src/index.ts",
    outDir: "dist/daemon",
    platform: "node",
    external: ["@undoable/sandbox", "dockerode", "ssh2", "cpu-features"],
    env: { NODE_ENV: "production" },
  },
  {
    entry: "packages/core/src/index.ts",
    outDir: "dist/core",
    platform: "node",
    env: { NODE_ENV: "production" },
  },
  {
    entry: "packages/llm-sdk/src/index.ts",
    outDir: "dist/llm-sdk",
    platform: "node",
    env: { NODE_ENV: "production" },
  },
  {
    entry: "packages/sandbox/src/index.ts",
    outDir: "dist/sandbox",
    platform: "node",
    inlineOnly: false,
    external: ["dockerode"],
    env: { NODE_ENV: "production" },
  },
  {
    entry: "packages/shared/src/index.ts",
    outDir: "dist/shared",
    platform: "node",
    env: { NODE_ENV: "production" },
  },
]);
