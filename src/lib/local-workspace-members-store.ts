import "server-only";

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "workspace-members.json");

export type WorkspaceMemberRole = "admin" | "member";
export type WorkspaceMemberStatus = "invited" | "active" | "revoked";

export type WorkspaceMemberRecord = {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceMemberRole;
  status: WorkspaceMemberStatus;
  accessKeyHash: string;
  invitedAt: string;
  acceptedAt: string | null;
  updatedAt: string;
};

type WorkspaceMembersStoreData = {
  members: WorkspaceMemberRecord[];
};

const EMPTY_STORE: WorkspaceMembersStoreData = {
  members: [],
};

export async function listLocalWorkspaceMembers(workspaceId: string) {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);

  return store.members
    .filter((item) => item.workspaceId === normalizedWorkspaceId)
    .sort((left, right) => right.invitedAt.localeCompare(left.invitedAt));
}

export async function upsertLocalWorkspaceMember(
  member: Omit<WorkspaceMemberRecord, "updatedAt" | "invitedAt" | "acceptedAt"> &
    Partial<Pick<WorkspaceMemberRecord, "updatedAt" | "invitedAt" | "acceptedAt">>
) {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(member.workspaceId);
  const normalizedEmail = normalizeEmail(member.email);
  const existingIndex = store.members.findIndex(
    (item) => item.workspaceId === normalizedWorkspaceId && item.email === normalizedEmail
  );
  const timestamp = new Date().toISOString();
  const nextMember: WorkspaceMemberRecord = {
    id: member.id,
    workspaceId: normalizedWorkspaceId,
    email: normalizedEmail,
    role: normalizeRole(member.role),
    status: normalizeStatus(member.status),
    accessKeyHash: member.accessKeyHash,
    invitedAt: member.invitedAt ?? timestamp,
    acceptedAt: member.acceptedAt ?? null,
    updatedAt: timestamp,
  };

  if (existingIndex >= 0) {
    store.members.splice(existingIndex, 1);
  }

  store.members.unshift(nextMember);
  await writeStore(store);

  return nextMember;
}

export async function updateLocalWorkspaceMemberStatus({
  workspaceId,
  memberId,
  status,
}: {
  workspaceId: string;
  memberId: string;
  status: WorkspaceMemberStatus;
}) {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const existingIndex = store.members.findIndex(
    (item) => item.workspaceId === normalizedWorkspaceId && item.id === memberId
  );

  if (existingIndex < 0) {
    throw new Error("That workspace member was not found.");
  }

  const timestamp = new Date().toISOString();
  const updatedMember: WorkspaceMemberRecord = {
    ...store.members[existingIndex],
    status: normalizeStatus(status),
    acceptedAt:
      status === "active"
        ? (store.members[existingIndex].acceptedAt ?? timestamp)
        : store.members[existingIndex].acceptedAt,
    updatedAt: timestamp,
  };

  store.members.splice(existingIndex, 1, updatedMember);
  await writeStore(store);

  return updatedMember;
}

export async function readLocalWorkspaceMembersStoreForMigration() {
  return readStore();
}

export async function deleteLocalWorkspaceMembers(workspaceId: string) {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const nextMembers = store.members.filter(
    (item) => item.workspaceId !== normalizedWorkspaceId
  );

  if (nextMembers.length === store.members.length) {
    return false;
  }

  await writeStore({ members: nextMembers });
  return true;
}

async function readStore() {
  await ensureStoreReady();

  try {
    const contents = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(contents) as Partial<WorkspaceMembersStoreData>;

    return {
      members: Array.isArray(parsed.members)
        ? parsed.members
            .map((item) => normalizeRecord(item))
            .filter((item): item is WorkspaceMemberRecord => item !== null)
        : [],
    } satisfies WorkspaceMembersStoreData;
  } catch {
    await writeStore(EMPTY_STORE);
    return { members: [] } satisfies WorkspaceMembersStoreData;
  }
}

async function writeStore(store: WorkspaceMembersStoreData) {
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

function normalizeRecord(value: unknown): WorkspaceMemberRecord | null {
  const parsed = value as Partial<WorkspaceMemberRecord>;

  if (
    !parsed ||
    typeof parsed.id !== "string" ||
    !parsed.id.trim() ||
    typeof parsed.workspaceId !== "string" ||
    !parsed.workspaceId.trim() ||
    typeof parsed.email !== "string" ||
    !parsed.email.trim() ||
    typeof parsed.accessKeyHash !== "string" ||
    !parsed.accessKeyHash.trim()
  ) {
    return null;
  }

  return {
    id: parsed.id.trim(),
    workspaceId: sanitizeWorkspaceId(parsed.workspaceId),
    email: normalizeEmail(parsed.email),
    role: normalizeRole(parsed.role),
    status: normalizeStatus(parsed.status),
    accessKeyHash: parsed.accessKeyHash.trim(),
    invitedAt: normalizeDate(parsed.invitedAt),
    acceptedAt:
      typeof parsed.acceptedAt === "string" && parsed.acceptedAt.trim()
        ? parsed.acceptedAt
        : null,
    updatedAt: normalizeDate(parsed.updatedAt),
  };
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeRole(value: unknown): WorkspaceMemberRole {
  return value === "admin" ? "admin" : "member";
}

function normalizeStatus(value: unknown): WorkspaceMemberStatus {
  if (value === "active" || value === "revoked") {
    return value;
  }

  return "invited";
}

function normalizeDate(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value
    : new Date().toISOString();
}
