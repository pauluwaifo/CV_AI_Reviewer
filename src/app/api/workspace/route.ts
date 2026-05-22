import { NextResponse } from "next/server";

import {
  createWorkspaceForbiddenResponse,
  createWorkspaceUnauthorizedResponse,
  isWorkspaceAdminSession,
  requireWorkspaceApiSession,
} from "@/lib/workspace-auth";
import {
  getWorkspaceSettings,
  saveWorkspaceSettings,
} from "@/lib/workspace-settings-store";
import { deleteWorkspace } from "@/lib/workspace-management-store";
import type { WorkspaceSettings } from "@/lib/workspace-settings";

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

  const settings = await getWorkspaceSettings(session.workspaceId);

  return NextResponse.json({ settings });
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
    const payload = (await request.json()) as Partial<WorkspaceSettings>;
    const settings = await saveWorkspaceSettings(session.workspaceId, payload);

    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json(
      { error: "I couldn't save those workspace settings right now." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  if (!isWorkspaceAdminSession(session)) {
    return createWorkspaceForbiddenResponse();
  }

  try {
    const payload = (await request.json().catch(() => ({}))) as Partial<{
      confirmWorkspaceId: string;
    }>;
    const confirmWorkspaceId =
      typeof payload.confirmWorkspaceId === "string"
        ? payload.confirmWorkspaceId.trim()
        : "";

    if (confirmWorkspaceId !== session.workspaceId) {
      return NextResponse.json(
        { error: "Type the exact workspace ID before deleting this workspace." },
        { status: 400 }
      );
    }

    const deleted = await deleteWorkspace(session.workspaceId);

    if (!deleted) {
      return NextResponse.json({ error: "That workspace was not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, workspaceId: session.workspaceId });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "I couldn't delete that workspace right now.",
      },
      { status: 500 }
    );
  }
}
