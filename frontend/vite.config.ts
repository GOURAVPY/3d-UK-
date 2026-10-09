import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // the browser talks to our server, never to TfL directly
  server: { proxy: { "/api": "http://localhost:3001" } },
});
