import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Relative base so the build works under the GitHub Pages project subpath
// (https://<user>.github.io/worship-leader/) without hardcoding the repo name.
export default defineConfig({
  base: "./",
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ["firebase/app", "firebase/auth", "firebase/firestore"],
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Worship Leader",
        short_name: "Worship Leader",
        description: "찬양 인도자를 위한 코드별·주제별·템포별 찬양곡 모음",
        lang: "ko",
        theme_color: "#4f46e5",
        background_color: "#ffffff",
        display: "standalone",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff,woff2}"],
        // keep the heavy PDF libs out of the upfront precache; they load on demand
        globIgnores: ["**/{jspdf,html2canvas,purify}*.js"],
        navigateFallback: "index.html",
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
});
