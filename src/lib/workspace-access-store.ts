import "server-only";

import type { QueryResultRow } from "pg";

import {
  createLocalWorkspaceAccessRecord,
  getLocalWorkspaceAccessRecord,
  readLocalWorkspaceAccessStoreForMigration,
  updateLocalWorkspaceAccessKeyHash,
  type WorkspaceAccessRecord,
} from "@/lib/local-workspace-access-store";
import {
  isPostgresConfigured,
  queryPostgres,
  withPostgresTransaction,
} from "@/lib/postgres";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

let workspaceAccessSeedPromise: Promise<void> | null = null;

export async function getWorkspaceAccessRecord(workspaceId: string) {
  if (!isPostgresConfigured()) {
    return getLocalWorkspaceAccessRecord(workspaceId);
  }

  await ensureWorkspaceAccessSeeded();

  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const result = await queryPostgres<WorkspaceAccessRow>(
    `
      SELECT workspace_id, contact_email, access_key_hash, created_at, updated_at
      FROM workspace_access_records
      WHERE workspace_id = $1
      LIMIT 1
    `,
    [normalizedWorkspaceId]
  );
  const row = result.rows[0];

  return row ? toWorkspaceAccessRecord(row) : null;
}

export async function createWorkspaceAccessRecord({
  workspaceId,
  contactEmail,
  accessKeyHash,
}: {
  workspaceId: string;
  contactEmail: string;
  accessKeyHash: string;
}) {
  if (!isPostgresConfigured()) {
    return createLocalWorkspaceAccessRecord({
      workspaceId,
      contactEmail,
      accessKeyHash,
    });
  }

  await ensureWorkspaceAccessSeeded();

  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const existing = await getWorkspaceAccessRecord(normalizedWorkspaceId);

  if (existing) {
    throw new Error("That workspace ID is already in use.");
  }

  const result = await queryPostgres<WorkspaceAccessRow>(
    `
      INSERT INTO workspace_access_records (
        workspace_id,
        contact_email,
        access_key_hash,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING workspace_id, contact_email, access_key_hash, created_at, updated_at
    `,
    [normalizedWorkspaceId, contactEmail.trim().toLowerCase(), accessKeyHash]
  );

  return toWorkspaceAccessRecord(result.rows[0]);
}

export async function updateWorkspaceAccessKeyHash(
  workspaceId: string,
  accessKeyHash: string
) {
  if (!isPostgresConfigured()) {
    return updateLocalWorkspaceAccessKeyHash(workspaceId, accessKeyHash);
  }

  await ensureWorkspaceAccessSeeded();

  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const result = await queryPostgres<WorkspaceAccessRow>(
    `
      UPDATE workspace_access_records
      SET access_key_hash = $2,
          updated_at = NOW()
      WHERE workspace_id = $1
      RETURNING workspace_id, contact_email, access_key_hash, created_at, updated_at
    `,
    [normalizedWorkspaceId, accessKeyHash]
  );
  const row = result.rows[0];

  if (!row) {
    throw new Error("Workspace access record was not found.");
  }

  return toWorkspaceAccessRecord(row);
}

async function ensureWorkspaceAccessSeeded() {
  if (workspaceAccessSeedPromise) {
    return workspaceAccessSeedPromise;
  }

  workspaceAccessSeedPromise = withPostgresTransaction(async (client) => {
    const countResult = await client.query<{ total: string }>(
      "SELECT COUNT(*)::text AS total FROM workspace_access_records"
    );
    const total = Number.parseInt(countResult.rows[0]?.total || "0", 10);

    if (total > 0) {
      return;
    }

    const localStore = await readLocalWorkspaceAccessStoreForMigration();

    for (const record of localStore.records) {
      await client.query(
        `
          INSERT INTO workspace_access_records (
            workspace_id,
            contact_email,
            access_key_hash,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz)
          ON CONFLICT (workspace_id) DO NOTHING
        `,
        [
          record.workspaceId,
          record.contactEmail,
          record.accessKeyHash,
          record.createdAt,
          record.updatedAt,
        ]
      );
    }
  });

  return workspaceAccessSeedPromise;
}

function toWorkspaceAccessRecord(row: WorkspaceAccessRow): WorkspaceAccessRecord {
  return {
    workspaceId: sanitizeWorkspaceId(row.workspace_id),
    contactEmail: row.contact_email || "",
    accessKeyHash: row.access_key_hash,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

type WorkspaceAccessRow = QueryResultRow & {
  access_key_hash: string;
  contact_email: string;
  created_at: Date | string;
  updated_at: Date | string;
  workspace_id: string;
};
