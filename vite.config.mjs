export default defineConfig({
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local", "capcut"],
    warmup: {
      clientFiles: ["./src/main.tsx"],
    },
  },
  plugins: [videoProjectPlugin(), react()],
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { videoProjectPlugin } from "./server/video-project-api";
