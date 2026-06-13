import { NextResponse } from "next/server";

import {
  createWorkspaceUnauthorizedResponse,
  requireWorkspaceApiSession,
} from "@/lib/workspace-auth";
import {
  getHiringApplicationRecord,
  updateHiringApplicationPersonalityAssessment,
} from "@/lib/hiring-funnel-store";
import { normalizePersonalityAssessmentSnapshot } from "@/lib/personality-assessment";

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

  const application = await getHiringApplicationRecord(applicationId, session.workspaceId);

  if (!application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  return NextResponse.json({ application });
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

  const current = await getHiringApplicationRecord(applicationId, session.workspaceId);

  if (!current) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const payload = (await request.json().catch(() => ({}))) as Partial<{
    assessment: unknown;
  }>;
  const nextAssessment =
    payload.assessment === undefined
      ? current.personalityAssessment
      : normalizePersonalityAssessmentSnapshot(payload.assessment);

  const updated = await updateHiringApplicationPersonalityAssessment({
    applicationId,
    workspaceId: session.workspaceId,
    personalityAssessment: nextAssessment,
  });

  if (!updated) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  return NextResponse.json({ application: updated });
}
