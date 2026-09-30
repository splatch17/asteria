import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  // GitHub Pages serves the app under /asteria/
  base: process.env.BASE_PATH ?? "/",
  plugins: [svelte()],
});
