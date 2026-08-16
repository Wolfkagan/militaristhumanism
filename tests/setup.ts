import { beforeEach } from "vitest";
import { applyD1Migrations, env, reset } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-pool-workers";

beforeEach(async () => {
  const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };
  await reset();
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});
