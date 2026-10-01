import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig(({ mode }) => ({
  // GitHub Pages serves the app under /asteria/
  base: process.env.BASE_PATH ?? "/",
  // `--mode phone`: self-signed HTTPS for testing on a phone over Wi-Fi
  // (Brave forces HTTPS, and orientation sensors need a secure context).
  plugins: [svelte(), ...(mode === "phone" ? [basicSsl()] : [])],
}));
