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
