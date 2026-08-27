import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export default async function globalSetup() {
  const repositoryRoot = process.cwd();
  const databaseDirectory = join(
    repositoryRoot,
    ".wrangler",
    "state",
    "v3",
    "d1",
    "miniflare-D1DatabaseObject",
  );

  let databaseNames = [];
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      databaseNames = (await readdir(databaseDirectory)).filter((name) =>
        /^[a-f0-9]{64}\.sqlite$/u.test(name),
      );
    } catch {
      databaseNames = [];
    }
    if (databaseNames.length === 1) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (databaseNames.length !== 1) {
    throw new Error(`Expected one local D1 database, found ${databaseNames.length}.`);
  }

  const database = new DatabaseSync(join(databaseDirectory, databaseNames[0]));
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const migrationNames = (await readdir(join(repositoryRoot, "migrations")))
    .filter((name) => /^\d{4}_.+\.sql$/u.test(name))
    .sort();
  if (migrationNames.length !== 7) {
    throw new Error(`Expected seven migrations, found ${migrationNames.length}.`);
  }
  const recordMigration = database.prepare("INSERT INTO d1_migrations (name) VALUES (?)");
  const appliedMigrations = new Set(
    database.prepare("SELECT name FROM d1_migrations").all().map((row) => row.name),
  );
  for (const migrationName of migrationNames) {
    if (appliedMigrations.has(migrationName)) continue;
    database.exec(await readFile(join(repositoryRoot, "migrations", migrationName), "utf8"));
    recordMigration.run(migrationName);
  }
  database.exec(
    await readFile(join(repositoryRoot, "tests", "fixtures", "e2e-cleanup.sql"), "utf8"),
  );
  database.exec(
    await readFile(join(repositoryRoot, "tests", "fixtures", "e2e-seed.sql"), "utf8"),
  );
  database.close();
}
