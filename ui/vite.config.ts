import { defineConfig } from "vite";

export default defineConfig({
  appType: "spa",
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:7433",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api/, ""),
      },
      "/__undoable__": {
        target: "http://localhost:7433",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  publicDir: "assets",
  build: {
    outDir: "dist",
  },
});
