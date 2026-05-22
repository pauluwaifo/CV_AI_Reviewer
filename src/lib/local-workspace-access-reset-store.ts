import "server-only";

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "workspace-access-reset-requests.json");

export type WorkspaceAccessResetRequestStatus = "pending" | "resolved" | "rejected";

export type WorkspaceAccessResetRequest = {
  id: string;
  workspaceId: string;
  contactEmail: string;
  status: WorkspaceAccessResetRequestStatus;
  note: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string;
};

type StoreData = {
  requests: WorkspaceAccessResetRequest[];
};

const EMPTY_STORE: StoreData = { requests: [] };

export async function listLocalWorkspaceAccessResetRequests() {
  const store = await readStore();
  return [...store.requests].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function createLocalWorkspaceAccessResetRequest({
  id,
  workspaceId,
  contactEmail,
  note,
}: {
  id: string;
  workspaceId: string;
  contactEmail: string;
  note: string;
}) {
  const store = await readStore();
  const request: WorkspaceAccessResetRequest = {
    id,
    workspaceId: sanitizeWorkspaceId(workspaceId),
    contactEmail: contactEmail.trim().toLowerCase(),
    note: note.trim(),
    status: "pending",
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedBy: "",
  };

  store.requests.unshift(request);
  await writeStore(store);
  return request;
}

export async function updateLocalWorkspaceAccessResetRequestStatus({
  requestId,
  status,
  resolvedBy,
}: {
  requestId: string;
  status: WorkspaceAccessResetRequestStatus;
  resolvedBy: string;
}) {
  const store = await readStore();
  const index = store.requests.findIndex((item) => item.id === requestId);

  if (index < 0) {
    throw new Error("Reset request was not found.");
  }

  const request: WorkspaceAccessResetRequest = {
    ...store.requests[index],
    status,
    resolvedAt: new Date().toISOString(),
    resolvedBy,
  };

  store.requests.splice(index, 1, request);
  await writeStore(store);
  return request;
}

export async function readLocalWorkspaceAccessResetRequestStoreForMigration() {
  return readStore();
}

export async function deleteLocalWorkspaceAccessResetRequests(workspaceId: string) {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const nextRequests = store.requests.filter(
    (item) => item.workspaceId !== normalizedWorkspaceId
  );

  if (nextRequests.length === store.requests.length) {
    return false;
  }

  await writeStore({ requests: nextRequests });
  return true;
}

async function readStore() {
  await ensureStoreReady();

  try {
    const contents = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(contents) as Partial<StoreData>;
    return {
      requests: Array.isArray(parsed.requests)
        ? parsed.requests
            .map((item) => normalizeRequest(item))
            .filter((item): item is WorkspaceAccessResetRequest => item !== null)
        : [],
    } satisfies StoreData;
  } catch {
    await writeStore(EMPTY_STORE);
    return { requests: [] } satisfies StoreData;
  }
}

async function writeStore(store: StoreData) {
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

function normalizeRequest(value: unknown): WorkspaceAccessResetRequest | null {
  const parsed = value as Partial<WorkspaceAccessResetRequest>;

  if (!parsed?.id || !parsed.workspaceId || !parsed.contactEmail) {
    return null;
  }

  return {
    id: parsed.id,
    workspaceId: sanitizeWorkspaceId(parsed.workspaceId),
    contactEmail: parsed.contactEmail.trim().toLowerCase(),
    note: typeof parsed.note === "string" ? parsed.note : "",
    status:
      parsed.status === "resolved" || parsed.status === "rejected" ? parsed.status : "pending",
    createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
    resolvedAt: typeof parsed.resolvedAt === "string" ? parsed.resolvedAt : null,
    resolvedBy: typeof parsed.resolvedBy === "string" ? parsed.resolvedBy : "",
  };
}
