import { NextResponse } from "next/server";

import {
  createWorkspaceForbiddenResponse,
  createWorkspaceUnauthorizedResponse,
  isWorkspaceAdminSession,
  requireWorkspaceApiSession,
} from "@/lib/workspace-auth";
import { createWorkspaceAuditEvent } from "@/lib/workspace-audit-store";
import { emitWorkspaceIntegrationEvent } from "@/lib/workspace-integrations";
import { appendWorkspaceQuery } from "@/lib/workspace-settings";
import {
  getWorkspaceIntegrationSettings,
  saveWorkspaceIntegrationSettings,
  type WorkspaceIntegrationEvent,
} from "@/lib/workspace-integrations-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  if (!isWorkspaceAdminSession(session)) {
    return createWorkspaceForbiddenResponse();
  }

  const payload = (await request.json().catch(() => ({}))) as Partial<{
    enabledEvents: string[];
    slackWebhookUrl: string;
    webhookSigningSecret: string;
    webhookUrl: string;
  }>;
  const currentSettings = await saveWorkspaceIntegrationSettings(session.workspaceId, {
    enabledEvents: Array.isArray(payload.enabledEvents)
      ? (payload.enabledEvents as WorkspaceIntegrationEvent[])
      : undefined,
    slackWebhookUrl:
      typeof payload.slackWebhookUrl === "string" ? payload.slackWebhookUrl : undefined,
    webhookSigningSecret:
      typeof payload.webhookSigningSecret === "string"
        ? payload.webhookSigningSecret
        : undefined,
    webhookUrl: typeof payload.webhookUrl === "string" ? payload.webhookUrl : undefined,
  });

  if (!currentSettings.webhookUrl && !currentSettings.slackWebhookUrl) {
    return NextResponse.json(
      { error: "Add a webhook URL or Slack webhook URL before sending a test event." },
      { status: 400 }
    );
  }

  const result = await emitWorkspaceIntegrationEvent(
    session.workspaceId,
    "application.workflow.updated",
    {
      applicationId: "test-application",
      candidateEmail: session.email,
      candidateName: "Test candidate",
      candidateMailUrl: `${new URL(request.url).origin}${appendWorkspaceQuery(
        "/candidate-mail",
        session.workspaceId
      )}`,
      formId: "test-form",
      formTitle: "Integration test form",
      isTestEvent: true,
      pipelineUrl: `${new URL(request.url).origin}${appendWorkspaceQuery(
        "/pipeline",
        session.workspaceId
      )}`,
      workflow: {
        nextStep: "Verify your integration destination",
        ownerEmail: session.email,
        stage: "reviewing",
      },
    }
  );

  const settings = await getWorkspaceIntegrationSettings(session.workspaceId);

  await createWorkspaceAuditEvent({
    action: "workspace.integrations.tested",
    actorEmail: session.email,
    actorRole: session.role,
    metadata: {
      delivered: result.delivered,
      reason: result.reason,
      target: settings.lastDeliveryTarget,
    },
    summary: "Sent a workspace integration test event.",
    targetId: session.workspaceId,
    targetType: "workspace",
    workspaceId: session.workspaceId,
  }).catch(() => undefined);

  return NextResponse.json({
    settings,
    summary: result.delivered
      ? "Test event sent to the configured integration destination."
      : "Test event was attempted, but delivery did not complete cleanly.",
  });
}
