import { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";

const database = new DatabaseSync(":memory:");

try {
  const auth = betterAuth({
    database,
    baseURL: "https://militaristhumanism.com",
    emailAndPassword: { enabled: false },
  });

  const { compileMigrations } = await getMigrations(auth.options);
  process.stdout.write(await compileMigrations());
} finally {
  database.close();
}
