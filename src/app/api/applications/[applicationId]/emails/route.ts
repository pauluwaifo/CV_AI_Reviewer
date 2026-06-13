import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { listCandidateEmailDraftsForApplication, createCandidateEmailDraft } from "@/lib/candidate-email-store";
import { generateCandidateEmailDraft } from "@/lib/document-intelligence";
import { getHiringApplicationRecord, getHiringFormRecord } from "@/lib/hiring-funnel-store";
import { getWorkspaceAccessRecord } from "@/lib/workspace-access-store";
import { getWorkspaceMailConnectionSummary } from "@/lib/mail-service";
import { requireWorkspaceFeatureApiAccess } from "@/lib/workspace-module-access";
import { getWorkspaceSettings } from "@/lib/workspace-settings-store";
import type { CandidateEmailKind } from "@/types/candidate-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ applicationId: string }> }
) {
  const access = await requireWorkspaceFeatureApiAccess(request, "candidate_mail");

  if (access.errorResponse) {
    return access.errorResponse;
  }

  const { applicationId } = await params;
  const application = await getHiringApplicationRecord(applicationId, access.session.workspaceId);

  if (!application) {
    return NextResponse.json({ error: "Candidate submission not found." }, { status: 404 });
  }

  const [drafts, accessRecord, mailConnection] = await Promise.all([
    listCandidateEmailDraftsForApplication(access.session.workspaceId, application.id),
    getWorkspaceAccessRecord(access.session.workspaceId),
    getWorkspaceMailConnectionSummary(access.session.workspaceId),
  ]);

  return NextResponse.json({
    drafts,
    adminContactEmail: accessRecord?.contactEmail ?? "",
    mailConnection,
    role: access.session.role,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ applicationId: string }> }
) {
  const access = await requireWorkspaceFeatureApiAccess(request, "candidate_mail");

  if (access.errorResponse) {
    return access.errorResponse;
  }

  try {
    const { applicationId } = await params;
    const application = await getHiringApplicationRecord(applicationId, access.session.workspaceId);

    if (!application) {
      return NextResponse.json({ error: "Candidate submission not found." }, { status: 404 });
    }

    if (!application.applicant.email.trim()) {
      return NextResponse.json(
        { error: "This candidate does not have an email address saved yet." },
        { status: 400 }
      );
    }

    const payload = (await request.json().catch(() => null)) as
      | {
          kind?: CandidateEmailKind;
          prompt?: string;
        }
      | null;
    const kind = normalizeCandidateEmailKind(payload?.kind);
    const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
    const [form, settings] = await Promise.all([
      getHiringFormRecord(application.formId),
      getWorkspaceSettings(access.session.workspaceId),
    ]);
    const generated = await generateCandidateEmailDraft({
      kind,
      application,
      form,
      organizationName: settings.organizationName,
      appName: settings.appName,
      prompt,
      provider: "auto",
      workspaceId: access.session.workspaceId,
    });
    const timestamp = new Date().toISOString();
    const draft = await createCandidateEmailDraft({
      id: randomUUID(),
      workspaceId: access.session.workspaceId,
      applicationId: application.id,
      formId: application.formId,
      candidateName: application.applicant.fullName || application.analysis.result.candidateProfile.name || "",
      candidateEmail: application.applicant.email,
      kind,
      status: "draft",
      subject: generated.subject,
      body: generated.body,
      prompt,
      provider: generated.provider,
      providerDetail: generated.providerDetail || "",
      providerWarnings: generated.providerWarnings,
      requestedByEmail: access.session.email,
      requestedByRole: access.session.role,
      approvalRequestedAt: null,
      approvalRequestedByEmail: "",
      approvalTokenHash: "",
      approvalTokenExpiresAt: null,
      approvedAt: null,
      approvedByEmail: "",
      approvedVia: null,
      sentAt: null,
      deliverySource: null,
      deliveryProvider: null,
      deliveryMessageId: "",
      deliveryFromEmail: "",
      lastError: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "I couldn't generate a candidate email draft right now.",
      },
      { status: 500 }
    );
  }
}

function normalizeCandidateEmailKind(value: unknown): CandidateEmailKind {
  return value === "follow_up" ? "follow_up" : "rejection";
}
