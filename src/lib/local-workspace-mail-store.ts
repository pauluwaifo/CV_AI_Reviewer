import "server-only";

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "workspace-mail-connections.json");

export type WorkspaceMailConnectionRecord = {
  workspaceId: string;
  provider: "gmail";
  fromEmail: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  createdAt: string;
  updatedAt: string;
};

type WorkspaceMailConnectionStoreData = {
  connections: WorkspaceMailConnectionRecord[];
};

const EMPTY_STORE: WorkspaceMailConnectionStoreData = {
  connections: [],
};

export async function getLocalWorkspaceMailConnection(workspaceId: string) {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);

  return (
    store.connections.find((item) => item.workspaceId === normalizedWorkspaceId) ?? null
  );
}

export async function saveLocalWorkspaceMailConnection({
  workspaceId,
  fromEmail,
  clientId,
  clientSecret,
  refreshToken,
}: {
  workspaceId: string;
  fromEmail: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const existingIndex = store.connections.findIndex(
    (item) => item.workspaceId === normalizedWorkspaceId
  );
  const existing = existingIndex >= 0 ? store.connections[existingIndex] : null;
  const timestamp = new Date().toISOString();
  const nextRecord: WorkspaceMailConnectionRecord = {
    workspaceId: normalizedWorkspaceId,
    provider: "gmail",
    fromEmail: fromEmail.trim().toLowerCase(),
    clientId: clientId.trim(),
    clientSecret: clientSecret.trim(),
    refreshToken: refreshToken.trim(),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  if (existingIndex >= 0) {
    store.connections.splice(existingIndex, 1);
  }

  store.connections.unshift(nextRecord);
  await writeStore(store);

  return nextRecord;
}

export async function deleteLocalWorkspaceMailConnection(workspaceId: string) {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const nextConnections = store.connections.filter(
    (item) => item.workspaceId !== normalizedWorkspaceId
  );

  if (nextConnections.length === store.connections.length) {
    return false;
  }

  await writeStore({ connections: nextConnections });
  return true;
}

async function readStore() {
  await ensureStoreReady();

  try {
    const contents = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(contents) as Partial<WorkspaceMailConnectionStoreData>;

    return {
      connections: Array.isArray(parsed.connections)
        ? parsed.connections
            .map((item) => normalizeRecord(item))
            .filter((item): item is WorkspaceMailConnectionRecord => item !== null)
        : [],
    } satisfies WorkspaceMailConnectionStoreData;
  } catch {
    await writeStore(EMPTY_STORE);
    return buildEmptyStore();
  }
}

async function writeStore(store: WorkspaceMailConnectionStoreData) {
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

function normalizeRecord(value: unknown): WorkspaceMailConnectionRecord | null {
  const parsed = value as Partial<WorkspaceMailConnectionRecord>;

  if (
    !parsed ||
    typeof parsed.workspaceId !== "string" ||
    !parsed.workspaceId.trim() ||
    typeof parsed.fromEmail !== "string" ||
    !parsed.fromEmail.trim() ||
    typeof parsed.clientId !== "string" ||
    !parsed.clientId.trim() ||
    typeof parsed.clientSecret !== "string" ||
    !parsed.clientSecret.trim() ||
    typeof parsed.refreshToken !== "string" ||
    !parsed.refreshToken.trim()
  ) {
    return null;
  }

  return {
    workspaceId: sanitizeWorkspaceId(parsed.workspaceId),
    provider: "gmail",
    fromEmail: parsed.fromEmail.trim().toLowerCase(),
    clientId: parsed.clientId.trim(),
    clientSecret: parsed.clientSecret.trim(),
    refreshToken: parsed.refreshToken.trim(),
    createdAt:
      typeof parsed.createdAt === "string" && parsed.createdAt.trim()
        ? parsed.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof parsed.updatedAt === "string" && parsed.updatedAt.trim()
        ? parsed.updatedAt
        : new Date().toISOString(),
  };
}

function buildEmptyStore(): WorkspaceMailConnectionStoreData {
  return {
    connections: [],
  };
}
