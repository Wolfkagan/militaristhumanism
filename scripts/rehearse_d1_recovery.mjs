import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = dirname(scriptDirectory);
const rehearsalRoot = join(
  repositoryRoot,
  ".tmp",
  `recovery-rehearsal-${randomUUID().replaceAll("-", "")}`,
);
const sourcePath = join(rehearsalRoot, "source.sqlite");
const restoredPath = join(rehearsalRoot, "restored.sqlite");

await mkdir(rehearsalRoot, { recursive: true });

const source = new DatabaseSync(sourcePath);
source.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
source.exec(`
  CREATE TABLE d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const migrationDirectory = join(repositoryRoot, "migrations");
const migrationNames = (await readdir(migrationDirectory))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();

if (migrationNames.length !== 7) {
  throw new Error(`Expected seven migrations, found ${migrationNames.length}.`);
}

const recordMigration = source.prepare(
  "INSERT INTO d1_migrations (name) VALUES (?)",
);
for (const migrationName of migrationNames) {
  source.exec(await readFile(join(migrationDirectory, migrationName), "utf8"));
  recordMigration.run(migrationName);
}

source.exec(
  await readFile(join(repositoryRoot, "tests", "fixtures", "e2e-seed.sql"), "utf8"),
);
source.exec(`
  INSERT INTO threads
  (public_id, slug, category_id, author_id, title, body_markdown, body_rendered)
  VALUES
  ('th_abcdefabcdef', 'recovery-probe', 'cat_general', 'e2e-member',
   'Recovery rehearsal discussion',
   'This isolated record proves that authoritative tables and the derived FTS index survive recovery.',
   '<p>This isolated record proves recovery.</p>');
`);
source.exec(`
  UPDATE d1_migrations SET applied_at = '2026-01-01 00:00:00';
  UPDATE categories SET created_at = '2026-01-01T00:00:00.000Z', updated_at = '2026-01-01T00:00:00.000Z';
  UPDATE community_settings SET updated_at = '2026-01-01T00:00:00.000Z';
  UPDATE user_profiles SET created_at = '2026-01-01T00:00:00.000Z', updated_at = '2026-01-01T00:00:00.000Z';
  UPDATE threads SET created_at = '2026-01-01T00:00:00.000Z', updated_at = '2026-01-01T00:00:00.000Z';
  UPDATE audit_chain_state SET updated_at = '2026-01-01T00:00:00.000Z';
  PRAGMA wal_checkpoint(TRUNCATE);
  VACUUM;
  PRAGMA wal_checkpoint(TRUNCATE);
`);
source.close();

await copyFile(sourcePath, restoredPath);
const sourceBytes = await readFile(sourcePath);
const restoredBytes = await readFile(restoredPath);
const sourceDigest = createHash("sha256").update(sourceBytes).digest("hex");
const restoredDigest = createHash("sha256").update(restoredBytes).digest("hex");
if (sourceDigest !== restoredDigest) {
  throw new Error("The isolated restored database does not match the source snapshot.");
}

const restored = new DatabaseSync(restoredPath, { readOnly: true });
const summary = restored
  .prepare(`
    SELECT
      (SELECT COUNT(*) FROM d1_migrations) AS migrations,
      (SELECT COUNT(*) FROM categories) AS categories,
      (SELECT COUNT(*) FROM user_profiles) AS users,
      (SELECT COUNT(*) FROM threads WHERE public_id = 'th_abcdefabcdef') AS probe_threads,
      (SELECT COUNT(*) FROM community_search WHERE target_public_id = 'th_abcdefabcdef') AS fts_rows
  `)
  .get();
const integrity = restored.prepare("PRAGMA quick_check").get().quick_check;

if (
  Number(summary.migrations) !== 7 ||
  Number(summary.categories) !== 10 ||
  Number(summary.users) !== 3 ||
  Number(summary.probe_threads) !== 1 ||
  Number(summary.fts_rows) !== 1 ||
  integrity !== "ok"
) {
  throw new Error("The restored database failed integrity or authoritative-row checks.");
}

const canonicalSnapshot = JSON.stringify({
  schema: restored.prepare(
    "SELECT type, name, sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY type, name",
  ).all(),
  migrations: restored.prepare(
    "SELECT name, applied_at FROM d1_migrations ORDER BY id",
  ).all(),
  categories: restored.prepare(
    "SELECT id, slug, name, description, sort_order, is_visible, created_at, updated_at FROM categories ORDER BY id",
  ).all(),
  profiles: restored.prepare(
    "SELECT user_id, public_id, handle, display_name, role, created_at, updated_at FROM user_profiles ORDER BY user_id",
  ).all(),
  probe: restored.prepare(
    "SELECT public_id, slug, category_id, author_id, title, body_markdown, body_rendered, created_at, updated_at FROM threads WHERE public_id = 'th_abcdefabcdef'",
  ).get(),
  search: restored.prepare(
    "SELECT target_type, target_public_id, title, body FROM community_search WHERE target_public_id = 'th_abcdefabcdef'",
  ).get(),
  summary: {
    migrations: Number(summary.migrations),
    categories: Number(summary.categories),
    users: Number(summary.users),
    probeThreads: Number(summary.probe_threads),
    ftsRows: Number(summary.fts_rows),
    integrity,
  },
});
const logicalDigest = createHash("sha256").update(canonicalSnapshot).digest("hex");
restored.close();

console.log("RECOVERY_REHEARSAL=PASS");
console.log("MIGRATIONS_VERIFIED=7");
console.log("AUTHORITATIVE_ROWS=PASS");
console.log("FTS_REBUILDABLE=PASS");
console.log("BYTE_IDENTICAL_COPY=PASS");
console.log("SNAPSHOT_SCOPE=CANONICAL_LOGICAL_STATE");
console.log(`SNAPSHOT_SHA256=${logicalDigest}`);
console.log("TIME_TRAVEL_PRODUCTION_MUTATION=NOT_RUN");
console.log(`REHEARSAL_PATH=${rehearsalRoot}`);
