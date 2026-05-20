import { NextResponse } from "next/server";

import { createWorkspaceAccessResetRequest } from "@/lib/workspace-access-reset-store";
import { getWorkspaceAccessRecord } from "@/lib/workspace-access-store";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as Partial<{
      workspaceId: string;
      contactEmail: string;
      note: string;
    }>;
    const workspaceId = sanitizeWorkspaceId(payload.workspaceId || "");
    const contactEmail =
      typeof payload.contactEmail === "string" ? payload.contactEmail.trim().toLowerCase() : "";
    const note = typeof payload.note === "string" ? payload.note.trim() : "";

    if (!workspaceId || !contactEmail) {
      return NextResponse.json(
        { error: "Enter your workspace ID and admin email." },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      return NextResponse.json(
        { error: "Enter a valid admin email address." },
        { status: 400 }
      );
    }

    const record = await getWorkspaceAccessRecord(workspaceId);

    if (!record || record.contactEmail !== contactEmail) {
      return NextResponse.json(
        {
          error:
            "That workspace ID and admin email do not match any workspace record.",
        },
        { status: 404 }
      );
    }

    const resetRequest = await createWorkspaceAccessResetRequest({
      workspaceId,
      contactEmail,
      note,
    });

    return NextResponse.json({ request: resetRequest });
  } catch {
    return NextResponse.json(
      { error: "I couldn't create that reset request right now." },
      { status: 500 }
    );
  }
}
