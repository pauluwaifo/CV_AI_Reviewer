import { NextResponse } from "next/server";

import {
  createWorkspaceUnauthorizedResponse,
  requireWorkspaceApiSession,
} from "@/lib/workspace-auth";
import {
  deleteHiringApplication,
  getHiringApplicationDownload,
} from "@/lib/hiring-funnel-store";

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

  const download = await getHiringApplicationDownload(applicationId, session.workspaceId);

  if (!download) {
    return NextResponse.json({ error: "Application file not found." }, { status: 404 });
  }

  return new NextResponse(download.buffer, {
    status: 200,
    headers: {
      "Content-Type": download.mimeType,
      "Content-Length": String(download.buffer.length),
      "Content-Disposition": buildAttachmentDisposition(download.fileName),
      "Cache-Control": "no-store",
    },
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ applicationId: string }> }
) {
  const { applicationId } = await params;
  const session = await requireWorkspaceApiSession(request);

  if (!session) {
    return createWorkspaceUnauthorizedResponse();
  }

  const deleted = await deleteHiringApplication(applicationId, session.workspaceId);

  if (!deleted) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

function buildAttachmentDisposition(fileName: string) {
  const sanitized = fileName.replace(/["\r\n]/g, "_");
  const encoded = encodeURIComponent(fileName);

  return `attachment; filename="${sanitized}"; filename*=UTF-8''${encoded}`;
}
