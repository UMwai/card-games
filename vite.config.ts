import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/socket.io": {
        target: "http://localhost:4173",
        ws: true
      },
      "/api": "http://localhost:4173"
    }
  },
  build: {
    outDir: "dist",
    sourcemap: true
  }
});
