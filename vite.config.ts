import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendors into their own long-cacheable chunks so the app
        // code (which changes every deploy) stays small — matters for players
        // loading over mobile data.
        manualChunks: {
          react: ["react", "react-dom"],
          motion: ["framer-motion"],
          colyseus: ["colyseus.js"],
        },
      },
    },
  },
});
