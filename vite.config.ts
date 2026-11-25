import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { VitePWA, type VitePWAOptions } from "vite-plugin-pwa";

const pwaOptions: Partial<VitePWAOptions> = {
  registerType: "prompt",
  injectRegister: false,
  // Our own worker, so it can also stream split files (src/sw.ts).
  strategies: "injectManifest",
  srcDir: "src",
  filename: "sw.ts",

  pwaAssets: {
    disabled: false,
    config: true,
  },

  manifest: {
    name: "Madhuram",
    short_name: "Madhuram",
    description: "Only music, no ads",
    theme_color: "#ffffff",
    background_color: "#ffffff",
    display: "standalone",
  },

  injectManifest: {
    globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
    // Dev tools (over 1 MB) load only when opened, not on every install.
    globIgnores: ["**/eruda*"],
  },

  devOptions: {
    enabled: true,
    suppressWarnings: true,
    type: "module",
  },
};

// https://vite.dev/config/
export default defineConfig({
  base: "/", // Important for subdomain
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "src/routes", // IMPORTANT
      generatedRouteTree: "src/routeTree.gen.ts",
    }),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    tailwindcss(),
    VitePWA(pwaOptions),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
  },
});
