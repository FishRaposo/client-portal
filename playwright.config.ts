import { defineConfig } from "@playwright/test";
import { makePlaywrightOptions } from "./shared/testing/playwright.config";

// e2e runs against the built demo export served under the Pages base path.
// The repo's playwright.config.ts overrides baseURL/command with its
// client-portal — see npm run serve:demo.
export default defineConfig(
  makePlaywrightOptions({
    port: 3112,
    baseURL: "http://127.0.0.1:3112/client-portal/",
    command:
      "python scripts/serve_demo.py --port 3112 --base-path client-portal",
    testDir: "./frontend/tests/e2e",
  }),
);
