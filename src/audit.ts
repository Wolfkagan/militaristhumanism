import { AppError } from "./http";

const encoder = new TextEncoder();
const LEGACY_PAGE_SIZE = 250;
const MAX_LEGACY_EVENTS = 10_000;

export interface AuditEventInput {
  actorId: string | null;
  action: string;
  targetType: string;
  targetPublicId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

interface AuditChainState {
  head_hash: string | null;
  legacy_seal_hash: string | null;
  legacy_event_count: number;
  enforcement_enabled: number;
}

interface AuditHashRow {
  id: number;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_public_id: string | null;
  reason: string | null;
  metadata_json: string;
  created_at: string;
  previous_hash: string | null;
  event_hash: string | null;
}

export interface AuditIntegrityStatus {
  valid: boolean;
  legacyEvents: number;
  chainedEvents: number;
  headFingerprint: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function importAuditKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) {
    throw new AppError(503, "AUDIT_CHAIN_SECRET_UNAVAILABLE", "Audit integrity protection is unavailable.");
  }
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function hmac(key: CryptoKey, value: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

function canonicalRow(row: Pick<AuditHashRow, "id" | "actor_id" | "action" | "target_type" | "target_public_id" | "reason" | "metadata_json" | "created_at">): string {
  return JSON.stringify([
    row.id,
    row.actor_id,
    row.action,
    row.target_type,
    row.target_public_id,
    row.reason,
    row.metadata_json,
    row.created_at,
  ]);
}

function canonicalEvent(input: AuditEventInput, metadataJson: string, createdAt: string): string {
  return JSON.stringify([
    input.actorId,
    input.action,
    input.targetType,
    input.targetPublicId ?? null,
    input.reason ?? null,
    metadataJson,
    createdAt,
  ]);
}

async function readState(env: Env): Promise<AuditChainState> {
  const state = await env.DB.prepare(
    "SELECT head_hash, legacy_seal_hash, legacy_event_count, enforcement_enabled FROM audit_chain_state WHERE id = 1",
  ).first<AuditChainState>();
  if (state === null) {
    throw new AppError(503, "AUDIT_CHAIN_UNAVAILABLE", "Audit integrity storage is unavailable.");
  }
  return state;
}

async function computeLegacySeal(env: Env, key: CryptoKey): Promise<{ hash: string; count: number }> {
  let hash = await hmac(key, "militaristhumanism:audit:legacy-seal:v1");
  let afterId = 0;
  let count = 0;
  while (true) {
    const page = await env.DB.prepare(
      `SELECT id, actor_id, action, target_type, target_public_id, reason, metadata_json, created_at,
              previous_hash, event_hash
       FROM audit_events WHERE event_hash IS NULL AND id > ? ORDER BY id ASC LIMIT ?`,
    ).bind(afterId, LEGACY_PAGE_SIZE).all<AuditHashRow>();
    for (const row of page.results) {
      hash = await hmac(key, `legacy\n${hash}\n${canonicalRow(row)}`);
      afterId = row.id;
      count += 1;
      if (count > MAX_LEGACY_EVENTS) {
        throw new AppError(503, "AUDIT_LEGACY_SEAL_LIMIT", "The legacy audit log requires an offline sealing procedure.");
      }
    }
    if (page.results.length < LEGACY_PAGE_SIZE) break;
  }
  return { hash, count };
}

async function ensureAuditChainInitialized(env: Env, key: CryptoKey): Promise<AuditChainState> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await readState(env);
    if (current.head_hash !== null && current.legacy_seal_hash !== null) {
      if (current.enforcement_enabled !== 1) {
        throw new AppError(503, "AUDIT_CHAIN_UNAVAILABLE", "Audit integrity enforcement is unavailable.");
      }
      return current;
    }
    if (current.head_hash !== null || current.legacy_seal_hash !== null || current.enforcement_enabled !== 0) {
      throw new AppError(503, "AUDIT_CHAIN_UNAVAILABLE", "Audit integrity storage is inconsistent.");
    }

    const legacy = await computeLegacySeal(env, key);
    const initializedResult = await env.DB.prepare(
      `UPDATE audit_chain_state
       SET head_hash = ?, legacy_seal_hash = ?, legacy_event_count = ?, enforcement_enabled = 1,
           sealed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = 1 AND head_hash IS NULL AND legacy_seal_hash IS NULL AND enforcement_enabled = 0
         AND (SELECT COUNT(*) FROM audit_events WHERE event_hash IS NULL) = ?`,
    ).bind(legacy.hash, legacy.hash, legacy.count, legacy.count).run();
    if ((initializedResult.meta.changes ?? 0) === 1) {
      const initialized = await readState(env);
      if (initialized.head_hash !== null && initialized.legacy_seal_hash !== null && initialized.enforcement_enabled === 1) {
        return initialized;
      }
    }
  }
  throw new AppError(503, "AUDIT_CHAIN_CONFLICT", "Audit integrity initialization could not be serialized.");
}

