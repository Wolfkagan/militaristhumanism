import { env } from "cloudflare:test";
import type { Role } from "../src/model";

export const testEnv = env as Env;

export async function seedUser(
  id: string,
  role: Role = "member",
  handle = id,
): Promise<void> {
  const now = new Date().toISOString();
  await testEnv.DB.batch([
    testEnv.DB.prepare(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?, ?, ?, 1, ?, ?)`,
    ).bind(id, `User ${id}`, `${id}@test.invalid`, now, now),
    testEnv.DB.prepare(
      `INSERT INTO user_profiles (user_id, public_id, handle, display_name, role)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(id, `usr_${id.padEnd(12, "0").slice(0, 12)}`, handle, `User ${id}`, role),
  ]);
}
