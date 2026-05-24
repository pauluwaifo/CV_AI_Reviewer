import "server-only";

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { sanitizeWorkspaceId } from "@/lib/workspace-settings";
import type { WorkspaceAuditEvent } from "@/lib/workspace-audit-store";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "workspace-audit-events.json");

type StoreShape = WorkspaceAuditEvent[];

export async function listLocalWorkspaceAuditEvents(workspaceId: string, limit = 50) {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);

  return store
    .filter((event) => event.workspaceId === normalizedWorkspaceId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, Math.max(1, limit));
}

export async function createLocalWorkspaceAuditEvent(event: WorkspaceAuditEvent) {
  const store = await readStore();
  store.unshift(event);
  await writeStore(store.slice(0, 1000));
  return event;
}

export async function deleteLocalWorkspaceAuditEvents(workspaceId: string) {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const next = store.filter((event) => event.workspaceId !== normalizedWorkspaceId);

  if (next.length === store.length) {
    return false;
  }

  await writeStore(next);
  return true;
}

async function readStore() {
  await ensureStore();

  try {
    const contents = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(contents) as StoreShape;
    return Array.isArray(parsed)
      ? parsed
          .map(normalizeAuditEvent)
          .filter((event): event is WorkspaceAuditEvent => event !== null)
      : [];
  } catch {
    await writeStore([]);
    return [];
  }
}

async function writeStore(store: StoreShape) {
  await ensureStore();
  await writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
}

async function ensureStore() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    await stat(STORE_FILE);
  } catch {
    await writeFile(STORE_FILE, JSON.stringify([], null, 2), "utf8");
  }
}

function normalizeAuditEvent(value: unknown): WorkspaceAuditEvent | null {
  const parsed = (value ?? {}) as Partial<WorkspaceAuditEvent>;

  if (
    typeof parsed.id !== "string" ||
    !parsed.id.trim() ||
    typeof parsed.workspaceId !== "string" ||
    !parsed.workspaceId.trim()
  ) {
    return null;
  }

  return {
    action: typeof parsed.action === "string" ? parsed.action.trim() : "",
    actorEmail: typeof parsed.actorEmail === "string" ? parsed.actorEmail.trim().toLowerCase() : "",
    actorRole: parsed.actorRole === "admin" || parsed.actorRole === "member" ? parsed.actorRole : "member",
    createdAt:
      typeof parsed.createdAt === "string" && parsed.createdAt.trim()
        ? parsed.createdAt
        : new Date().toISOString(),
    id: parsed.id,
    metadata: parsed.metadata && typeof parsed.metadata === "object" ? parsed.metadata : {},
    summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
    targetId: typeof parsed.targetId === "string" ? parsed.targetId.trim() : "",
    targetType: typeof parsed.targetType === "string" ? parsed.targetType.trim() : "",
    workspaceId: sanitizeWorkspaceId(parsed.workspaceId),
  };
}
