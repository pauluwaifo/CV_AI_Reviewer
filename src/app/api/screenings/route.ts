import { NextResponse } from "next/server";

import {
  createWorkspaceUnauthorizedResponse,
  requireWorkspaceApiSession,
} from "@/lib/workspace-auth";
import { listScreeningSessions } from "@/lib/screening-session-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  const screenings = await listScreeningSessions(session.workspaceId);
  return NextResponse.json({ screenings });
}
