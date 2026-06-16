import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the build works under the GitHub Pages project subpath
// (https://<user>.github.io/worship-leader/) without hardcoding the repo name.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
