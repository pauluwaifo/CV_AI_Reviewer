import { NextResponse } from "next/server";

import { getOwnerSession } from "@/lib/owner-auth";
import type { WorkspaceControlSettings } from "@/lib/workspace-controls";
import { saveWorkspaceControlSettings } from "@/lib/workspace-control-store";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      workspaceId: string;
    }>;
  }
) {
  const session = await getOwnerSession();

  if (!session) {
    return NextResponse.json(
      { error: "Sign in as the platform owner before managing workspace controls." },
      { status: 401 }
    );
  }

  try {
    const { workspaceId } = await context.params;
    const normalizedWorkspaceId = sanitizeWorkspaceId(workspaceId);
    const payload = (await request.json().catch(() => ({}))) as Partial<WorkspaceControlSettings>;
    const controls = await saveWorkspaceControlSettings(normalizedWorkspaceId, payload);

    return NextResponse.json({ controls });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "I couldn't update that workspace control state right now.",
      },
      { status: 500 }
    );
  }
}
