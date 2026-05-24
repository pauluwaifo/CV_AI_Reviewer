import { NextResponse } from "next/server";

import {
  createWorkspaceUnauthorizedResponse,
  requireWorkspaceApiSession,
} from "@/lib/workspace-auth";
import {
  deleteHiringApplication,
  getHiringApplicationRecord,
  getHiringApplicationDownload,
  updateHiringApplicationWorkflow,
} from "@/lib/hiring-funnel-store";
import { createWorkspaceAuditEvent } from "@/lib/workspace-audit-store";
import {
  applyHiringApplicationWorkflowAutomations,
  normalizeHiringApplicationWorkflow,
} from "@/lib/hiring-application-workflow";
import { emitWorkspaceIntegrationEvent } from "@/lib/workspace-integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ applicationId: string }> }
) {
  const { applicationId } = await params;
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  const download = await getHiringApplicationDownload(applicationId, session.workspaceId);

  if (!download) {
    return NextResponse.json({ error: "Application file not found." }, { status: 404 });
  }

  return new NextResponse(download.buffer, {
    status: 200,
    headers: {
      "Content-Type": download.mimeType,
      "Content-Length": String(download.buffer.length),
      "Content-Disposition": buildAttachmentDisposition(download.fileName),
      "Cache-Control": "no-store",
    },
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ applicationId: string }> }
) {
  const { applicationId } = await params;
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  const deleted = await deleteHiringApplication(applicationId, session.workspaceId);

  if (!deleted) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ applicationId: string }> }
) {
  const { applicationId } = await params;
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  try {
    const current = await getHiringApplicationRecord(applicationId, session.workspaceId);

    if (!current) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    const payload = (await request.json().catch(() => ({}))) as Partial<{
      interviewDate: string | null;
      interviewPlan: string;
      lastContactedAt: string | null;
      nextStep: string;
      ownerEmail: string;
      recruiterNotes: string;
      stage: string;
      tags: string[];
      interviewScorecard: unknown;
    }>;
    const workflow = applyHiringApplicationWorkflowAutomations({
      current: current.workflow,
      next: normalizeHiringApplicationWorkflow(
        {
          ...current.workflow,
          ...payload,
          updatedAt: new Date().toISOString(),
        },
        current.workflow
      ),
    });
    const updated = await updateHiringApplicationWorkflow({
      applicationId,
      workspaceId: session.workspaceId,
      workflow,
    });

    if (!updated) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    await createWorkspaceAuditEvent({
      action: "application.workflow.updated",
      actorEmail: session.email,
      actorRole: session.role,
      metadata: {
        ownerEmail: updated.workflow.ownerEmail,
        stage: updated.workflow.stage,
        tags: updated.workflow.tags,
      },
      summary: `Updated workflow for ${updated.applicant.fullName || updated.resumeFile.fileName}.`,
      targetId: updated.id,
      targetType: "application",
      workspaceId: session.workspaceId,
    }).catch(() => undefined);
    await emitWorkspaceIntegrationEvent(session.workspaceId, "application.workflow.updated", {
      applicationId: updated.id,
      candidateEmail: updated.applicant.email,
      candidateName: updated.applicant.fullName,
      formId: updated.formId,
      workflow: updated.workflow,
    }).catch(() => undefined);

    return NextResponse.json({ application: updated });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "I couldn't update that candidate workflow right now.",
      },
      { status: 500 }
    );
  }
}

function buildAttachmentDisposition(fileName: string) {
  const sanitized = fileName.replace(/["\r\n]/g, "_");
  const encoded = encodeURIComponent(fileName);

  return `attachment; filename="${sanitized}"; filename*=UTF-8''${encoded}`;
}
