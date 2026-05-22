import "server-only";

import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

import type { QueryResultRow } from "pg";

import {
  clearLocalPendingAuthChallenges,
  consumeLocalAuthChallengeRecord,
  createLocalAuthChallengeRecord,
  deleteLocalAuthChallengeRecordById,
  deleteLocalAuthChallengesByWorkspaceId,
  getLocalAuthChallengeRecordById,
  incrementLocalAuthChallengeAttempt,
  type AuthChallengePurpose,
  type AuthChallengeRecord,
} from "@/lib/local-auth-challenge-store";
import { isPostgresConfigured, queryPostgres } from "@/lib/postgres";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

const AUTH_CHALLENGE_TTL_MINUTES = 10;
const AUTH_CHALLENGE_MAX_ATTEMPTS = 5;

export type { AuthChallengePurpose, AuthChallengeRecord } from "@/lib/local-auth-challenge-store";

export async function createAuthChallenge({
  purpose,
  workspaceId,
  email,
  payload,
  expiresInMinutes = AUTH_CHALLENGE_TTL_MINUTES,
  maxAttempts = AUTH_CHALLENGE_MAX_ATTEMPTS,
}: {
  purpose: AuthChallengePurpose;
  workspaceId: string;
  email: string;
  payload: Record<string, unknown>;
  expiresInMinutes?: number;
  maxAttempts?: number;
}) {
  const verificationCode = generateVerificationCode();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const normalizedEmail = email.trim().toLowerCase();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();
  const record: AuthChallengeRecord = {
    id: randomUUID(),
    purpose,
    workspaceId: normalizedWorkspaceId,
    email: normalizedEmail,
    codeHash: hashVerificationCode(verificationCode),
    payload,
    attemptCount: 0,
    maxAttempts,
    createdAt,
    expiresAt,
    consumedAt: null,
  };

  await clearPendingAuthChallenges({
    purpose,
    workspaceId: normalizedWorkspaceId,
    email: normalizedEmail,
  });

  if (!isPostgresConfigured()) {
    await createLocalAuthChallengeRecord(record);
  } else {
    await queryPostgres<AuthChallengeRow>(
      `
        INSERT INTO auth_challenges (
          id,
          purpose,
          workspace_id,
          email,
          code_hash,
          payload,
          attempt_count,
          max_attempts,
          created_at,
          expires_at,
          consumed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::timestamptz, $10::timestamptz, NULL)
        RETURNING id
      `,
      [
        record.id,
        record.purpose,
        record.workspaceId,
        record.email,
        record.codeHash,
        JSON.stringify(record.payload),
        record.attemptCount,
        record.maxAttempts,
        record.createdAt,
        record.expiresAt,
      ]
    );
  }

  return {
    challengeId: record.id,
    verificationCode,
    expiresAt: record.expiresAt,
    expiresInMinutes,
    email: record.email,
  };
}

export async function verifyAuthChallenge({
  challengeId,
  purpose,
  verificationCode,
}: {
  challengeId: string;
  purpose: AuthChallengePurpose;
  verificationCode: string;
}) {
  const challenge = await getAuthChallengeRecordById(challengeId);

  if (!challenge || challenge.purpose !== purpose) {
    throw new Error("That verification request was not found. Start again to get a new code.");
  }

  if (challenge.consumedAt) {
    throw new Error("That verification code has already been used. Request a new code.");
  }

  if (isExpired(challenge.expiresAt)) {
    await deleteAuthChallengeRecordById(challenge.id).catch(() => undefined);
    throw new Error("That verification code has expired. Request a new code.");
  }

  if (challenge.attemptCount >= challenge.maxAttempts) {
    await deleteAuthChallengeRecordById(challenge.id).catch(() => undefined);
    throw new Error("Too many failed attempts. Request a new code and try again.");
  }

  if (!verifyHashedVerificationCode(verificationCode, challenge.codeHash)) {
    const updated = await incrementAuthChallengeAttempt(challenge.id);
    const nextAttempts = updated?.attemptCount ?? challenge.attemptCount + 1;

    if (nextAttempts >= challenge.maxAttempts) {
      await deleteAuthChallengeRecordById(challenge.id).catch(() => undefined);
      throw new Error("Too many failed attempts. Request a new code and try again.");
    }

    throw new Error("That verification code is invalid. Check the code and try again.");
  }

  const consumed = await consumeAuthChallengeRecord(challenge.id);

  return consumed ?? challenge;
}

export async function deleteAuthChallengeRecordById(challengeId: string) {
  if (!isPostgresConfigured()) {
    return deleteLocalAuthChallengeRecordById(challengeId);
  }

  const result = await queryPostgres<{ id: string }>(
    `
      DELETE FROM auth_challenges
      WHERE id = $1
      RETURNING id
    `,
    [challengeId.trim()]
  );

  return (result.rowCount ?? 0) > 0;
}

