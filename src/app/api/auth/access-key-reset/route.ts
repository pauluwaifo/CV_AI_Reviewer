import { NextResponse } from "next/server";

import { createWorkspaceAccessResetRequest } from "@/lib/workspace-access-reset-store";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as Partial<{
      contactEmail: string;
      note: string;
      workspaceId: string;
    }>;
    const workspaceId = sanitizeWorkspaceId(payload.workspaceId ?? "");
    const contactEmail = normalizeEmail(payload.contactEmail);
    const note = typeof payload.note === "string" ? payload.note.slice(0, 600) : "";

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Enter the workspace ID you need help accessing." },
        { status: 400 }
      );
    }

    if (!contactEmail) {
      return NextResponse.json(
        { error: "Enter a valid email so the owner can verify the request." },
        { status: 400 }
      );
    }

    await createWorkspaceAccessResetRequest({
      workspaceId,
      contactEmail,
      note,
    });

    return NextResponse.json({
      message:
        "Your request has been sent to the platform owner. If approved, they will issue a new workspace access key.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "I couldn't submit that access key reset request right now.",
      },
      { status: 500 }
    );
  }
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const email = value.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "";
  }

  return email;
}
