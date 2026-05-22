import "server-only";

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "workspace-access.json");

export type WorkspaceAccessRecord = {
  workspaceId: string;
  contactEmail: string;
  accessKeyHash: string;
  createdAt: string;
  updatedAt: string;
};

type WorkspaceAccessStoreData = {
  records: WorkspaceAccessRecord[];
};

const EMPTY_STORE: WorkspaceAccessStoreData = {
  records: [],
};

export async function getLocalWorkspaceAccessRecord(workspaceId: string) {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);

  return (
    store.records.find((item) => item.workspaceId === normalizedWorkspaceId) ?? null
  );
}

export async function createLocalWorkspaceAccessRecord({
  workspaceId,
  contactEmail,
  accessKeyHash,
}: {
  workspaceId: string;
  contactEmail: string;
  accessKeyHash: string;
}) {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);

  if (store.records.some((item) => item.workspaceId === normalizedWorkspaceId)) {
    throw new Error("That workspace ID is already in use.");
  }

  const timestamp = new Date().toISOString();
  const record: WorkspaceAccessRecord = {
    workspaceId: normalizedWorkspaceId,
    contactEmail: contactEmail.trim().toLowerCase(),
    accessKeyHash,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  store.records.unshift(record);
  await writeStore(store);

  return record;
}

export async function updateLocalWorkspaceAccessKeyHash(
  workspaceId: string,
  accessKeyHash: string
) {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const existingIndex = store.records.findIndex(
    (item) => item.workspaceId === normalizedWorkspaceId
  );

  if (existingIndex < 0) {
    throw new Error("Workspace access record was not found.");
  }

  const updatedRecord: WorkspaceAccessRecord = {
    ...store.records[existingIndex],
    accessKeyHash,
    updatedAt: new Date().toISOString(),
  };

  store.records.splice(existingIndex, 1, updatedRecord);
  await writeStore(store);

  return updatedRecord;
}

export async function readLocalWorkspaceAccessStoreForMigration() {
  return readStore();
}

export async function deleteLocalWorkspaceAccessRecord(workspaceId: string) {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const nextRecords = store.records.filter(
    (item) => item.workspaceId !== normalizedWorkspaceId
  );

  if (nextRecords.length === store.records.length) {
    return false;
  }

  await writeStore({ records: nextRecords });
  return true;
}

async function readStore() {
  await ensureStoreReady();

  try {
    const contents = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(contents) as Partial<WorkspaceAccessStoreData>;

    return {
      records: Array.isArray(parsed.records)
        ? parsed.records
            .map((item) => normalizeRecord(item))
            .filter((item): item is WorkspaceAccessRecord => item !== null)
        : [],
    } satisfies WorkspaceAccessStoreData;
  } catch {
    await writeStore(EMPTY_STORE);
    return buildEmptyStore();
  }
}

async function writeStore(store: WorkspaceAccessStoreData) {
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

function normalizeRecord(value: unknown): WorkspaceAccessRecord | null {
  const parsed = value as Partial<WorkspaceAccessRecord>;

  if (
    !parsed ||
    typeof parsed.workspaceId !== "string" ||
    !parsed.workspaceId.trim() ||
    typeof parsed.accessKeyHash !== "string" ||
    !parsed.accessKeyHash.trim()
  ) {
    return null;
  }

  return {
    workspaceId: sanitizeWorkspaceId(parsed.workspaceId),
    contactEmail:
      typeof parsed.contactEmail === "string" ? parsed.contactEmail.trim().toLowerCase() : "",
    accessKeyHash: parsed.accessKeyHash.trim(),
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

function buildEmptyStore(): WorkspaceAccessStoreData {
  return {
    records: [],
  };
}
