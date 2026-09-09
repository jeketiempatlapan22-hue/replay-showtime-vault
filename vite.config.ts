import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  define: {
    __APP_BUILD_ID__: JSON.stringify(String(Date.now())),
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      filename: "sw.js",
      devOptions: { enabled: false },
      includeAssets: ["favicon.ico", "favicon.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png"],
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallbackDenylist: [/^\/~oauth/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
            handler: "NetworkFirst",
            options: { cacheName: "html-nav", networkTimeoutSeconds: 5 },
          },
          {
            // JS/CSS harus selalu diperiksa ke jaringan supaya rilis baru langsung terpakai.
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin && ["script", "style"].includes(request.destination),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "app-code-v2" },
          },
          {
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin && ["font", "image"].includes(request.destination),
            handler: "CacheFirst",
            options: { cacheName: "static-media-v2", expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
