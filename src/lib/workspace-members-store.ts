import "server-only";

import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

import type { QueryResultRow } from "pg";

import {
  listLocalWorkspaceMembers,
  readLocalWorkspaceMembersStoreForMigration,
  updateLocalWorkspaceMemberStatus,
  upsertLocalWorkspaceMember,
  type WorkspaceMemberRecord,
  type WorkspaceMemberRole,
  type WorkspaceMemberStatus,
} from "@/lib/local-workspace-members-store";
import {
  isPostgresConfigured,
  queryPostgres,
  withPostgresTransaction,
} from "@/lib/postgres";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

let workspaceMembersSeedPromise: Promise<void> | null = null;

export type SafeWorkspaceMember = Omit<WorkspaceMemberRecord, "accessKeyHash">;

export async function listWorkspaceMembers(workspaceId: string) {
  if (!isPostgresConfigured()) {
    return (await listLocalWorkspaceMembers(workspaceId)).map(toSafeWorkspaceMember);
  }

  await ensureWorkspaceMembersSeeded();

  const result = await queryPostgres<WorkspaceMemberRow>(
    `
      SELECT id, workspace_id, email, role, status, access_key_hash, invited_at, accepted_at, updated_at
      FROM workspace_members
      WHERE workspace_id = $1
      ORDER BY invited_at DESC
    `,
    [sanitizeWorkspaceId(workspaceId)]
  );

  return result.rows.map(toWorkspaceMemberRecord).map(toSafeWorkspaceMember);
}

export async function listWorkspaceMemberAccessRecords(workspaceId: string) {
  if (!isPostgresConfigured()) {
    return listLocalWorkspaceMembers(workspaceId);
  }

  await ensureWorkspaceMembersSeeded();

  const result = await queryPostgres<WorkspaceMemberRow>(
    `
      SELECT id, workspace_id, email, role, status, access_key_hash, invited_at, accepted_at, updated_at
      FROM workspace_members
      WHERE workspace_id = $1 AND status <> 'revoked'
      ORDER BY invited_at DESC
    `,
    [sanitizeWorkspaceId(workspaceId)]
  );

  return result.rows.map(toWorkspaceMemberRecord);
}

export async function createWorkspaceMemberInvite({
  workspaceId,
  email,
  role,
}: {
  workspaceId: string;
  email: string;
  role: WorkspaceMemberRole;
}) {
  const accessKey = generateMemberAccessKey();
  const member = await upsertWorkspaceMember({
    id: randomUUID(),
    workspaceId,
    email,
    role,
    status: "invited",
    accessKeyHash: hashMemberAccessKey(accessKey),
  });

  return {
    member: toSafeWorkspaceMember(member),
    accessKey,
  };
}

export async function updateWorkspaceMemberStatus({
  workspaceId,
  memberId,
  status,
}: {
  workspaceId: string;
  memberId: string;
  status: WorkspaceMemberStatus;
}) {
  if (!isPostgresConfigured()) {
    return toSafeWorkspaceMember(
      await updateLocalWorkspaceMemberStatus({ workspaceId, memberId, status })
    );
  }

  await ensureWorkspaceMembersSeeded();

  const result = await queryPostgres<WorkspaceMemberRow>(
    `
      UPDATE workspace_members
      SET status = $3,
          accepted_at = CASE
            WHEN $3 = 'active' AND accepted_at IS NULL THEN NOW()
            ELSE accepted_at
          END,
          updated_at = NOW()
      WHERE workspace_id = $1 AND id = $2
      RETURNING id, workspace_id, email, role, status, access_key_hash, invited_at, accepted_at, updated_at
    `,
    [sanitizeWorkspaceId(workspaceId), memberId, normalizeStatus(status)]
  );
  const row = result.rows[0];

  if (!row) {
    throw new Error("That workspace member was not found.");
  }

  return toSafeWorkspaceMember(toWorkspaceMemberRecord(row));
}

