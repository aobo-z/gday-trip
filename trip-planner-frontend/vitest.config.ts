import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

// Page tests render the real app in jsdom against a fake backend (tests/server.ts).
export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    // Each page test signs in and renders the whole app, which takes a moment in jsdom.
    testTimeout: 15_000,
    env: { VITE_API_URL: "http://api.test/api", VITE_GOOGLE_MAPS_KEY: "", VITE_GOOGLE_MAP_ID: "" },
  },
}));
