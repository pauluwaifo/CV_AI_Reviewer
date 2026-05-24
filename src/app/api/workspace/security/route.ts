import { NextResponse } from "next/server";

import { updateWorkspaceAccessKeyHash } from "@/lib/workspace-access-store";
import { generateWorkspaceAccessKey } from "@/lib/workspace-access-key";
import {
  createWorkspaceForbiddenResponse,
  createWorkspaceUnauthorizedResponse,
  hashWorkspaceAccessKey,
  isWorkspaceAdminSession,
  requireWorkspaceApiSession,
} from "@/lib/workspace-auth";
import { createWorkspaceAuditEvent } from "@/lib/workspace-audit-store";

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

  try {
    const payload = (await request.json().catch(() => ({}))) as Partial<{
      action: string;
      accessKey: string;
    }>;
    const nextAccessKey =
      typeof payload.accessKey === "string" ? payload.accessKey.trim() : "";

    if (payload.action !== "reset-workspace-access-key") {
      return NextResponse.json({ error: "Unknown security action." }, { status: 400 });
    }

    const accessKey = nextAccessKey || generateWorkspaceAccessKey();

    if (accessKey.length < 8) {
      return NextResponse.json(
        { error: "Use an access key with at least 8 characters." },
        { status: 400 }
      );
    }

    await updateWorkspaceAccessKeyHash(
      session.workspaceId,
      hashWorkspaceAccessKey(accessKey)
    );
    await createWorkspaceAuditEvent({
      action: "workspace.access_key.reset",
      actorEmail: session.email,
      actorRole: session.role,
      metadata: {},
      summary: "Reset the shared workspace access key.",
      targetId: session.workspaceId,
      targetType: "workspace_security",
      workspaceId: session.workspaceId,
    }).catch(() => undefined);

    return NextResponse.json({ accessKey });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "I couldn't reset the workspace access key right now.",
      },
      { status: 500 }
    );
  }
}
