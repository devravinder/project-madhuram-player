import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { VitePWA, type VitePWAOptions } from "vite-plugin-pwa";

const pwaOptions: Partial<VitePWAOptions> = {
  registerType: "prompt",
  injectRegister: false,

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

  workbox: {
    globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
    cleanupOutdatedCaches: true,
    clientsClaim: true,
    // navigateFallback: 'index.html',
    navigateFallback: null, // Important for subdomain
    // navigateFallbackDenylist: [/^\/src/],
  },

  devOptions: {
    enabled: true,
    navigateFallback: "index.html",
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
