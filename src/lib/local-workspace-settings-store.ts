import "server-only";

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildDefaultWorkspaceSettings,
  parseWorkspaceSettings,
  sanitizeWorkspaceId,
  type WorkspaceSettings,
} from "@/lib/workspace-settings";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "workspace-settings.json");

type WorkspaceSettingsStoreRecord = {
  workspaceId: string;
  settings: WorkspaceSettings;
  updatedAt: string;
};

type WorkspaceSettingsStoreData = {
  workspaces: WorkspaceSettingsStoreRecord[];
};

const EMPTY_STORE: WorkspaceSettingsStoreData = {
  workspaces: [],
};

export async function getLocalWorkspaceSettings(
  workspaceId: string
): Promise<WorkspaceSettings> {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const existing = store.workspaces.find(
    (item) => item.workspaceId === normalizedWorkspaceId
  );

  if (existing) {
    return parseWorkspaceSettings({
      ...existing.settings,
      workspaceId: normalizedWorkspaceId,
    });
  }

  const defaultSettings = buildDefaultWorkspaceSettings(normalizedWorkspaceId);

  store.workspaces.unshift({
    workspaceId: normalizedWorkspaceId,
    settings: defaultSettings,
    updatedAt: new Date().toISOString(),
  });

  await writeStore(store);

  return defaultSettings;
}

export async function saveLocalWorkspaceSettings(
  workspaceId: string,
  nextSettings: Partial<WorkspaceSettings>
): Promise<WorkspaceSettings> {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const existingIndex = store.workspaces.findIndex(
    (item) => item.workspaceId === normalizedWorkspaceId
  );
  const existingSettings =
    existingIndex >= 0
      ? parseWorkspaceSettings(store.workspaces[existingIndex].settings)
      : buildDefaultWorkspaceSettings(normalizedWorkspaceId);
  const mergedSettings = parseWorkspaceSettings({
    ...existingSettings,
    ...nextSettings,
    workspaceId: normalizedWorkspaceId,
  });
  const updatedRecord: WorkspaceSettingsStoreRecord = {
    workspaceId: normalizedWorkspaceId,
    settings: mergedSettings,
    updatedAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    store.workspaces.splice(existingIndex, 1);
  }

  store.workspaces.unshift(updatedRecord);
  await writeStore(store);

  return mergedSettings;
}

export async function readLocalWorkspaceSettingsStoreForMigration() {
  return readStore();
}

async function readStore() {
  await ensureStoreReady();

  try {
    const contents = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(contents) as Partial<WorkspaceSettingsStoreData>;

    return {
      workspaces: Array.isArray(parsed.workspaces)
        ? parsed.workspaces
            .map((item) => normalizeWorkspaceRecord(item))
            .filter((item): item is WorkspaceSettingsStoreRecord => item !== null)
        : [],
    } satisfies WorkspaceSettingsStoreData;
  } catch {
    await writeStore(EMPTY_STORE);
    return buildEmptyStore();
  }
}

async function writeStore(store: WorkspaceSettingsStoreData) {
  await ensureStoreReady();
  await writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
}

async function ensureStoreReady() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    await stat(STORE_FILE);
  } catch {
    await writeFile(STORE_FILE, JSON.stringify(EMPTY_STORE, null, 2), "utf8");
  }
}

function normalizeWorkspaceRecord(
  value: unknown
): WorkspaceSettingsStoreRecord | null {
  const parsed = value as Partial<WorkspaceSettingsStoreRecord>;

  if (!parsed || typeof parsed.workspaceId !== "string" || !parsed.workspaceId.trim()) {
    return null;
  }

  const workspaceId = sanitizeWorkspaceId(parsed.workspaceId);

  return {
    workspaceId,
    settings: parseWorkspaceSettings({
      ...buildDefaultWorkspaceSettings(workspaceId),
      ...(parsed.settings ?? {}),
      workspaceId,
    }),
    updatedAt:
      typeof parsed.updatedAt === "string" && parsed.updatedAt.trim()
        ? parsed.updatedAt
        : new Date().toISOString(),
  };
}

function buildEmptyStore(): WorkspaceSettingsStoreData {
  return {
    workspaces: [],
  };
}
