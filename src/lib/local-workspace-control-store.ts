import "server-only";

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildDefaultWorkspaceControlSettings,
  parseWorkspaceControlSettings,
  type WorkspaceControlSettings,
} from "@/lib/workspace-controls";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "workspace-controls.json");

type WorkspaceControlStoreRecord = {
  workspaceId: string;
  controls: WorkspaceControlSettings;
  updatedAt: string;
};

type WorkspaceControlStoreData = {
  workspaces: WorkspaceControlStoreRecord[];
};

const EMPTY_STORE: WorkspaceControlStoreData = {
  workspaces: [],
};

export async function getLocalWorkspaceControlSettings(
  workspaceId: string
): Promise<WorkspaceControlSettings> {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const existing = store.workspaces.find(
    (item) => item.workspaceId === normalizedWorkspaceId
  );

  if (existing) {
    return parseWorkspaceControlSettings(existing.controls, normalizedWorkspaceId);
  }

  const defaults = buildDefaultWorkspaceControlSettings(normalizedWorkspaceId);

  store.workspaces.unshift({
    workspaceId: normalizedWorkspaceId,
    controls: defaults,
    updatedAt: new Date().toISOString(),
  });
  await writeStore(store);

  return defaults;
}

export async function saveLocalWorkspaceControlSettings(
  workspaceId: string,
  nextControls: Partial<WorkspaceControlSettings>
) {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const existingIndex = store.workspaces.findIndex(
    (item) => item.workspaceId === normalizedWorkspaceId
  );
  const existingControls =
    existingIndex >= 0
      ? parseWorkspaceControlSettings(store.workspaces[existingIndex].controls, normalizedWorkspaceId)
      : buildDefaultWorkspaceControlSettings(normalizedWorkspaceId);
  const mergedControls = parseWorkspaceControlSettings(
    {
      ...existingControls,
      ...nextControls,
      modules: {
        ...existingControls.modules,
        ...(nextControls.modules ?? {}),
      },
      billing: {
        ...existingControls.billing,
        ...(nextControls.billing ?? {}),
      },
      workspaceId: normalizedWorkspaceId,
    },
    normalizedWorkspaceId
  );
  const updatedRecord: WorkspaceControlStoreRecord = {
    workspaceId: normalizedWorkspaceId,
    controls: mergedControls,
    updatedAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    store.workspaces.splice(existingIndex, 1);
  }

  store.workspaces.unshift(updatedRecord);
  await writeStore(store);

  return mergedControls;
}

export async function listLocalWorkspaceControlSettings(workspaceIds?: string[]) {
  const store = await readStore();
  const normalizedIds = Array.isArray(workspaceIds)
    ? new Set(workspaceIds.map((item) => sanitizeWorkspaceId(item)))
    : null;

  return store.workspaces
    .filter((item) => (normalizedIds ? normalizedIds.has(item.workspaceId) : true))
    .map((item) => parseWorkspaceControlSettings(item.controls, item.workspaceId));
}

export async function readLocalWorkspaceControlStoreForMigration() {
  return readStore();
}

export async function deleteLocalWorkspaceControlSettings(workspaceId: string) {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const nextWorkspaces = store.workspaces.filter(
    (item) => item.workspaceId !== normalizedWorkspaceId
  );

  if (nextWorkspaces.length === store.workspaces.length) {
    return false;
  }

  await writeStore({ workspaces: nextWorkspaces });
  return true;
}

async function readStore() {
  await ensureStoreReady();

  try {
    const contents = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(contents) as Partial<WorkspaceControlStoreData>;

    return {
      workspaces: Array.isArray(parsed.workspaces)
        ? parsed.workspaces
            .map((item) => normalizeWorkspaceRecord(item))
            .filter((item): item is WorkspaceControlStoreRecord => item !== null)
        : [],
    } satisfies WorkspaceControlStoreData;
  } catch {
    await writeStore(EMPTY_STORE);
    return buildEmptyStore();
  }
}

async function writeStore(store: WorkspaceControlStoreData) {
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
): WorkspaceControlStoreRecord | null {
  const parsed = value as Partial<WorkspaceControlStoreRecord>;

  if (!parsed || typeof parsed.workspaceId !== "string" || !parsed.workspaceId.trim()) {
    return null;
  }

  const workspaceId = sanitizeWorkspaceId(parsed.workspaceId);

  return {
    workspaceId,
    controls: parseWorkspaceControlSettings(parsed.controls, workspaceId),
    updatedAt:
      typeof parsed.updatedAt === "string" && parsed.updatedAt.trim()
        ? parsed.updatedAt
        : new Date().toISOString(),
  };
}

function buildEmptyStore(): WorkspaceControlStoreData {
  return {
    workspaces: [],
  };
}
