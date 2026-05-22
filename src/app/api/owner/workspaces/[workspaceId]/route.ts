import { NextResponse } from "next/server";

import { authenticateOwnerCredentials, getOwnerSession } from "@/lib/owner-auth";
import { deleteWorkspace } from "@/lib/workspace-management-store";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const session = await getOwnerSession();

  if (!session) {
    return NextResponse.json(
      { error: "Sign in as the platform owner before deleting company workspaces." },
      { status: 401 }
    );
  }

  try {
    const { workspaceId: rawWorkspaceId } = await params;
    const requestedWorkspaceId =
      typeof rawWorkspaceId === "string" ? rawWorkspaceId.trim() : "";
    const workspaceId = sanitizeWorkspaceId(requestedWorkspaceId);
    const payload = (await request.json().catch(() => ({}))) as Partial<{
      adminPassword: string;
      confirmWorkspaceId: string;
    }>;
    const adminPassword =
      typeof payload.adminPassword === "string" ? payload.adminPassword.trim() : "";
    const confirmWorkspaceId =
      typeof payload.confirmWorkspaceId === "string"
        ? payload.confirmWorkspaceId.trim()
        : "";

    if (!requestedWorkspaceId) {
      return NextResponse.json({ error: "Choose a company workspace first." }, { status: 400 });
    }

    if (!adminPassword) {
      return NextResponse.json(
        { error: "Enter your owner password before deleting a workspace." },
        { status: 400 }
      );
    }

    if (!authenticateOwnerCredentials(session.email, adminPassword)) {
      return NextResponse.json({ error: "That owner password is incorrect." }, { status: 403 });
    }

    if (confirmWorkspaceId !== workspaceId) {
      return NextResponse.json(
        { error: "Type the exact workspace ID before deleting this workspace." },
        { status: 400 }
      );
    }

    const deleted = await deleteWorkspace(workspaceId);

    if (!deleted) {
      return NextResponse.json({ error: "That workspace was not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, workspaceId });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "I couldn't delete that workspace right now.",
      },
      { status: 500 }
    );
  }
}
