import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Prefer 127.0.0.1 so the proxy matches the API (Windows `localhost` can hit ::1 while Node listens on IPv4). */
/**
 * On some Windows setups, `127.0.0.1` traffic can fail while `localhost` works.
 * Use `localhost` here so `/api` and `/uploads` proxying matches the browser's reachable loopback.
 */
const backendOrigin = "http://localhost:5000";

const backendProxy = {
  "/api": {
    target: backendOrigin,
    changeOrigin: true,
  },
  // Direct /upload/* hits (e.g. mis-set AGC_API_URL to the Vite origin) forward to Express; same as /api/upload/*.
  "/upload": {
    target: backendOrigin,
    changeOrigin: true,
  },
  "/uploads": {
    target: backendOrigin,
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Browser calls same origin `/api/*`; Vite forwards to the Express app on 5000.
    proxy: backendProxy,
  },
  // `npm run preview` also needs this or `/api` hits the static server and returns 404.
  preview: {
    proxy: backendProxy,
  },
});
