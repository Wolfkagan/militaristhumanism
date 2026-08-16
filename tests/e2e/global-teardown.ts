import { execFileSync } from "node:child_process";
import path from "node:path";

export default function globalTeardown(): void {
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  execFileSync(
    executable,
    ["wrangler", "d1", "execute", "DB", "--local", `--file=${path.resolve("tests/fixtures/e2e-cleanup.sql")}`],
    { cwd: process.cwd(), stdio: "inherit" },
  );
}
