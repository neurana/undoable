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
    },
  },
  publicDir: "assets",
  build: {
    outDir: "dist",
  },
});
