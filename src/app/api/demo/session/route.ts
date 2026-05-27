import { NextResponse } from "next/server";

import {
  getWorkspaceSessionFromRequest,
  isWorkspaceDemoSession,
} from "@/lib/workspace-auth";
import {
  applyWorkspaceDemoSessionCookies,
  createWorkspaceDemoUnavailableResponse,
  getWorkspaceDemoCookieValue,
  startWorkspaceDemo,
} from "@/lib/workspace-demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const existingSession = await getWorkspaceSessionFromRequest(request);

  if (existingSession && isWorkspaceDemoSession(existingSession)) {
    return NextResponse.json({
      ok: true,
      nextPath: "/pipeline",
      session: existingSession,
    });
  }

  if (existingSession && !isWorkspaceDemoSession(existingSession)) {
    return NextResponse.json(
      {
        error:
          "Sign out of the current workspace first if you want to switch into the one-time demo.",
      },
      { status: 409 }
    );
  }

  if (getWorkspaceDemoCookieValue(request.headers.get("cookie"))) {
    return createWorkspaceDemoUnavailableResponse();
  }

  try {
    const { token, maxAgeSeconds, session } = await startWorkspaceDemo();
    const response = NextResponse.json({
      ok: true,
      nextPath: "/pipeline",
      session,
    });

    applyWorkspaceDemoSessionCookies(response, token, maxAgeSeconds);

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "I couldn't open the one-time demo right now.",
      },
      { status: 500 }
    );
  }
}
