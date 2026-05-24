import "server-only";

import type { QueryResultRow } from "pg";

import {
  deleteLocalWorkspaceControlSettings,
  getLocalWorkspaceControlSettings,
  listLocalWorkspaceControlSettings,
  readLocalWorkspaceControlStoreForMigration,
  saveLocalWorkspaceControlSettings,
} from "@/lib/local-workspace-control-store";
import {
  buildDefaultWorkspaceControlSettings,
  parseWorkspaceControlSettings,
  type WorkspaceControlSettings,
} from "@/lib/workspace-controls";
import {
  isPostgresConfigured,
  queryPostgres,
  withPostgresTransaction,
} from "@/lib/postgres";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

let workspaceControlSeedPromise: Promise<void> | null = null;

export async function getWorkspaceControlSettings(
  workspaceId: string
): Promise<WorkspaceControlSettings> {
  if (!isPostgresConfigured()) {
    return getLocalWorkspaceControlSettings(workspaceId);
  }

  await ensureWorkspaceControlSettingsSeeded();

  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const result = await queryPostgres<WorkspaceControlSettingsRow>(
    `
      SELECT workspace_id, controls
      FROM workspace_control_settings
      WHERE workspace_id = $1
      LIMIT 1
    `,
    [normalizedWorkspaceId]
  );
  const existing = result.rows[0];

  if (existing) {
    return parseWorkspaceControlSettings(existing.controls, normalizedWorkspaceId);
  }

  const defaults = buildDefaultWorkspaceControlSettings(normalizedWorkspaceId);

  await queryPostgres(
    `
      INSERT INTO workspace_control_settings (workspace_id, controls, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (workspace_id) DO UPDATE
      SET controls = EXCLUDED.controls,
          updated_at = NOW()
    `,
    [normalizedWorkspaceId, JSON.stringify(defaults)]
  );

  return defaults;
}

export async function saveWorkspaceControlSettings(
  workspaceId: string,
  nextControls: Partial<WorkspaceControlSettings>
): Promise<WorkspaceControlSettings> {
  if (!isPostgresConfigured()) {
    return saveLocalWorkspaceControlSettings(workspaceId, nextControls);
  }

  const existing = await getWorkspaceControlSettings(workspaceId);
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const mergedControls = parseWorkspaceControlSettings(
    {
      ...existing,
      ...nextControls,
      modules: {
        ...existing.modules,
        ...(nextControls.modules ?? {}),
      },
      billing: {
        ...existing.billing,
        ...(nextControls.billing ?? {}),
      },
      workspaceId: normalizedWorkspaceId,
    },
    normalizedWorkspaceId
  );

  await queryPostgres(
    `
      INSERT INTO workspace_control_settings (workspace_id, controls, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (workspace_id) DO UPDATE
      SET controls = EXCLUDED.controls,
          updated_at = NOW()
    `,
    [normalizedWorkspaceId, JSON.stringify(mergedControls)]
  );

  return mergedControls;
}

export async function listWorkspaceControlSettings(workspaceIds?: string[]) {
  if (!isPostgresConfigured()) {
    return listLocalWorkspaceControlSettings(workspaceIds);
  }

  await ensureWorkspaceControlSettingsSeeded();

  const normalizedIds = Array.isArray(workspaceIds)
    ? workspaceIds.map((item) => sanitizeWorkspaceId(item)).filter(Boolean)
    : [];
  const useFilter = normalizedIds.length > 0;
  const result = await queryPostgres<WorkspaceControlSettingsRow>(
    `
      SELECT workspace_id, controls
      FROM workspace_control_settings
      ${useFilter ? "WHERE workspace_id = ANY($1::text[])" : ""}
      ORDER BY updated_at DESC, workspace_id ASC
    `,
    useFilter ? [normalizedIds] : []
  );

  return result.rows.map((row) =>
    parseWorkspaceControlSettings(row.controls, row.workspace_id)
  );
}

export async function deleteWorkspaceControlSettings(workspaceId: string) {
  if (!isPostgresConfigured()) {
    return deleteLocalWorkspaceControlSettings(workspaceId);
  }

  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const result = await queryPostgres(
    `
      DELETE FROM workspace_control_settings
      WHERE workspace_id = $1
    `,
    [normalizedWorkspaceId]
  );

  return (result.rowCount ?? 0) > 0;
}

async function ensureWorkspaceControlSettingsSeeded() {
  if (workspaceControlSeedPromise) {
    return workspaceControlSeedPromise;
  }

  workspaceControlSeedPromise = withPostgresTransaction(async (client) => {
    const countResult = await client.query<{ total: string }>(
      "SELECT COUNT(*)::text AS total FROM workspace_control_settings"
    );
    const total = Number.parseInt(countResult.rows[0]?.total || "0", 10);

    if (total > 0) {
      return;
    }

    const localStore = await readLocalWorkspaceControlStoreForMigration();

    if (localStore.workspaces.length === 0) {
      return;
    }

    for (const item of localStore.workspaces) {
      const controls = parseWorkspaceControlSettings(item.controls, item.workspaceId);

      await client.query(
        `
          INSERT INTO workspace_control_settings (workspace_id, controls, updated_at)
          VALUES ($1, $2::jsonb, $3::timestamptz)
          ON CONFLICT (workspace_id) DO UPDATE
          SET controls = EXCLUDED.controls,
              updated_at = EXCLUDED.updated_at
        `,
        [
          item.workspaceId,
          JSON.stringify(controls),
          item.updatedAt || new Date().toISOString(),
        ]
      );
    }
  });

  return workspaceControlSeedPromise;
}

type WorkspaceControlSettingsRow = QueryResultRow & {
  controls: Partial<WorkspaceControlSettings> | null;
  workspace_id: string;
};
