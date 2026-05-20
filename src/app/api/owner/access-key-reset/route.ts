import { NextResponse } from "next/server";

import { authenticateOwnerCredentials, getOwnerSession } from "@/lib/owner-auth";
import {
  listWorkspaceAccessResetRequests,
  updateWorkspaceAccessResetRequestStatus,
} from "@/lib/workspace-access-reset-store";
import { generateWorkspaceAccessKey } from "@/lib/workspace-access-key";
import { updateWorkspaceAccessKeyHash } from "@/lib/workspace-access-store";
import { hashWorkspaceAccessKey } from "@/lib/workspace-auth";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getOwnerSession();

  if (!session) {
    return NextResponse.json(
      { error: "Sign in as the platform owner before managing reset requests." },
      { status: 401 }
    );
  }

  try {
    const payload = (await request.json().catch(() => ({}))) as Partial<{
      adminPassword: string;
      action: string;
      requestId: string;
      workspaceId: string;
    }>;
    const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
    const action = typeof payload.action === "string" ? payload.action : "";
    const adminPassword =
      typeof payload.adminPassword === "string" ? payload.adminPassword.trim() : "";

    if (action !== "reject") {
      if (!adminPassword) {
        return NextResponse.json(
          { error: "Enter your owner password before resetting a company access key." },
          { status: 400 }
        );
      }

      if (!authenticateOwnerCredentials(session.email, adminPassword)) {
        return NextResponse.json(
          { error: "That owner password is incorrect." },
          { status: 403 }
        );
      }
    }

    if (action === "reset-workspace") {
      const workspaceId = sanitizeWorkspaceId(payload.workspaceId ?? "");

      if (!workspaceId) {
        return NextResponse.json(
          { error: "Choose a company workspace first." },
          { status: 400 }
        );
      }

      const accessKey = generateWorkspaceAccessKey();

      await updateWorkspaceAccessKeyHash(workspaceId, hashWorkspaceAccessKey(accessKey));

      return NextResponse.json({
        accessKey,
        workspaceId,
      });
    }

    const resetRequest = (await listWorkspaceAccessResetRequests()).find(
      (requestItem) => requestItem.id === requestId
    );

    if (!resetRequest) {
      return NextResponse.json(
        { error: "That reset request was not found." },
        { status: 404 }
      );
    }

    if (resetRequest.status !== "pending") {
      return NextResponse.json(
        { error: "That reset request has already been handled." },
        { status: 409 }
      );
    }

    if (action === "reject") {
      const requestItem = await updateWorkspaceAccessResetRequestStatus({
        requestId,
        status: "rejected",
        resolvedBy: session.email,
      });

      return NextResponse.json({ request: requestItem });
    }

    if (action !== "issue-new-key") {
      return NextResponse.json({ error: "Unknown reset action." }, { status: 400 });
    }

    const accessKey = generateWorkspaceAccessKey();

    await updateWorkspaceAccessKeyHash(
      resetRequest.workspaceId,
      hashWorkspaceAccessKey(accessKey)
    );

    const requestItem = await updateWorkspaceAccessResetRequestStatus({
      requestId,
      status: "resolved",
      resolvedBy: session.email,
    });

    return NextResponse.json({ accessKey, request: requestItem });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "I couldn't complete that reset action right now.",
      },
      { status: 500 }
    );
  }
}
