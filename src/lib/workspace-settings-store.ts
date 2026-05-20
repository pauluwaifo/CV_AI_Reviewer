import "server-only";

import type { QueryResultRow } from "pg";

import {
  getLocalWorkspaceSettings,
  readLocalWorkspaceSettingsStoreForMigration,
  saveLocalWorkspaceSettings,
} from "@/lib/local-workspace-settings-store";
import {
  isPostgresConfigured,
  queryPostgres,
  withPostgresTransaction,
} from "@/lib/postgres";
import {
  buildDefaultWorkspaceSettings,
  parseWorkspaceSettings,
  sanitizeWorkspaceId,
  type WorkspaceSettings,
} from "@/lib/workspace-settings";

let workspaceSettingsSeedPromise: Promise<void> | null = null;

export async function getWorkspaceSettings(
  workspaceId: string
): Promise<WorkspaceSettings> {
  if (!isPostgresConfigured()) {
    return getLocalWorkspaceSettings(workspaceId);
  }

  await ensureWorkspaceSettingsSeeded();

  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const result = await queryPostgres<WorkspaceSettingsRow>(
    `
      SELECT workspace_id, settings
      FROM workspace_settings
      WHERE workspace_id = $1
      LIMIT 1
    `,
    [normalizedWorkspaceId]
  );
  const existing = result.rows[0];

  if (existing) {
    return parseWorkspaceSettings({
      ...(existing.settings ?? {}),
      workspaceId: normalizedWorkspaceId,
    });
  }

  const defaultSettings = buildDefaultWorkspaceSettings(normalizedWorkspaceId);

  await queryPostgres(
    `
      INSERT INTO workspace_settings (workspace_id, settings, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (workspace_id) DO UPDATE
      SET settings = EXCLUDED.settings,
          updated_at = NOW()
    `,
    [normalizedWorkspaceId, JSON.stringify(defaultSettings)]
  );

  return defaultSettings;
}

export async function saveWorkspaceSettings(
  workspaceId: string,
  nextSettings: Partial<WorkspaceSettings>
): Promise<WorkspaceSettings> {
  if (!isPostgresConfigured()) {
    return saveLocalWorkspaceSettings(workspaceId, nextSettings);
  }

  const existingSettings = await getWorkspaceSettings(workspaceId);
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const mergedSettings = parseWorkspaceSettings({
    ...existingSettings,
    ...nextSettings,
    workspaceId: normalizedWorkspaceId,
  });

  await queryPostgres(
    `
      INSERT INTO workspace_settings (workspace_id, settings, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (workspace_id) DO UPDATE
      SET settings = EXCLUDED.settings,
          updated_at = NOW()
    `,
    [normalizedWorkspaceId, JSON.stringify(mergedSettings)]
  );

  return mergedSettings;
}

async function ensureWorkspaceSettingsSeeded() {
  if (workspaceSettingsSeedPromise) {
    return workspaceSettingsSeedPromise;
  }

  workspaceSettingsSeedPromise = withPostgresTransaction(async (client) => {
    const countResult = await client.query<{ total: string }>(
      "SELECT COUNT(*)::text AS total FROM workspace_settings"
    );
    const total = Number.parseInt(countResult.rows[0]?.total || "0", 10);

    if (total > 0) {
      return;
    }

    const localStore = await readLocalWorkspaceSettingsStoreForMigration();

    if (localStore.workspaces.length === 0) {
      return;
    }

    for (const item of localStore.workspaces) {
      const settings = parseWorkspaceSettings({
        ...item.settings,
        workspaceId: item.workspaceId,
      });

      await client.query(
        `
          INSERT INTO workspace_settings (workspace_id, settings, updated_at)
          VALUES ($1, $2::jsonb, $3::timestamptz)
          ON CONFLICT (workspace_id) DO UPDATE
          SET settings = EXCLUDED.settings,
              updated_at = EXCLUDED.updated_at
        `,
        [
          settings.workspaceId,
          JSON.stringify(settings),
          item.updatedAt || new Date().toISOString(),
        ]
      );
    }
  });

  return workspaceSettingsSeedPromise;
}

type WorkspaceSettingsRow = QueryResultRow & {
  settings: Partial<WorkspaceSettings> | null;
  workspace_id: string;
};