function prepareLegacyAuditStatement(env: Env, input: AuditEventInput): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO audit_events
     (actor_id, action, target_type, target_public_id, reason, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    input.actorId,
    input.action,
    input.targetType,
    input.targetPublicId ?? null,
    input.reason ?? null,
    JSON.stringify(input.metadata ?? {}),
    new Date().toISOString(),
  );
}

function isMissingAuditSchema(error: unknown): boolean {
  return error instanceof Error && error.message.includes("no such table") && error.message.includes("audit_chain_state");
}

async function prepareAuditStatement(env: Env, input: AuditEventInput): Promise<D1PreparedStatement> {
  const key = await importAuditKey(env.AUDIT_INTEGRITY_SECRET);
  const state = await ensureAuditChainInitialized(env, key);
  const previousHash = state.head_hash;
  if (previousHash === null) {
    throw new AppError(503, "AUDIT_CHAIN_UNAVAILABLE", "Audit integrity storage is unavailable.");
  }
  const metadataJson = JSON.stringify(input.metadata ?? {});
  const createdAt = new Date().toISOString();
  const eventHash = await hmac(
    key,
    `militaristhumanism:audit:event:v1\n${previousHash}\n${canonicalEvent(input, metadataJson, createdAt)}`,
  );
  return env.DB.prepare(
    `INSERT INTO audit_events
     (actor_id, action, target_type, target_public_id, reason, metadata_json, created_at, previous_hash, event_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    input.actorId,
    input.action,
    input.targetType,
    input.targetPublicId ?? null,
    input.reason ?? null,
    metadataJson,
    createdAt,
    previousHash,
    eventHash,
  );
}

function isChainConflict(error: unknown): boolean {
  return error instanceof Error && error.message.includes("AUDIT_CHAIN_CONFLICT");
}

export async function runAuditedBatch(
  env: Env,
  statements: D1PreparedStatement[],
  event: AuditEventInput,
): Promise<D1Result<unknown>[]> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let auditStatement: D1PreparedStatement;
    try {
      auditStatement = await prepareAuditStatement(env, event);
    } catch (error) {
      if (!isMissingAuditSchema(error)) throw error;
      try {
        return await env.DB.batch([...statements, prepareLegacyAuditStatement(env, event)]);
      } catch (legacyError) {
        if (!(legacyError instanceof Error) || !legacyError.message.includes("AUDIT_CHAIN_REQUIRED")) throw legacyError;
        continue;
      }
    }
    try {
      return await env.DB.batch([...statements, auditStatement]);
    } catch (error) {
      if (!isChainConflict(error) || attempt === 2) throw error;
    }
  }
  throw new AppError(503, "AUDIT_CHAIN_CONFLICT", "The audited operation could not be serialized.");
}

export async function appendAuditEvent(env: Env, event: AuditEventInput): Promise<void> {
  await runAuditedBatch(env, [], event);
}

export async function verifyAuditIntegrity(env: Env): Promise<AuditIntegrityStatus> {
  const key = await importAuditKey(env.AUDIT_INTEGRITY_SECRET);
  let state: AuditChainState;
  try {
    state = await ensureAuditChainInitialized(env, key);
  } catch (error) {
    if (isMissingAuditSchema(error)) {
      throw new AppError(503, "AUDIT_CHAIN_SCHEMA_PENDING", "Audit integrity migration is pending.");
    }
    throw error;
  }
  const legacy = await computeLegacySeal(env, key);
  let valid = legacy.count === state.legacy_event_count && legacy.hash === state.legacy_seal_hash;
  let head = legacy.hash;
  let afterId = 0;
  let chainedEvents = 0;

  while (true) {
    const page = await env.DB.prepare(
      `SELECT id, actor_id, action, target_type, target_public_id, reason, metadata_json, created_at,
              previous_hash, event_hash
       FROM audit_events WHERE event_hash IS NOT NULL AND id > ? ORDER BY id ASC LIMIT ?`,
    ).bind(afterId, LEGACY_PAGE_SIZE).all<AuditHashRow>();
    for (const row of page.results) {
      const expected = await hmac(
        key,
        `militaristhumanism:audit:event:v1\n${head}\n${JSON.stringify([
          row.actor_id,
          row.action,
          row.target_type,
          row.target_public_id,
          row.reason,
          row.metadata_json,
          row.created_at,
        ])}`,
      );
      valid &&= row.previous_hash === head && row.event_hash === expected;
      head = row.event_hash ?? "";
      afterId = row.id;
      chainedEvents += 1;
    }
    if (page.results.length < LEGACY_PAGE_SIZE) break;
  }

  valid &&= head === state.head_hash;
  return {
    valid,
    legacyEvents: legacy.count,
    chainedEvents,
    headFingerprint: head.slice(0, 16),
  };
}
