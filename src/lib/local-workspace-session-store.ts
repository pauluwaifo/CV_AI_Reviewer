import "server-only";

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { WorkspaceSessionRecord } from "@/types/workspace-session";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "workspace-sessions.json");

type WorkspaceSessionStoreData = {
  sessions: WorkspaceSessionRecord[];
};

const EMPTY_STORE: WorkspaceSessionStoreData = {
  sessions: [],
};

export async function createLocalWorkspaceSessionRecord(
  record: WorkspaceSessionRecord
) {
  const store = await readStore();
  const normalizedRecord = normalizeRecord(record);

  if (!normalizedRecord) {
    throw new Error("Workspace session record is invalid.");
  }

  store.sessions = store.sessions.filter((item) => item.tokenHash !== record.tokenHash);
  store.sessions.unshift(normalizedRecord);
  await writeStore(store);
  return normalizedRecord;
}

export async function getLocalWorkspaceSessionRecordByTokenHash(tokenHash: string) {
  const store = await readStore();
  const nextSessions = store.sessions.filter((item) => !isExpired(item.expiresAt));
  const record = nextSessions.find((item) => item.tokenHash === tokenHash) ?? null;

  if (nextSessions.length !== store.sessions.length) {
    await writeStore({ sessions: nextSessions });
  }

  return record;
}

export async function deleteLocalWorkspaceSessionRecordByTokenHash(tokenHash: string) {
  const store = await readStore();
  const nextSessions = store.sessions.filter((item) => item.tokenHash !== tokenHash);

  if (nextSessions.length === store.sessions.length) {
    return false;
  }

  await writeStore({ sessions: nextSessions });
  return true;
}

export async function deleteLocalWorkspaceSessions(workspaceId: string) {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const nextSessions = store.sessions.filter(
    (item) => item.workspaceId !== normalizedWorkspaceId
  );

  if (nextSessions.length === store.sessions.length) {
    return false;
  }

  await writeStore({ sessions: nextSessions });
  return true;
}

async function readStore() {
  await ensureStoreReady();

  try {
    const contents = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(contents) as Partial<WorkspaceSessionStoreData>;

    return {
      sessions: Array.isArray(parsed.sessions)
        ? parsed.sessions
            .map((item) => normalizeRecord(item))
            .filter((item): item is WorkspaceSessionRecord => item !== null)
        : [],
    } satisfies WorkspaceSessionStoreData;
  } catch {
    await writeStore(EMPTY_STORE);
    return buildEmptyStore();
  }
}

async function writeStore(store: WorkspaceSessionStoreData) {
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

function normalizeRecord(value: unknown): WorkspaceSessionRecord | null {
  const parsed = value as Partial<WorkspaceSessionRecord>;

  if (
    !parsed ||
    typeof parsed.tokenHash !== "string" ||
    !parsed.tokenHash.trim() ||
    typeof parsed.workspaceId !== "string" ||
    !parsed.workspaceId.trim()
  ) {
    return null;
  }

  return {
    tokenHash: parsed.tokenHash.trim(),
    workspaceId: sanitizeWorkspaceId(parsed.workspaceId),
    role: parsed.role === "member" ? "member" : "admin",
    principalType:
      parsed.principalType === "member"
        ? "member"
        : parsed.principalType === "demo"
          ? "demo"
          : "shared",
    email: typeof parsed.email === "string" ? parsed.email.trim().toLowerCase() : "",
    memberId:
      typeof parsed.memberId === "string" && parsed.memberId.trim()
        ? parsed.memberId.trim()
        : null,
    issuedAt:
      typeof parsed.issuedAt === "string" && parsed.issuedAt.trim()
        ? parsed.issuedAt
        : new Date().toISOString(),
    expiresAt:
      typeof parsed.expiresAt === "string" && parsed.expiresAt.trim()
        ? parsed.expiresAt
        : new Date().toISOString(),
    createdAt:
      typeof parsed.createdAt === "string" && parsed.createdAt.trim()
        ? parsed.createdAt
        : new Date().toISOString(),
  };
}

function isExpired(value: string) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) || time <= Date.now();
}

function buildEmptyStore(): WorkspaceSessionStoreData {
  return {
    sessions: [],
  };
}
