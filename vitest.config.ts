import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { randomBytes } from "node:crypto";

const migrations = await readD1Migrations("./migrations");

const testRateLimit = (namespaceId: string, limit = 1000) => ({ namespace_id: namespaceId, simple: { limit, period: 60 as const } });
const ephemeralTestSecret = () => randomBytes(32).toString("base64url");

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./src/worker.ts",
      miniflare: {
        compatibilityDate: "2026-08-16",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: { DB: "community-test" },
        analyticsEngineDatasets: { ANALYTICS: { dataset: "community_test" } },
        ratelimits: {
          AUTH_RATE_LIMITER: testRateLimit("9101"),
          WRITE_RATE_LIMITER: testRateLimit("9102"),
          SEARCH_RATE_LIMITER: testRateLimit("9103", 2),
          REACTION_RATE_LIMITER: testRateLimit("9104"),
          REPORT_RATE_LIMITER: testRateLimit("9105"),
        },
        bindings: {
          TEST_MIGRATIONS: migrations,
          APP_ENV: "test",
          CANONICAL_ORIGIN: "https://militaristhumanism.com",
          AUTH_ALLOWED_HOSTS: "militaristhumanism.com",
          AUTH_BASE_FALLBACK: "https://militaristhumanism.com",
          COMMUNITY_READ_ONLY: "false",
          TURNSTILE_MODE: "disabled",
          TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
          ANALYTICS_DATASET: "community_test",
          AUTH_SECRET: ephemeralTestSecret(),
          GOOGLE_CLIENT_ID: ephemeralTestSecret(),
          GOOGLE_CLIENT_SECRET: ephemeralTestSecret(),
          APPLE_CLIENT_ID: "",
          APPLE_TEAM_ID: "",
          APPLE_KEY_ID: "",
          APPLE_PRIVATE_KEY: "",
          TURNSTILE_SECRET: "",
          ADMIN_BOOTSTRAP_EMAILS: "",
          ANALYTICS_READ_TOKEN: "",
          CLOUDFLARE_ACCOUNT_ID: "",
          E2E_TEST_TOKEN: ephemeralTestSecret(),
        },
      },
    }),
  ],
  test: {
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    reporters: ["default"],
    coverage: { enabled: false },
  },
});