export async function deleteAuthChallengesByWorkspaceId(workspaceId: string) {
  if (!isPostgresConfigured()) {
    return deleteLocalAuthChallengesByWorkspaceId(workspaceId);
  }

  const result = await queryPostgres<{ id: string }>(
    `
      DELETE FROM auth_challenges
      WHERE workspace_id = $1
      RETURNING id
    `,
    [sanitizeWorkspaceId(workspaceId)]
  );

  return (result.rowCount ?? 0) > 0;
}

async function getAuthChallengeRecordById(challengeId: string) {
  if (!isPostgresConfigured()) {
    return getLocalAuthChallengeRecordById(challengeId);
  }

  const result = await queryPostgres<AuthChallengeRow>(
    `
      SELECT id, purpose, workspace_id, email, code_hash, payload, attempt_count, max_attempts,
             created_at, expires_at, consumed_at
      FROM auth_challenges
      WHERE id = $1
      LIMIT 1
    `,
    [challengeId.trim()]
  );
  const row = result.rows[0];

  return row ? toAuthChallengeRecord(row) : null;
}

async function incrementAuthChallengeAttempt(challengeId: string) {
  if (!isPostgresConfigured()) {
    return incrementLocalAuthChallengeAttempt(challengeId);
  }

  const result = await queryPostgres<AuthChallengeRow>(
    `
      UPDATE auth_challenges
      SET attempt_count = attempt_count + 1
      WHERE id = $1
      RETURNING id, purpose, workspace_id, email, code_hash, payload, attempt_count, max_attempts,
                created_at, expires_at, consumed_at
    `,
    [challengeId.trim()]
  );
  const row = result.rows[0];

  return row ? toAuthChallengeRecord(row) : null;
}

async function consumeAuthChallengeRecord(challengeId: string) {
  if (!isPostgresConfigured()) {
    return consumeLocalAuthChallengeRecord(challengeId);
  }

  const result = await queryPostgres<AuthChallengeRow>(
    `
      UPDATE auth_challenges
      SET consumed_at = NOW()
      WHERE id = $1
      RETURNING id, purpose, workspace_id, email, code_hash, payload, attempt_count, max_attempts,
                created_at, expires_at, consumed_at
    `,
    [challengeId.trim()]
  );
  const row = result.rows[0];

  return row ? toAuthChallengeRecord(row) : null;
}

async function clearPendingAuthChallenges({
  purpose,
  workspaceId,
  email,
}: {
  purpose: AuthChallengePurpose;
  workspaceId: string;
  email: string;
}) {
  if (!isPostgresConfigured()) {
    return clearLocalPendingAuthChallenges({ purpose, workspaceId, email });
  }

  await queryPostgres(
    `
      DELETE FROM auth_challenges
      WHERE purpose = $1
        AND workspace_id = $2
        AND email = $3
        AND consumed_at IS NULL
    `,
    [purpose, sanitizeWorkspaceId(workspaceId), email.trim().toLowerCase()]
  );
}

function toAuthChallengeRecord(row: AuthChallengeRow): AuthChallengeRecord {
  return {
    id: row.id,
    purpose: row.purpose === "workspace-signup" ? "workspace-signup" : "workspace-signin",
    workspaceId: sanitizeWorkspaceId(row.workspace_id),
    email: row.email.trim().toLowerCase(),
    codeHash: row.code_hash,
    payload: normalizePayload(row.payload),
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    createdAt: toIsoString(row.created_at),
    expiresAt: toIsoString(row.expires_at),
    consumedAt: row.consumed_at ? toIsoString(row.consumed_at) : null,
  };
}

function normalizePayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function hashVerificationCode(code: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(code, salt, 64).toString("hex");
  return `${salt}:${derivedKey}`;
}

function verifyHashedVerificationCode(code: string, storedHash: string) {
  const [salt, expectedHash] = storedHash.split(":", 2);

  if (!salt || !expectedHash) {
    return false;
  }

  const derivedKey = scryptSync(code, salt, 64).toString("hex");
  const leftBuffer = Buffer.from(derivedKey);
  const rightBuffer = Buffer.from(expectedHash);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function generateVerificationCode() {
  return String(Math.floor(Math.random() * 900000) + 100000);
}

function isExpired(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) || timestamp <= Date.now();
}

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

type AuthChallengeRow = QueryResultRow & {
  id: string;
  purpose: string;
  workspace_id: string;
  email: string;
  code_hash: string;
  payload: Record<string, unknown> | null;
  attempt_count: number;
  max_attempts: number;
  created_at: Date | string;
  expires_at: Date | string;
  consumed_at: Date | string | null;
};
