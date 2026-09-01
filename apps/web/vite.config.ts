import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // No rewrite: the backend mounts every real router AT /api/... itself
      // (e.g. /api/auth/login, /api/admin/..., /api/user/...) — only
      // /api/health is mounted bare. Stripping /api here only happened to
      // work for that one health-check route and would 404 everything else.
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
