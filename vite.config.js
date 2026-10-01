import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
  ],
  build: {
    // The 3D view (three.js + react-three) is a lazily loaded ~1 MB chunk; the 2D editor loads without it.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ["src/**/*.test.js"],
  },
});
