import { NextResponse } from "next/server";

import {
  createWorkspaceForbiddenResponse,
  createWorkspaceUnauthorizedResponse,
  isWorkspaceAdminSession,
  requireWorkspaceApiSession,
} from "@/lib/workspace-auth";
import { createWorkspaceAuditEvent } from "@/lib/workspace-audit-store";
import {
  getWorkspaceIntegrationSettings,
  saveWorkspaceIntegrationSettings,
  WORKSPACE_INTEGRATION_EVENT_OPTIONS,
  type WorkspaceIntegrationEvent,
} from "@/lib/workspace-integrations-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  if (!isWorkspaceAdminSession(session)) {
    return createWorkspaceForbiddenResponse();
  }

  const settings = await getWorkspaceIntegrationSettings(session.workspaceId);

  return NextResponse.json({
    options: WORKSPACE_INTEGRATION_EVENT_OPTIONS,
    settings,
  });
}

export async function PUT(request: Request) {
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  if (!isWorkspaceAdminSession(session)) {
    return createWorkspaceForbiddenResponse();
  }

  try {
    const payload = (await request.json().catch(() => ({}))) as Partial<{
      enabledEvents: string[];
      slackWebhookUrl: string;
      webhookSigningSecret: string;
      webhookUrl: string;
    }>;
    const settings = await saveWorkspaceIntegrationSettings(session.workspaceId, {
      enabledEvents: Array.isArray(payload.enabledEvents)
        ? (payload.enabledEvents as WorkspaceIntegrationEvent[])
        : [],
      slackWebhookUrl: typeof payload.slackWebhookUrl === "string" ? payload.slackWebhookUrl : "",
      webhookSigningSecret:
        typeof payload.webhookSigningSecret === "string" ? payload.webhookSigningSecret : "",
      webhookUrl: typeof payload.webhookUrl === "string" ? payload.webhookUrl : "",
    });

    await createWorkspaceAuditEvent({
      action: "workspace.integrations.updated",
      actorEmail: session.email,
      actorRole: session.role,
      metadata: {
        enabledEvents: settings.enabledEvents,
        hasSlackWebhook: Boolean(settings.slackWebhookUrl),
        hasWebhook: Boolean(settings.webhookUrl),
      },
      summary: "Updated workspace integration settings.",
      targetId: session.workspaceId,
      targetType: "workspace",
      workspaceId: session.workspaceId,
    }).catch(() => undefined);

    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "I couldn't save those integration settings right now.",
      },
      { status: 500 }
    );
  }
}
