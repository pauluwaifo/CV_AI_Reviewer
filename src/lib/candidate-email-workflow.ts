import "server-only";

import { saveCandidateEmailDraft } from "@/lib/candidate-email-store";
import { buildTextEmailHtml, sendWorkspaceMail } from "@/lib/mail-service";
import type {
  CandidateEmailApprovalChannel,
  CandidateEmailDraftRecord,
} from "@/types/candidate-email";

export async function deliverCandidateEmailDraft({
  draft,
  approvedByEmail,
  approvedVia,
}: {
  draft: CandidateEmailDraftRecord;
  approvedByEmail: string;
  approvedVia: CandidateEmailApprovalChannel;
}) {
  if (draft.status === "sent") {
    return {
      draft,
      alreadySent: true,
    };
  }

  if (!draft.candidateEmail.trim()) {
    throw new Error("The candidate email address is missing for this draft.");
  }

  if (!draft.subject.trim() || !draft.body.trim()) {
    throw new Error("Add both a subject and email body before sending.");
  }

  const delivery = await sendWorkspaceMail({
    workspaceId: draft.workspaceId,
    to: draft.candidateEmail,
    subject: draft.subject,
    text: draft.body,
    html: buildTextEmailHtml(draft.body),
  });

  if (delivery.status !== "sent") {
    throw new Error(delivery.reason);
  }

  const timestamp = new Date().toISOString();
  const nextDraft: CandidateEmailDraftRecord = {
    ...draft,
    status: "sent",
    approvedAt: timestamp,
    approvedByEmail: approvedByEmail.trim().toLowerCase(),
    approvedVia,
    sentAt: timestamp,
    deliverySource: delivery.source,
    deliveryProvider: delivery.provider,
    deliveryMessageId: delivery.messageId,
    deliveryFromEmail: delivery.fromEmail,
    approvalTokenHash: "",
    approvalTokenExpiresAt: null,
    lastError: "",
    updatedAt: timestamp,
  };

  return {
    draft: await saveCandidateEmailDraft(nextDraft),
    alreadySent: false,
  };
}
