import { NextResponse } from "next/server";

import {
  createWorkspaceForbiddenResponse,
  createWorkspaceUnauthorizedResponse,
  isWorkspaceAdminSession,
  requireWorkspaceApiSession,
} from "@/lib/workspace-auth";
import {
  createWorkspaceMemberInvite,
  listWorkspaceMembers,
  updateWorkspaceMemberStatus,
} from "@/lib/workspace-members-store";
import {
  buildWorkspaceInviteEmail,
  sendWorkspaceMail,
  type MailDeliveryResult,
} from "@/lib/mail-service";
import { createWorkspaceAuditEvent } from "@/lib/workspace-audit-store";
import { emitWorkspaceIntegrationEvent } from "@/lib/workspace-integrations";
import { appendWorkspaceQuery } from "@/lib/workspace-settings";
import { getWorkspaceSettings } from "@/lib/workspace-settings-store";

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

  const members = await listWorkspaceMembers(session.workspaceId);

  return NextResponse.json({ members });
}

export async function POST(request: Request) {
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  if (!isWorkspaceAdminSession(session)) {
    return createWorkspaceForbiddenResponse();
  }

  try {
    const payload = (await request.json()) as Partial<{
      email: string;
      role: "admin" | "member";
    }>;
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const role = payload.role === "admin" ? "admin" : "member";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Enter a valid member email address." },
        { status: 400 }
      );
    }

    const invite = await createWorkspaceMemberInvite({
      workspaceId: session.workspaceId,
      email,
      role,
    });
    let mailDelivery: MailDeliveryResult = {
      status: "skipped",
      source: "none",
      reason: "Invitation email was not attempted.",
    };

    try {
      const settings = await getWorkspaceSettings(session.workspaceId);
      const signInUrl = new URL("/signin", request.url).toString();
      const message = buildWorkspaceInviteEmail({
        appName: settings.appName,
        organizationName: settings.organizationName,
        workspaceId: session.workspaceId,
        role,
        accessKey: invite.accessKey,
        signInUrl,
      });

      mailDelivery = await sendWorkspaceMail({
        workspaceId: session.workspaceId,
        to: email,
        ...message,
      });
    } catch (mailError) {
      mailDelivery = {
        status: "skipped",
        source: "none",
        reason:
          mailError instanceof Error
            ? mailError.message
            : "Invitation email could not be sent.",
      };
    }

    await createWorkspaceAuditEvent({
      action: "workspace.member.invited",
      actorEmail: session.email,
      actorRole: session.role,
      metadata: {
        email,
        mailDelivery,
        role,
      },
      summary: `Invited ${email} as ${role}.`,
      targetId: invite.member.id,
      targetType: "workspace_member",
      workspaceId: session.workspaceId,
    }).catch(() => undefined);
    await emitWorkspaceIntegrationEvent(session.workspaceId, "workspace.member.invited", {
      email,
      memberId: invite.member.id,
      role,
      sender: session.email,
      workspaceUrl: `${new URL(request.url).origin}${appendWorkspaceQuery("/workspace", session.workspaceId)}`,
    }).catch(() => undefined);

    return NextResponse.json({ ...invite, mailDelivery });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "I couldn't invite that member right now.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  if (!isWorkspaceAdminSession(session)) {
    return createWorkspaceForbiddenResponse();
  }

  try {
    const payload = (await request.json()) as Partial<{
      memberId: string;
      status: "active" | "invited" | "revoked";
    }>;
    const memberId = typeof payload.memberId === "string" ? payload.memberId.trim() : "";
    const status = payload.status === "active" ? "active" : "revoked";

    if (!memberId) {
      return NextResponse.json({ error: "Choose a member first." }, { status: 400 });
    }

    const member = await updateWorkspaceMemberStatus({
      workspaceId: session.workspaceId,
      memberId,
      status,
    });
    await createWorkspaceAuditEvent({
      action: "workspace.member.status.updated",
      actorEmail: session.email,
      actorRole: session.role,
      metadata: {
        memberId,
        status,
      },
      summary: `${status === "revoked" ? "Revoked" : "Restored"} member access.`,
      targetId: memberId,
      targetType: "workspace_member",
      workspaceId: session.workspaceId,
    }).catch(() => undefined);

    return NextResponse.json({ member });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "I couldn't update that member right now.",
      },
      { status: 500 }
    );
  }
}
