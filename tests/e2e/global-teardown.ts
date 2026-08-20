import { execFileSync } from "node:child_process";
import path from "node:path";

export default function globalTeardown(): void {
  execFileSync(
    process.execPath,
    [path.resolve("node_modules/wrangler/bin/wrangler.js"), "d1", "execute", "DB", "--local", `--file=${path.resolve("tests/fixtures/e2e-cleanup.sql")}`],
    { cwd: process.cwd(), stdio: "inherit" },
  );
}