export function verifyMemberAccessKey(accessKey: string, storedHash: string) {
  const [salt, expectedHash] = storedHash.split(":", 2);

  if (!salt || !expectedHash) {
    return false;
  }

  const derivedKey = scryptSync(accessKey, salt, 64).toString("hex");
  const leftBuffer = Buffer.from(derivedKey);
  const rightBuffer = Buffer.from(expectedHash);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function hashMemberAccessKey(accessKey: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(accessKey, salt, 64).toString("hex");
  return `${salt}:${derivedKey}`;
}

async function upsertWorkspaceMember(
  member: Pick<
    WorkspaceMemberRecord,
    "id" | "workspaceId" | "email" | "role" | "status" | "accessKeyHash"
  >
) {
  if (!isPostgresConfigured()) {
    return upsertLocalWorkspaceMember(member);
  }

  await ensureWorkspaceMembersSeeded();

  const result = await queryPostgres<WorkspaceMemberRow>(
    `
      INSERT INTO workspace_members (
        id,
        workspace_id,
        email,
        role,
        status,
        access_key_hash,
        invited_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      ON CONFLICT (workspace_id, email) DO UPDATE
      SET role = EXCLUDED.role,
          status = EXCLUDED.status,
          access_key_hash = EXCLUDED.access_key_hash,
          invited_at = NOW(),
          accepted_at = NULL,
          updated_at = NOW()
      RETURNING id, workspace_id, email, role, status, access_key_hash, invited_at, accepted_at, updated_at
    `,
    [
      member.id,
      sanitizeWorkspaceId(member.workspaceId),
      normalizeEmail(member.email),
      normalizeRole(member.role),
      normalizeStatus(member.status),
      member.accessKeyHash,
    ]
  );

  return toWorkspaceMemberRecord(result.rows[0]);
}

async function ensureWorkspaceMembersSeeded() {
  if (workspaceMembersSeedPromise) {
    return workspaceMembersSeedPromise;
  }

  workspaceMembersSeedPromise = withPostgresTransaction(async (client) => {
    const countResult = await client.query<{ total: string }>(
      "SELECT COUNT(*)::text AS total FROM workspace_members"
    );
    const total = Number.parseInt(countResult.rows[0]?.total || "0", 10);

    if (total > 0) {
      return;
    }

    const localStore = await readLocalWorkspaceMembersStoreForMigration();

    for (const member of localStore.members) {
      await client.query(
        `
          INSERT INTO workspace_members (
            id,
            workspace_id,
            email,
            role,
            status,
            access_key_hash,
            invited_at,
            accepted_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9::timestamptz)
          ON CONFLICT (workspace_id, email) DO NOTHING
        `,
        [
          member.id,
          member.workspaceId,
          member.email,
          member.role,
          member.status,
          member.accessKeyHash,
          member.invitedAt,
          member.acceptedAt,
          member.updatedAt,
        ]
      );
    }
  });

  return workspaceMembersSeedPromise;
}

function toWorkspaceMemberRecord(row: WorkspaceMemberRow): WorkspaceMemberRecord {
  return {
    id: row.id,
    workspaceId: sanitizeWorkspaceId(row.workspace_id),
    email: normalizeEmail(row.email),
    role: normalizeRole(row.role),
    status: normalizeStatus(row.status),
    accessKeyHash: row.access_key_hash,
    invitedAt: toIsoString(row.invited_at),
    acceptedAt: row.accepted_at ? toIsoString(row.accepted_at) : null,
    updatedAt: toIsoString(row.updated_at),
  };
}

function toSafeWorkspaceMember(member: WorkspaceMemberRecord): SafeWorkspaceMember {
  const safeMember = {
    id: member.id,
    workspaceId: member.workspaceId,
    email: member.email,
    role: member.role,
    status: member.status,
    invitedAt: member.invitedAt,
    acceptedAt: member.acceptedAt,
    updatedAt: member.updatedAt,
  };
  return safeMember;
}

function generateMemberAccessKey() {
  return `member_${randomBytes(18).toString("base64url")}`;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeRole(value: unknown): WorkspaceMemberRole {
  return value === "admin" ? "admin" : "member";
}

function normalizeStatus(value: unknown): WorkspaceMemberStatus {
  if (value === "active" || value === "revoked") {
    return value;
  }

  return "invited";
}

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

type WorkspaceMemberRow = QueryResultRow & {
  access_key_hash: string;
  accepted_at: Date | string | null;
  email: string;
  id: string;
  invited_at: Date | string;
  role: string;
  status: string;
  updated_at: Date | string;
  workspace_id: string;
};
