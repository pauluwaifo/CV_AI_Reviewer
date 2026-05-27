import { createHash, randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { deliverCandidateEmailDraft } from "@/lib/candidate-email-workflow";
import { getCandidateEmailDraft, saveCandidateEmailDraft } from "@/lib/candidate-email-store";
import { getHiringApplicationRecord } from "@/lib/hiring-funnel-store";
import {
  buildCandidateEmailApprovalRequestEmail,
  sendWorkspaceMail,
  type MailDeliveryResult,
} from "@/lib/mail-service";
import { getWorkspaceAccessRecord } from "@/lib/workspace-access-store";
import {
  createWorkspaceForbiddenResponse,
  isWorkspaceAdminSession,
} from "@/lib/workspace-auth";
import { requireWorkspaceFeatureApiAccess } from "@/lib/workspace-module-access";
import { appendWorkspaceQuery } from "@/lib/workspace-settings";
import { getWorkspaceSettings } from "@/lib/workspace-settings-store";
import {
  createWorkspaceDemoRestrictedResponse,
  shouldBlockWorkspaceDemoAction,
} from "@/lib/workspace-demo";
import type { CandidateEmailDraftRecord } from "@/types/candidate-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPROVAL_WINDOW_MS = 1000 * 60 * 60 * 24 * 3;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ applicationId: string; draftId: string }> }
) {
  const access = await requireWorkspaceFeatureApiAccess(request, "candidate_mail");

  if (access.errorResponse) {
    return access.errorResponse;
  }

  try {
    const { applicationId, draftId } = await params;
    const [application, draft] = await Promise.all([
      getHiringApplicationRecord(applicationId, access.session.workspaceId),
      getCandidateEmailDraft(draftId, access.session.workspaceId),
    ]);

    if (!application) {
      return NextResponse.json({ error: "Candidate submission not found." }, { status: 404 });
    }

    if (!draft || draft.applicationId !== application.id) {
      return NextResponse.json({ error: "Candidate email draft not found." }, { status: 404 });
    }

    const payload = (await request.json().catch(() => null)) as
      | {
          action?: "save" | "request_approval" | "approve_send" | "cancel";
          subject?: string;
          body?: string;
          prompt?: string;
        }
      | null;
    const action = payload?.action ?? "save";
    const subject = typeof payload?.subject === "string" ? payload.subject.trim() : draft.subject;
    const body = typeof payload?.body === "string" ? payload.body.trim() : draft.body;
    const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : draft.prompt;

    if (!subject || !body) {
      return NextResponse.json(
        { error: "Add both a subject and a message body before continuing." },
        { status: 400 }
      );
    }

    if (action === "cancel") {
      if (draft.status === "sent") {
        return NextResponse.json(
          { error: "Sent candidate emails cannot be cancelled." },
          { status: 400 }
        );
      }

      const cancelled = await saveCandidateEmailDraft({
        ...draft,
        subject,
        body,
        prompt,
        status: "cancelled",
        approvalTokenHash: "",
        approvalTokenExpiresAt: null,
        lastError: "",
        updatedAt: new Date().toISOString(),
      });

      return NextResponse.json({ draft: cancelled });
    }

    if (draft.status === "sent") {
      return NextResponse.json(
        { error: "This draft has already been sent to the candidate." },
        { status: 400 }
      );
    }

    const editableDraft = buildEditableDraft({
      draft,
      subject,
      body,
      prompt,
      editorEmail: access.session.email,
      editorRole: access.session.role,
    });

    if (action === "save") {
      return NextResponse.json({ draft: await saveCandidateEmailDraft(editableDraft) });
    }

    if (action === "request_approval") {
      if (shouldBlockWorkspaceDemoAction(access.session)) {
        return createWorkspaceDemoRestrictedResponse(
          "Approval emails are disabled in the one-time demo."
        );
      }

      const accessRecord = await getWorkspaceAccessRecord(access.session.workspaceId);
      const adminContactEmail = accessRecord?.contactEmail?.trim().toLowerCase() ?? "";
      const approvalToken = `approve_${randomBytes(24).toString("base64url")}`;
      const approvalUrl = new URL("/api/candidate-email-approvals", request.url);
      approvalUrl.searchParams.set("draftId", draft.id);
      approvalUrl.searchParams.set("token", approvalToken);
      const reviewUrl = new URL(
        appendWorkspaceQuery(
          `/pipeline?form=${encodeURIComponent(application.formId)}&application=${encodeURIComponent(application.id)}`,
          access.session.workspaceId
        ),
        request.url
      );
      const pendingDraft = await saveCandidateEmailDraft({
        ...editableDraft,
        status: "pending_approval",
        approvalRequestedAt: new Date().toISOString(),
        approvalRequestedByEmail: access.session.email,
        approvalTokenHash: hashApprovalToken(approvalToken),
        approvalTokenExpiresAt: new Date(Date.now() + APPROVAL_WINDOW_MS).toISOString(),
        lastError: "",
      });

      let approvalDelivery: MailDeliveryResult = {
        status: "skipped",
        source: "none",
        reason: "Approval email was not attempted.",
      };

      if (!adminContactEmail) {
        approvalDelivery = {
          status: "skipped",
          source: "none",
          reason:
            "No workspace admin contact email is saved yet, so approval is available only inside the web app.",
        };
      } else {
        try {
          const settings = await getWorkspaceSettings(access.session.workspaceId);
          approvalDelivery = await sendWorkspaceMail({
            workspaceId: access.session.workspaceId,
            to: adminContactEmail,
            ...buildCandidateEmailApprovalRequestEmail({
              organizationName: settings.organizationName,
              candidateName: draft.candidateName || application.applicant.fullName || "Candidate",
              candidateEmail: application.applicant.email,
              kind: draft.kind,
              subject,
              body,
              approvalUrl: approvalUrl.toString(),
              reviewUrl: reviewUrl.toString(),
              requestedByEmail: access.session.email,
            }),
          });
        } catch (error) {
          approvalDelivery = {
            status: "skipped",
            source: "none",
            reason:
              error instanceof Error
                ? error.message
                : "The approval email could not be delivered.",
          };
        }
      }

      if (approvalDelivery.status !== "sent" && approvalDelivery.reason) {
        const failedPendingDraft: CandidateEmailDraftRecord = {
          ...pendingDraft,
          lastError: approvalDelivery.reason,
          updatedAt: new Date().toISOString(),
        };
        await saveCandidateEmailDraft(failedPendingDraft);
      }

      return NextResponse.json({
        draft:
          approvalDelivery.status === "sent"
            ? pendingDraft
            : ({
                ...pendingDraft,
                lastError: approvalDelivery.reason || "",
              } satisfies CandidateEmailDraftRecord),
        approvalDelivery,
      });
    }

    if (action === "approve_send") {
      if (shouldBlockWorkspaceDemoAction(access.session)) {
        return createWorkspaceDemoRestrictedResponse(
          "Live candidate email sending is disabled in the one-time demo."
        );
      }

      if (!isWorkspaceAdminSession(access.session)) {
        return createWorkspaceForbiddenResponse();
      }

      const savedDraft = await saveCandidateEmailDraft(editableDraft);

      try {
        const delivery = await deliverCandidateEmailDraft({
          draft: savedDraft,
          approvedByEmail: access.session.email,
          approvedVia: "web",
        });

        return NextResponse.json({ draft: delivery.draft, mailDelivery: delivery });
      } catch (error) {
        const failedDraft = await saveCandidateEmailDraft({
          ...savedDraft,
          lastError:
            error instanceof Error ? error.message : "The candidate email could not be sent.",
          updatedAt: new Date().toISOString(),
        });

        return NextResponse.json(
          { error: failedDraft.lastError, draft: failedDraft },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ error: "That candidate email action is not supported." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "I couldn't update that candidate email draft right now.",
      },
      { status: 500 }
    );
  }
}

function buildEditableDraft({
  draft,
  subject,
  body,
  prompt,
  editorEmail,
  editorRole,
}: {
  draft: CandidateEmailDraftRecord;
  subject: string;
  body: string;
  prompt: string;
  editorEmail: string;
  editorRole: "admin" | "member";
}) {
  const updatedAt = new Date().toISOString();

  return {
    ...draft,
    subject,
    body,
    prompt,
    requestedByEmail: editorEmail.trim().toLowerCase(),
    requestedByRole: editorRole,
    status: "draft" as const,
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
    updatedAt,
  };
}

function hashApprovalToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
