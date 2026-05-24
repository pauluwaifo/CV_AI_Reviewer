import "server-only";

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { sanitizeWorkspaceId } from "@/lib/workspace-settings";
import type {
  WorkspaceIntegrationEvent,
  WorkspaceIntegrationSettings,
} from "@/lib/workspace-integrations-store";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "workspace-integrations.json");

type StoreShape = Record<string, WorkspaceIntegrationSettings>;

export async function getLocalWorkspaceIntegrationSettings(workspaceId: string) {
  const store = await readStore();
  return (
    store[sanitizeWorkspaceId(workspaceId)] ??
    buildDefaultWorkspaceIntegrationSettings(workspaceId)
  );
}

export async function saveLocalWorkspaceIntegrationSettings(
  workspaceId: string,
  value: Partial<WorkspaceIntegrationSettings>
) {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
  const current =
    store[normalizedWorkspaceId] ?? buildDefaultWorkspaceIntegrationSettings(normalizedWorkspaceId);
  const next = parseWorkspaceIntegrationSettings(
    {
      ...current,
      ...value,
      workspaceId: normalizedWorkspaceId,
      updatedAt: new Date().toISOString(),
    },
    normalizedWorkspaceId
  );

  store[normalizedWorkspaceId] = next;
  await writeStore(store);
  return next;
}

export async function deleteLocalWorkspaceIntegrationSettings(workspaceId: string) {
  const store = await readStore();
  const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);

  if (!store[normalizedWorkspaceId]) {
    return false;
  }

  delete store[normalizedWorkspaceId];
  await writeStore(store);
  return true;
}

function buildDefaultWorkspaceIntegrationSettings(
  workspaceId: string
): WorkspaceIntegrationSettings {
  return {
    workspaceId: sanitizeWorkspaceId(workspaceId),
    enabledEvents: [],
    lastDeliveryAttemptAt: null,
    lastDeliveryError: "",
    lastDeliveryEvent: "",
    lastDeliveryTarget: "",
    slackWebhookUrl: "",
    updatedAt: new Date(0).toISOString(),
    webhookSigningSecret: "",
    webhookUrl: "",
  };
}

function parseWorkspaceIntegrationSettings(
  value: unknown,
  workspaceId: string
): WorkspaceIntegrationSettings {
  const parsed = (value ?? {}) as Partial<WorkspaceIntegrationSettings>;
  const fallback = buildDefaultWorkspaceIntegrationSettings(workspaceId);

  return {
    workspaceId: sanitizeWorkspaceId(parsed.workspaceId ?? workspaceId),
    enabledEvents: normalizeEvents(parsed.enabledEvents),
    lastDeliveryAttemptAt: normalizeNullableIsoDate(parsed.lastDeliveryAttemptAt),
    lastDeliveryError:
      typeof parsed.lastDeliveryError === "string" ? parsed.lastDeliveryError.trim() : "",
    lastDeliveryEvent:
      typeof parsed.lastDeliveryEvent === "string" ? parsed.lastDeliveryEvent.trim() : "",
    lastDeliveryTarget:
      parsed.lastDeliveryTarget === "webhook" ||
      parsed.lastDeliveryTarget === "slack" ||
      parsed.lastDeliveryTarget === "mixed"
        ? parsed.lastDeliveryTarget
        : "",
    slackWebhookUrl:
      typeof parsed.slackWebhookUrl === "string"
        ? parsed.slackWebhookUrl.trim()
        : fallback.slackWebhookUrl,
    updatedAt: normalizeNullableIsoDate(parsed.updatedAt) ?? new Date().toISOString(),
    webhookSigningSecret:
      typeof parsed.webhookSigningSecret === "string"
        ? parsed.webhookSigningSecret.trim()
        : fallback.webhookSigningSecret,
    webhookUrl:
      typeof parsed.webhookUrl === "string" ? parsed.webhookUrl.trim() : fallback.webhookUrl,
  };
}

function normalizeEvents(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter(
        (item): item is WorkspaceIntegrationEvent =>
          typeof item === "string" && WORKSPACE_INTEGRATION_EVENTS.includes(item as WorkspaceIntegrationEvent)
      )
    )
  );
}

function normalizeNullableIsoDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function readStore() {
  await ensureStore();

  try {
    const contents = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(contents) as StoreShape;

    return Object.fromEntries(
      Object.entries(parsed ?? {}).map(([workspaceId, value]) => [
        workspaceId,
        parseWorkspaceIntegrationSettings(value, workspaceId),
      ])
    ) as StoreShape;
  } catch {
    await writeStore({});
    return {};
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
    await writeFile(STORE_FILE, JSON.stringify({}, null, 2), "utf8");
  }
}

const WORKSPACE_INTEGRATION_EVENTS: WorkspaceIntegrationEvent[] = [
  "application.created",
  "application.workflow.updated",
  "billing.payment_succeeded",
  "form.created",
  "form.deleted",
  "form.updated",
  "workspace.member.invited",
];
