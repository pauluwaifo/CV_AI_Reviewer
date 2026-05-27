import "server-only";

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "workspace-mail-connections.json");

type WorkspaceMailConnectionBase = {
  workspaceId: string;
  fromEmail: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceGoogleMailConnectionRecord = WorkspaceMailConnectionBase & {
  provider: "gmail";
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  connectedAccountEmail: string;
  senderIdentity: "primary" | "alias" | "unknown";
};

export type WorkspaceSmtpMailConnectionRecord = WorkspaceMailConnectionBase & {
  provider: "smtp";
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPassword: string;
};

export type WorkspaceMailConnectionRecord =
  | WorkspaceGoogleMailConnectionRecord
  | WorkspaceSmtpMailConnectionRecord;

type WorkspaceMailConnectionStoreData = {
  connections: WorkspaceMailConnectionRecord[];
};

type SaveWorkspaceMailConnectionInput =
  | {
      provider: "gmail";
      workspaceId: string;
      fromEmail: string;
      clientId: string;
      clientSecret: string;
      refreshToken: string;
      connectedAccountEmail: string;
      senderIdentity: "primary" | "alias" | "unknown";
    }
  | {
      provider: "smtp";
      workspaceId: string;
      fromEmail: string;
      smtpHost: string;
      smtpPort: number;
      smtpSecure: boolean;
      smtpUsername: string;
      smtpPassword: string;
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

export async function saveLocalWorkspaceMailConnection(
  input: SaveWorkspaceMailConnectionInput
) {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(input.workspaceId);
  const existingIndex = store.connections.findIndex(
    (item) => item.workspaceId === normalizedWorkspaceId
  );
  const existing = existingIndex >= 0 ? store.connections[existingIndex] : null;
  const timestamp = new Date().toISOString();

  const nextRecord: WorkspaceMailConnectionRecord =
    input.provider === "smtp"
      ? {
          workspaceId: normalizedWorkspaceId,
          provider: "smtp",
          fromEmail: input.fromEmail.trim().toLowerCase(),
          smtpHost: input.smtpHost.trim(),
          smtpPort: normalizeSmtpPort(input.smtpPort),
          smtpSecure: Boolean(input.smtpSecure),
          smtpUsername: input.smtpUsername.trim(),
          smtpPassword: input.smtpPassword.trim(),
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        }
      : {
          workspaceId: normalizedWorkspaceId,
          provider: "gmail",
          fromEmail: input.fromEmail.trim().toLowerCase(),
          clientId: input.clientId.trim(),
          clientSecret: input.clientSecret.trim(),
          refreshToken: input.refreshToken.trim(),
          connectedAccountEmail: input.connectedAccountEmail.trim().toLowerCase(),
          senderIdentity: normalizeSenderIdentity(input.senderIdentity),
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
  const parsed = value as Partial<{
    workspaceId: string;
    provider: string;
    fromEmail: string;
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    connectedAccountEmail: string;
    senderIdentity: string;
    smtpHost: string;
    smtpPort: number | string;
    smtpSecure: boolean | string;
    smtpUsername: string;
    smtpPassword: string;
    createdAt: string;
    updatedAt: string;
  }>;

  if (!parsed || typeof parsed.workspaceId !== "string" || !parsed.workspaceId.trim()) {
    return null;
  }

  if (
    parsed.provider === "smtp" &&
    typeof parsed.fromEmail === "string" &&
    parsed.fromEmail.trim() &&
    typeof parsed.smtpHost === "string" &&
    parsed.smtpHost.trim() &&
    typeof parsed.smtpUsername === "string" &&
    parsed.smtpUsername.trim() &&
    typeof parsed.smtpPassword === "string" &&
    parsed.smtpPassword.trim()
  ) {
    return {
      workspaceId: sanitizeWorkspaceId(parsed.workspaceId),
      provider: "smtp",
      fromEmail: parsed.fromEmail.trim().toLowerCase(),
      smtpHost: parsed.smtpHost.trim(),
      smtpPort: normalizeSmtpPort(parsed.smtpPort),
      smtpSecure: normalizeSmtpSecure(parsed.smtpSecure),
      smtpUsername: parsed.smtpUsername.trim(),
      smtpPassword: parsed.smtpPassword.trim(),
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

  if (
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
    connectedAccountEmail:
      typeof parsed.connectedAccountEmail === "string" && parsed.connectedAccountEmail.trim()
        ? parsed.connectedAccountEmail.trim().toLowerCase()
        : parsed.fromEmail.trim().toLowerCase(),
    senderIdentity: normalizeSenderIdentity(parsed.senderIdentity),
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

function normalizeSenderIdentity(
  value: unknown
): WorkspaceGoogleMailConnectionRecord["senderIdentity"] {
  return value === "primary" || value === "alias" ? value : "unknown";
}

function normalizeSmtpPort(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 587;
}

function normalizeSmtpSecure(value: unknown) {
  return value === true || value === "true" || value === "1";
}

function buildEmptyStore(): WorkspaceMailConnectionStoreData {
  return {
    connections: [],
  };
}
