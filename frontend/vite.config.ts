import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // keep maplibre unbundled so its web worker file resolves
  optimizeDeps: { exclude: ["maplibre-gl"] },
  // the browser talks to our server, never to TfL directly
  server: { proxy: { "/api": "http://localhost:3001" } },
});
