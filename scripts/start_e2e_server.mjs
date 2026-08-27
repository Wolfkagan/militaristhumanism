import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repositoryRoot = process.cwd();
const wranglerEntry = join(repositoryRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const runId = randomUUID().replaceAll("-", "");
const runPath = join(
  repositoryRoot,
  ".tmp",
  `e2e-run-${runId}`,
);
const persistencePath = await mkdtemp(join(tmpdir(), "mh-e2e-state-"));
await mkdir(runPath, { recursive: true });
await writeFile(join(repositoryRoot, ".tmp", "e2e-state-path.txt"), persistencePath, "utf8");
const wranglerEnvironment = {
  ...process.env,
  WRANGLER_LOG_PATH: join(runPath, "logs"),
};
await mkdir(wranglerEnvironment.WRANGLER_LOG_PATH, { recursive: true });

const e2eTestToken =
  process.env.E2E_TEST_TOKEN ??
  "local-browser-e2e-token-with-more-than-thirty-two-characters";
const child = spawn(
  process.execPath,
  [
    wranglerEntry,
    "dev",
    "--port",
    "8789",
    "--persist-to",
    persistencePath,
    "--compatibility-date",
    "2026-08-26",
    "--var",
    "APP_ENV:test",
    "--var",
    "TURNSTILE_MODE:disabled",
    "--var",
    "AUTH_ALLOWED_HOSTS:0.0.0.0,127.0.0.1,localhost",
    "--var",
    "AUTH_BASE_FALLBACK:http://127.0.0.1:8789",
    "--var",
    "AUTH_SECRET:local-browser-e2e-auth-secret-with-more-than-thirty-two-characters",
    "--var",
    "AUDIT_INTEGRITY_SECRET:local-browser-e2e-audit-secret-with-more-than-thirty-two-characters",
    "--var",
    `E2E_TEST_TOKEN:${e2eTestToken}`,
  ],
  { cwd: repositoryRoot, stdio: "inherit", env: wranglerEnvironment },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}
child.once("error", (error) => {
  throw error;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
