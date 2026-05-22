import "server-only";

import type { QueryResultRow } from "pg";

import {
  createLocalWorkspaceSessionRecord,
  deleteLocalWorkspaceSessionRecordByTokenHash,
  getLocalWorkspaceSessionRecordByTokenHash,
} from "@/lib/local-workspace-session-store";
import { isPostgresConfigured, queryPostgres } from "@/lib/postgres";
import type { WorkspaceSessionRecord } from "@/types/workspace-session";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

export async function createWorkspaceSessionRecord(record: WorkspaceSessionRecord) {
  if (!isPostgresConfigured()) {
    return createLocalWorkspaceSessionRecord(record);
  }

  const normalizedRecord = normalizeSessionRecord(record);
  const result = await queryPostgres<WorkspaceSessionRow>(
    `
      INSERT INTO workspace_sessions (
        token_hash,
        workspace_id,
        role,
        principal_type,
        email,
        member_id,
        issued_at,
        expires_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9::timestamptz)
      RETURNING token_hash, workspace_id, role, principal_type, email, member_id, issued_at, expires_at, created_at
    `,
    [
      normalizedRecord.tokenHash,
      normalizedRecord.workspaceId,
      normalizedRecord.role,
      normalizedRecord.principalType,
      normalizedRecord.email,
      normalizedRecord.memberId,
      normalizedRecord.issuedAt,
      normalizedRecord.expiresAt,
      normalizedRecord.createdAt,
    ]
  );

  return toWorkspaceSessionRecord(result.rows[0]);
}

export async function getWorkspaceSessionRecordByTokenHash(tokenHash: string) {
  if (!isPostgresConfigured()) {
    return getLocalWorkspaceSessionRecordByTokenHash(tokenHash);
  }

  const result = await queryPostgres<WorkspaceSessionRow>(
    `
      SELECT token_hash, workspace_id, role, principal_type, email, member_id, issued_at, expires_at, created_at
      FROM workspace_sessions
      WHERE token_hash = $1
      LIMIT 1
    `,
    [tokenHash]
  );
  const row = result.rows[0];

  if (!row) {
    return null;
  }

  const record = toWorkspaceSessionRecord(row);

  if (isExpired(record.expiresAt)) {
    await deleteWorkspaceSessionRecordByTokenHash(tokenHash).catch(() => undefined);
    return null;
  }

  return record;
}

export async function deleteWorkspaceSessionRecordByTokenHash(tokenHash: string) {
  if (!isPostgresConfigured()) {
    return deleteLocalWorkspaceSessionRecordByTokenHash(tokenHash);
  }

  const result = await queryPostgres<{ token_hash: string }>(
    `
      DELETE FROM workspace_sessions
      WHERE token_hash = $1
      RETURNING token_hash
    `,
    [tokenHash]
  );

  return (result.rowCount ?? 0) > 0;
}

function normalizeSessionRecord(record: WorkspaceSessionRecord): WorkspaceSessionRecord {
  return {
    tokenHash: record.tokenHash.trim(),
    workspaceId: sanitizeWorkspaceId(record.workspaceId),
    role: record.role === "member" ? "member" : "admin",
    principalType: record.principalType === "member" ? "member" : "shared",
    email: record.email.trim().toLowerCase(),
    memberId: record.memberId?.trim() ? record.memberId.trim() : null,
    issuedAt: toIsoString(record.issuedAt),
    expiresAt: toIsoString(record.expiresAt),
    createdAt: toIsoString(record.createdAt),
  };
}

function toWorkspaceSessionRecord(row: WorkspaceSessionRow): WorkspaceSessionRecord {
  return {
    tokenHash: row.token_hash,
    workspaceId: sanitizeWorkspaceId(row.workspace_id),
    role: row.role === "member" ? "member" : "admin",
    principalType: row.principal_type === "member" ? "member" : "shared",
    email: row.email || "",
    memberId: row.member_id || null,
    issuedAt: toIsoString(row.issued_at),
    expiresAt: toIsoString(row.expires_at),
    createdAt: toIsoString(row.created_at),
  };
}

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isExpired(value: string) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) || time <= Date.now();
}

type WorkspaceSessionRow = QueryResultRow & {
  created_at: Date | string;
  email: string;
  expires_at: Date | string;
  issued_at: Date | string;
  member_id: string | null;
  principal_type: string;
  role: string;
  token_hash: string;
  workspace_id: string;
};
