import { NextResponse } from "next/server";

import {
  createWorkspaceUnauthorizedResponse,
  requireWorkspaceApiSession,
} from "@/lib/workspace-auth";
import {
  deleteScreeningSession,
  updateScreeningSessionWorkflow,
} from "@/lib/screening-session-store";
import {
  recruiterStatuses,
  type RecruiterStatus,
} from "@/types/document-intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ screeningId: string }> }
) {
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  try {
    const { screeningId } = await params;
    const payload = (await request.json().catch(() => ({}))) as Partial<{
      recruiterNotes: string;
      recruiterStatus: RecruiterStatus;
    }>;
    const recruiterNotes =
      typeof payload.recruiterNotes === "string" ? payload.recruiterNotes : "";
    const recruiterStatus = normalizeRecruiterStatus(payload.recruiterStatus);

    const screening = await updateScreeningSessionWorkflow({
      screeningId,
      workspaceId: session.workspaceId,
      recruiterNotes,
      recruiterStatus,
    });

    if (!screening) {
      return NextResponse.json(
        { error: "That screening record was not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ screening });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "I couldn't update that screening right now.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ screeningId: string }> }
) {
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  const { screeningId } = await params;
  const deleted = await deleteScreeningSession(screeningId, session.workspaceId);

  if (!deleted) {
    return NextResponse.json(
      { error: "That screening record was not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}

function normalizeRecruiterStatus(value: unknown): RecruiterStatus {
  return (recruiterStatuses as readonly string[]).includes(String(value))
    ? (value as RecruiterStatus)
    : "New";
}
