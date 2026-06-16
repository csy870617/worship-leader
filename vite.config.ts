import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Relative base so the build works under the GitHub Pages project subpath
// (https://<user>.github.io/worship-leader/) without hardcoding the repo name.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "찬양 곡 모음",
        short_name: "찬양곡",
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
        navigateFallback: "index.html",
      },
    }),
  ],
});
