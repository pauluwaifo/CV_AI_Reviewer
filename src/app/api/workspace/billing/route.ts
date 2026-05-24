import { NextResponse } from "next/server";

import {
  createWorkspaceForbiddenResponse,
  createWorkspaceUnauthorizedResponse,
  isWorkspaceAdminSession,
  requireWorkspaceApiSession,
} from "@/lib/workspace-auth";
import { getWorkspaceBillingSummary } from "@/lib/workspace-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  try {
    const summary = await getWorkspaceBillingSummary(session.workspaceId);

    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "I couldn't load the workspace billing summary.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  if (!isWorkspaceAdminSession(session)) {
    return createWorkspaceForbiddenResponse();
  }

  return NextResponse.json(
    {
      error: "Use the dedicated billing actions to start or verify workspace payments.",
    },
    { status: 400 }
  );
}
