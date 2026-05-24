import { NextResponse } from "next/server";

import {
  getHiringApplicationRecord,
  getHiringFormRecord,
} from "@/lib/hiring-funnel-store";
import { requireWorkspaceFeatureApiAccess } from "@/lib/workspace-module-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ applicationId: string }> }
) {
  const access = await requireWorkspaceFeatureApiAccess(request, "pipeline");

  if (access.errorResponse || !access.session) {
    return access.errorResponse;
  }

  const { applicationId } = await params;
  const application = await getHiringApplicationRecord(
    applicationId,
    access.session.workspaceId
  );

  if (!application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  if (!application.workflow.interviewDate) {
    return NextResponse.json(
      { error: "Add an interview date before exporting a calendar invite." },
      { status: 400 }
    );
  }

  const form = await getHiringFormRecord(application.formId);
  const ics = buildInterviewCalendarInvite({
    application,
    formTitle: form?.title || "Candidate interview",
  });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${sanitizeFileName(application.applicant.fullName || application.resumeFile.fileName)}-interview.ics"`,
      "Content-Type": "text/calendar; charset=utf-8",
    },
  });
}

function buildInterviewCalendarInvite({
  application,
  formTitle,
}: {
  application: NonNullable<Awaited<ReturnType<typeof getHiringApplicationRecord>>>;
  formTitle: string;
}) {
  const start = new Date(application.workflow.interviewDate as string);
  const end = new Date(start.getTime() + 45 * 60 * 1000);
  const summary = `${application.applicant.fullName || "Candidate"} interview - ${formTitle}`;
  const descriptionParts = [
    application.workflow.nextStep ? `Next step: ${application.workflow.nextStep}` : "",
    application.workflow.interviewPlan
      ? `Interview plan:\n${application.workflow.interviewPlan}`
      : "",
    application.workflow.recruiterNotes
      ? `Recruiter notes:\n${application.workflow.recruiterNotes}`
      : "",
  ].filter(Boolean);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HR Board//Interview Export//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${application.id}@hrboard.local`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(descriptionParts.join("\n\n"))}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function toIcsDate(value: Date) {
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${value.getUTCFullYear()}${pad(value.getUTCMonth() + 1)}${pad(value.getUTCDate())}T${pad(value.getUTCHours())}${pad(value.getUTCMinutes())}${pad(value.getUTCSeconds())}Z`;
}

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function sanitizeFileName(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "interview";
}
