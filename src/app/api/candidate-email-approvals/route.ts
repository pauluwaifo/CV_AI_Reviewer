import { createHash } from "node:crypto";

import { deliverCandidateEmailDraft } from "@/lib/candidate-email-workflow";
import { getCandidateEmailDraft, getCandidateEmailDraftByApprovalTokenHash, saveCandidateEmailDraft } from "@/lib/candidate-email-store";
import { getWorkspaceAccessRecord } from "@/lib/workspace-access-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const draftId = url.searchParams.get("draftId")?.trim() ?? "";
  const token = url.searchParams.get("token")?.trim() ?? "";

  if (!draftId || !token) {
    return buildApprovalHtmlResponse({
      title: "Approval link is incomplete",
      message: "This approval link is missing the required draft or token details.",
      tone: "error",
    });
  }

  const tokenHash = hashApprovalToken(token);
  const draft = await getCandidateEmailDraft(draftId);

  if (!draft || draft.approvalTokenHash !== tokenHash) {
    const fallbackDraft = await getCandidateEmailDraftByApprovalTokenHash(tokenHash);

    if (!fallbackDraft || fallbackDraft.id !== draftId) {
      return buildApprovalHtmlResponse({
        title: "Approval link is invalid",
        message: "This candidate-email approval link is no longer valid or has already been replaced.",
        tone: "error",
      });
    }
  }

  const resolvedDraft =
    draft && draft.approvalTokenHash === tokenHash
      ? draft
      : await getCandidateEmailDraftByApprovalTokenHash(tokenHash);

  if (!resolvedDraft) {
    return buildApprovalHtmlResponse({
      title: "Approval link is invalid",
      message: "This candidate-email approval link could not be resolved.",
      tone: "error",
    });
  }

  if (resolvedDraft.status === "sent") {
    return buildApprovalHtmlResponse({
      title: "Email already sent",
      message: `The ${humanizeKind(resolvedDraft.kind)} email for ${resolvedDraft.candidateName || resolvedDraft.candidateEmail} was already sent.`,
      tone: "success",
    });
  }

  if (resolvedDraft.status !== "pending_approval") {
    return buildApprovalHtmlResponse({
      title: "Approval is no longer pending",
      message: "This draft is no longer waiting for admin approval inside the workspace.",
      tone: "error",
    });
  }

  if (
    resolvedDraft.approvalTokenExpiresAt &&
    Date.parse(resolvedDraft.approvalTokenExpiresAt) < Date.now()
  ) {
    await saveCandidateEmailDraft({
      ...resolvedDraft,
      status: "draft",
      approvalTokenHash: "",
      approvalTokenExpiresAt: null,
      lastError: "The approval link expired before it was used.",
      updatedAt: new Date().toISOString(),
    });

    return buildApprovalHtmlResponse({
      title: "Approval link expired",
      message: "This approval link expired. Request a fresh approval email from the workspace.",
      tone: "error",
    });
  }

  try {
    const accessRecord = await getWorkspaceAccessRecord(resolvedDraft.workspaceId);
    const approvedByEmail = accessRecord?.contactEmail || "workspace-admin";
    const delivery = await deliverCandidateEmailDraft({
      draft: resolvedDraft,
      approvedByEmail,
      approvedVia: "email",
    });

    return buildApprovalHtmlResponse({
      title: "Candidate email sent",
      message: `The ${humanizeKind(delivery.draft.kind)} email for ${delivery.draft.candidateName || delivery.draft.candidateEmail} has been approved and sent successfully.`,
      tone: "success",
    });
  } catch (error) {
    await saveCandidateEmailDraft({
      ...resolvedDraft,
      lastError:
        error instanceof Error ? error.message : "The candidate email could not be sent.",
      updatedAt: new Date().toISOString(),
    });

    return buildApprovalHtmlResponse({
      title: "Approval could not be completed",
      message:
        error instanceof Error
          ? error.message
          : "The candidate email could not be sent after approval.",
      tone: "error",
    });
  }
}

function buildApprovalHtmlResponse({
  title,
  message,
  tone,
}: {
  title: string;
  message: string;
  tone: "success" | "error";
}) {
  const accent = tone === "success" ? "#137333" : "#a50e0e";
  const bg = tone === "success" ? "#e6f4ea" : "#fce8e6";

  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { margin:0; font-family:Arial,sans-serif; background:#0f172a; color:#f8fafc; display:grid; min-height:100vh; place-items:center; padding:24px; }
      .card { width:min(560px, 100%); background:#111827; border:1px solid #1f2937; border-radius:18px; padding:28px; box-shadow:0 24px 80px rgba(0,0,0,0.4); }
      .eyebrow { display:inline-flex; align-items:center; padding:8px 12px; border-radius:999px; background:${bg}; color:${accent}; font-size:12px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; }
      h1 { margin:18px 0 12px; font-size:32px; line-height:1.1; }
      p { margin:0; color:#cbd5e1; line-height:1.7; }
      a { display:inline-block; margin-top:24px; color:#ffffff; background:#2563eb; text-decoration:none; padding:12px 16px; border-radius:10px; font-weight:600; }
    </style>
  </head>
  <body>
    <main class="card">
      <span class="eyebrow">${tone === "success" ? "Approved" : "Attention needed"}</span>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      <a href="/">Return to Briefboard</a>
    </main>
  </body>
</html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}

function humanizeKind(value: string) {
  return value === "follow_up" ? "follow-up" : "rejection";
}

function hashApprovalToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
