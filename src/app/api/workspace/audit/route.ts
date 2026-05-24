import { NextResponse } from "next/server";

import { listWorkspaceAuditEvents } from "@/lib/workspace-audit-store";
import { requireWorkspaceFeatureApiAccess } from "@/lib/workspace-module-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireWorkspaceFeatureApiAccess(request, "audit_log", {
    role: "admin",
  });

  if (access.errorResponse || !access.session) {
    return access.errorResponse;
  }

  const url = new URL(request.url);
  const wantsCsv = url.searchParams.get("format") === "csv";
  const limit = clampLimit(url.searchParams.get("limit"));
  const events = await listWorkspaceAuditEvents(access.session.workspaceId, limit);

  if (wantsCsv) {
    const csv = buildAuditCsv(events);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="workspace-audit-${access.session.workspaceId}.csv"`,
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  }

  return NextResponse.json({ events });
}

function buildAuditCsv(
  events: Awaited<ReturnType<typeof listWorkspaceAuditEvents>>
) {
  const headers = [
    "created_at",
    "action",
    "actor_email",
    "actor_role",
    "target_type",
    "target_id",
    "summary",
    "metadata_json",
  ];
  const rows = events.map((event) => [
    new Date(event.createdAt).toLocaleString(),
    event.action,
    event.actorEmail,
    event.actorRole,
    event.targetType,
    event.targetId,
    event.summary,
    JSON.stringify(event.metadata ?? {}),
  ]);

  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function escapeCsvCell(value: string) {
  const normalized = value.replace(/\r?\n/g, " ").trim();
  const escaped = normalized.replace(/"/g, "\"\"");
  return `"${escaped}"`;
}

function clampLimit(value: string | null) {
  const parsed = Number.parseInt(value || "", 10);

  if (!Number.isFinite(parsed)) {
    return 250;
  }

  return Math.max(1, Math.min(500, parsed));
}
