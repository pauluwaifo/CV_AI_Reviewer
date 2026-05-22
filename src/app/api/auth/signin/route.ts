import { NextResponse } from "next/server";

import {
  applyWorkspaceSessionCookie,
  authenticateWorkspaceCredentials,
  createWorkspaceSession,
  normalizeNextPath,
} from "@/lib/workspace-auth";
import { getWorkspaceSettings } from "@/lib/workspace-settings-store";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Partial<{
      workspaceId: string;
      accessKey: string;
      keepSignedIn: boolean;
      next: string;
    }>;
    const rawWorkspaceId =
      typeof payload.workspaceId === "string" ? payload.workspaceId : "";
    const workspaceId = rawWorkspaceId.trim()
      ? sanitizeWorkspaceId(rawWorkspaceId)
      : "";
    const accessKey = typeof payload.accessKey === "string" ? payload.accessKey : "";
    const keepSignedIn = payload.keepSignedIn === true;
    const nextPath = normalizeNextPath(payload.next);

    if (!workspaceId || !accessKey.trim()) {
      return NextResponse.json(
        { error: "Enter both the workspace ID and access key." },
        { status: 400 }
      );
    }

    const authentication = await authenticateWorkspaceCredentials(
      workspaceId,
      accessKey
    );

    if (!authentication) {
      return NextResponse.json(
        { error: "The workspace ID or access key is invalid." },
        { status: 401 }
      );
    }

    const [{ token, maxAgeSeconds, session }, settings] = await Promise.all([
      createWorkspaceSession(authentication, keepSignedIn),
      getWorkspaceSettings(authentication.workspaceId),
    ]);
    const response = NextResponse.json({
      ok: true,
      nextPath,
      session,
      settings,
    });

    applyWorkspaceSessionCookie(response, token, maxAgeSeconds);

    return response;
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "I couldn't start that workspace session right now." },
      { status: 500 }
    );
  }
}
