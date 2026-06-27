import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

// The Cloudflare plugin reads wrangler.jsonc, runs the Worker in workerd during
// `vite dev` (with the real ASSETS + local D1 bindings and HMR), and bundles the
// Worker plus the client on `vite build`.
export default defineConfig({
  plugins: [react(), cloudflare()],
  server: {
    // Dev-only: accept arbitrary Host headers so redirect hostnames (e.g.
    // demo.example.com) can be exercised locally via a Host header. This only
    // affects `vite dev`; production runs on Cloudflare with no Vite server.
    allowedHosts: true,
  },
});

