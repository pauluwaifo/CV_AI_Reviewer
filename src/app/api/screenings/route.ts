import { NextResponse } from "next/server";

import { requireWorkspaceFeatureApiAccess } from "@/lib/workspace-module-access";
import { listScreeningSessions } from "@/lib/screening-session-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireWorkspaceFeatureApiAccess(request, "results");

  if (access.errorResponse) {
    return access.errorResponse;
  }

  const screenings = await listScreeningSessions(access.session.workspaceId);
  return NextResponse.json({ screenings });
}
