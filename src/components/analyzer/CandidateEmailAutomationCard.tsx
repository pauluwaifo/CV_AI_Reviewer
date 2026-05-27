"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useWorkspace } from "@/context/WorkspaceContext";
import {
  appendWorkspaceQuery,
  buildWorkspaceApiHeaders,
} from "@/lib/workspace-settings";
import type { CandidateEmailDraftRecord, CandidateEmailKind } from "@/types/candidate-email";
import type { HiringApplicationRecord } from "@/types/hiring-funnel";
import type { WorkspaceSessionRole } from "@/types/workspace-session";

type LoadState = "idle" | "loading" | "ready";

type CandidateMailConnectionSummary = {
  provider: "gmail" | "smtp" | "none";
  source: "workspace" | "global" | "none";
  fromEmail: string;
  hasWorkspaceConnection: boolean;
  updatedAt: string | null;
  connectedAccountEmail: string;
  relayHost: string;
  senderIdentity: "primary" | "alias" | "smtp" | "unknown" | "none";
};

type CandidateEmailNoteTone = "success" | "warning" | "error" | "info";

export default function CandidateEmailAutomationCard({
  application,
  formTitle,
  formTeam,
  sessionRole,
  sessionEmail,
}: {
  application: HiringApplicationRecord;
  formTitle: string;
  formTeam: string;
  sessionRole: WorkspaceSessionRole;
  sessionEmail: string;
}) {
  const { settings } = useWorkspace();
  const workspaceHeaders = useMemo(
    () => buildWorkspaceApiHeaders(settings.workspaceId),
    [settings.workspaceId]
  );
  const [drafts, setDrafts] = useState<CandidateEmailDraftRecord[]>([]);
  const [activeDraftId, setActiveDraftId] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftPrompt, setDraftPrompt] = useState("");
  const [adminContactEmail, setAdminContactEmail] = useState("");
  const [mailConnection, setMailConnection] = useState<CandidateMailConnectionSummary | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: CandidateEmailNoteTone; text: string } | null>(null);
  const [isGeneratingKind, setIsGeneratingKind] = useState<CandidateEmailKind | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRequestingApproval, setIsRequestingApproval] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const hasCandidateEmail = Boolean(application.applicant.email.trim());

  const activeDraft = useMemo(
    () => drafts.find((item) => item.id === activeDraftId) ?? drafts[0] ?? null,
    [activeDraftId, drafts]
  );
  const isActiveDraftSent = activeDraft?.status === "sent";

  const loadDrafts = useCallback(
    async (preferredDraftId?: string) => {
      setLoadState("loading");
      setError(null);

      try {
        const response = await fetch(
          appendWorkspaceQuery(
            `/api/applications/${application.id}/emails`,
            settings.workspaceId
          ),
          {
            cache: "no-store",
            headers: workspaceHeaders,
          }
        );
        const payload = (await response.json()) as {
          drafts?: CandidateEmailDraftRecord[];
          adminContactEmail?: string;
          mailConnection?: CandidateMailConnectionSummary;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || "I couldn't load the candidate email drafts.");
        }

        const nextDrafts = payload.drafts ?? [];
        setDrafts(nextDrafts);
        setAdminContactEmail(payload.adminContactEmail ?? "");
        setMailConnection(payload.mailConnection ?? null);
        setActiveDraftId(preferredDraftId || nextDrafts[0]?.id || "");
        setLoadState("ready");
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "I couldn't load the candidate email drafts."
        );
        setLoadState("ready");
      }
    },
    [application.id, settings.workspaceId, workspaceHeaders]
  );

  useEffect(() => {
    setDrafts([]);
    setActiveDraftId("");
    setDraftSubject("");
    setDraftBody("");
    setDraftPrompt("");
    setAdminContactEmail("");
    setMailConnection(null);
    setNote(null);
    void loadDrafts();
  }, [application.id, loadDrafts]);

  useEffect(() => {
    if (!activeDraft) {
      setDraftSubject("");
      setDraftBody("");
      setDraftPrompt("");
      return;
    }

    setDraftSubject(activeDraft.subject);
    setDraftBody(activeDraft.body);
    setDraftPrompt(activeDraft.prompt);
  }, [activeDraft]);

  function upsertDraft(nextDraft: CandidateEmailDraftRecord) {
    setDrafts((current) => {
      const nextDrafts = [nextDraft, ...current.filter((item) => item.id !== nextDraft.id)];
      nextDrafts.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      return nextDrafts;
    });
    setActiveDraftId(nextDraft.id);
  }

  async function handleGenerateDraft(kind: CandidateEmailKind) {
    if (!hasCandidateEmail || isGeneratingKind) {
      return;
    }

    setIsGeneratingKind(kind);
    setError(null);
    setNote(null);

    try {
      const response = await fetch(
        appendWorkspaceQuery(
          `/api/applications/${application.id}/emails`,
          settings.workspaceId
        ),
        {
          method: "POST",
          headers: {
            ...workspaceHeaders,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            kind,
            prompt: draftPrompt.trim(),
          }),
        }
      );
      const payload = (await response.json()) as {
        draft?: CandidateEmailDraftRecord;
        error?: string;
      };

      if (!response.ok || !payload.draft) {
        throw new Error(payload.error || "I couldn't generate that candidate email.");
      }

      upsertDraft(payload.draft);
      setNote({
        tone: "success",
        text:
          kind === "follow_up"
            ? "AI follow-up draft is ready for review."
            : "AI rejection draft is ready for review.",
      });
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "I couldn't generate that candidate email."
      );
    } finally {
      setIsGeneratingKind(null);
    }
  }

  async function handleDraftAction(
    action: "save" | "request_approval" | "approve_send" | "cancel"
  ) {
    if (!activeDraft) {
      return;
    }

    if (action === "save") {
      setIsSaving(true);
    } else if (action === "request_approval") {
      setIsRequestingApproval(true);
    } else if (action === "approve_send") {
      setIsSending(true);
    } else {
      setIsCancelling(true);
    }

    setError(null);
    setNote(null);

    try {
      const response = await fetch(
        appendWorkspaceQuery(
          `/api/applications/${application.id}/emails/${activeDraft.id}`,
          settings.workspaceId
        ),
        {
          method: "PATCH",
          headers: {
            ...workspaceHeaders,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            subject: draftSubject.trim(),
            body: draftBody.trim(),
            prompt: draftPrompt.trim(),
          }),
        }
      );
      const payload = (await response.json()) as {
        draft?: CandidateEmailDraftRecord;
        error?: string;
        approvalDelivery?: {
          status: "sent" | "skipped";
          reason?: string;
          source?: "workspace" | "global" | "none";
        };
      };

      if (!response.ok || !payload.draft) {
        throw new Error(payload.error || "I couldn't update that candidate email.");
      }

      upsertDraft(payload.draft);

      if (action === "save") {
        setNote({ tone: "success", text: "Draft changes saved." });
      } else if (action === "request_approval") {
        setNote({
          tone:
            payload.approvalDelivery?.status === "sent"
              ? "success"
              : "warning",
          text:
            payload.approvalDelivery?.status === "sent"
              ? "Admin approval email sent. The draft is now waiting for approval."
              : payload.approvalDelivery?.reason ||
                "The draft is pending approval inside the web app.",
        });
      } else if (action === "approve_send") {
        setNote({
          tone: "success",
          text: `Candidate email sent to ${payload.draft.candidateEmail}.`,
        });
      } else {
        setNote({ tone: "warning", text: "Draft cancelled and removed from the approval queue." });
      }
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "I couldn't update that candidate email."
      );
    } finally {
      setIsSaving(false);
      setIsRequestingApproval(false);
      setIsSending(false);
      setIsCancelling(false);
    }
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-[var(--workspace-form-border-soft)] bg-white p-5 shadow-[var(--workspace-form-shadow-sm)] dark:border-gray-800 dark:bg-gray-900">
      <div className="flex min-w-0 flex-col gap-5 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div className="min-w-0 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
            Candidate mail
          </p>
          <h4 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--workspace-form-title)] dark:text-white">
            Compose rejection and follow-up emails with approval built in
          </h4>
          <p className="mt-3 text-sm leading-7 text-[var(--workspace-form-muted)] dark:text-gray-300">
            Generate a recruiter-ready email with AI, review the draft here, then either request admin approval by mail or approve and send it inside the workspace.
          </p>
        </div>

        <div className="grid min-w-0 gap-3 md:grid-cols-2 2xl:min-w-[380px] 2xl:max-w-[460px]">
          <ReviewMetricCard
            label="Candidate email"
            value={application.applicant.email || "Not captured"}
          />
          <ReviewMetricCard
            label="Sender"
            value={
              mailConnection?.source === "none"
                ? "Not configured"
                : mailConnection?.fromEmail || "Loading..."
            }
          />
        </div>
      </div>

      {!hasCandidateEmail ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
          Add the candidate email address first before composing or sending recruiter emails from the workspace.
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]">
            <div className="min-w-0 rounded-xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-4 dark:border-gray-800 dark:bg-gray-950/60">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  onClick={() => void handleGenerateDraft("rejection")}
                  disabled={Boolean(isGeneratingKind)}
                  className="inline-flex items-center justify-center rounded-lg bg-[var(--workspace-form-accent)] px-4 py-2.5 text-sm font-medium text-[var(--workspace-form-accent-text)] transition hover:bg-[var(--workspace-form-accent-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isGeneratingKind === "rejection" ? "Generating rejection..." : "Generate rejection"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleGenerateDraft("follow_up")}
                  disabled={Boolean(isGeneratingKind)}
                  className="inline-flex items-center justify-center rounded-lg border border-[var(--workspace-form-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--workspace-form-title)] transition hover:bg-[var(--workspace-form-page)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-transparent dark:text-white dark:hover:bg-white/5"
                >
                  {isGeneratingKind === "follow_up" ? "Generating follow-up..." : "Generate follow-up"}
                </button>
              </div>

              <label className="mt-4 block space-y-2">
                <span className="text-sm font-medium text-[var(--workspace-form-title)] dark:text-gray-200">
                  Optional instruction for AI
                </span>
                <textarea
                  value={draftPrompt}
                  onChange={(event) => setDraftPrompt(event.target.value)}
                  rows={4}
                  placeholder="Example: keep the rejection warm and concise, or ask the candidate to confirm current availability."
                  className="w-full rounded-xl border border-[var(--workspace-form-border)] bg-white px-4 py-3 text-sm text-[var(--workspace-form-title)] outline-hidden transition placeholder:text-gray-400 focus:border-[var(--workspace-form-accent)] dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                />
              </label>
            </div>

            <div className="min-w-0 rounded-xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-4 dark:border-gray-800 dark:bg-gray-950/60">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                Approval flow
              </p>
              <ul className="mt-3 space-y-3 text-sm leading-6 text-[var(--workspace-form-muted)] dark:text-gray-300">
                <li>1. Generate a draft for {application.applicant.fullName || "this candidate"}.</li>
                <li>2. Review and edit the subject and message before approval.</li>
                <li>
                  3. {sessionRole === "admin" ? "Approve and send it here, or email the approval link to the admin inbox." : "Request admin approval to email the workspace admin contact."}
                </li>
                <li>
                  4. Once approved, the email is sent from{" "}
                  {mailConnection?.source === "none"
                    ? "the configured workspace sender once it is connected"
                    : mailConnection?.fromEmail || "your connected sender"}.
                </li>
              </ul>
              <div className="mt-4 min-w-0 rounded-xl border border-[var(--workspace-form-border-soft)] bg-white px-4 py-3 text-sm leading-6 text-[var(--workspace-form-muted)] dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                <span className="font-medium text-[var(--workspace-form-title)] dark:text-white">
                  Admin contact:
                </span>{" "}
                {adminContactEmail || "Not captured yet. Web-app approval will still work."}
              </div>
              <div className="mt-3 min-w-0 rounded-xl border border-[var(--workspace-form-border-soft)] bg-white px-4 py-3 text-sm leading-6 text-[var(--workspace-form-muted)] dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                <span className="font-medium text-[var(--workspace-form-title)] dark:text-white">
                  Reviewing as:
                </span>{" "}
                {sessionEmail}
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-5 rounded-xl border border-[var(--workspace-form-danger-border)] bg-[var(--workspace-form-danger-bg)] px-4 py-3 text-sm leading-6 text-[var(--workspace-form-danger-text)] dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-100">
              {error}
            </div>
          ) : null}

          {note ? (
            <div
              className={`mt-5 rounded-xl border px-4 py-3 text-sm leading-6 ${
                note.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100"
                  : note.tone === "warning"
                    ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100"
                    : note.tone === "error"
                      ? "border-[var(--workspace-form-danger-border)] bg-[var(--workspace-form-danger-bg)] text-[var(--workspace-form-danger-text)] dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-100"
                      : "border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] text-[var(--workspace-form-muted)] dark:border-gray-800 dark:bg-gray-950/60 dark:text-gray-300"
              }`}
            >
              {note.text}
            </div>
          ) : null}

          {loadState === "loading" ? (
            <div className="mt-5 rounded-xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] px-4 py-5 text-sm text-[var(--workspace-form-muted)] dark:border-gray-800 dark:bg-gray-950/60 dark:text-gray-300">
              Loading candidate email history...
            </div>
          ) : null}

          {loadState === "ready" && drafts.length > 0 ? (
            <>
              <div className="mt-5 flex flex-wrap gap-3">
                {drafts.map((draft) => (
                  <button
                    key={draft.id}
                    type="button"
                    onClick={() => setActiveDraftId(draft.id)}
                    className={`min-w-[220px] rounded-xl border px-4 py-3 text-left transition ${
                      activeDraft?.id === draft.id
                        ? "border-[var(--workspace-form-accent)] bg-white shadow-[0_12px_24px_rgba(15,23,42,0.08)] dark:bg-gray-900"
                        : "border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] hover:border-[var(--workspace-form-border)] dark:border-gray-800 dark:bg-gray-950/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold capitalize text-[var(--workspace-form-title)] dark:text-white">
                        {draft.kind === "follow_up" ? "Follow-up" : "Rejection"}
                      </p>
                      <DraftStatusBadge status={draft.status} />
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--workspace-form-muted)] dark:text-gray-300">
                      {draft.subject}
                    </p>
                    <p className="mt-2 text-xs text-[var(--workspace-form-muted)] dark:text-gray-400">
                      Updated {formatApplicationDate(draft.updatedAt)}
                    </p>
                  </button>
                ))}
              </div>

              {activeDraft ? (
                <div className="mt-5 min-w-0 rounded-xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-5 dark:border-gray-800 dark:bg-gray-950/60">
                  <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                        Draft editor
                      </p>
                      <h5 className="mt-2 text-lg font-semibold text-[var(--workspace-form-title)] dark:text-white">
                        {activeDraft.kind === "follow_up" ? "Follow-up email draft" : "Rejection email draft"}
                      </h5>
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-2">
                      <MetaTag label={`${formTitle}${formTeam ? ` / ${formTeam}` : ""}`} />
                      <MetaTag label={describeCandidateEmailProvider(activeDraft)} />
                    </div>
                  </div>

                  <div className="mt-5 space-y-4">
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-[var(--workspace-form-title)] dark:text-gray-200">
                        Subject
                      </span>
                      <input
                        value={draftSubject}
                        onChange={(event) => setDraftSubject(event.target.value)}
                        disabled={isActiveDraftSent}
                        className="w-full rounded-xl border border-[var(--workspace-form-border)] bg-white px-4 py-3 text-sm text-[var(--workspace-form-title)] outline-hidden transition placeholder:text-gray-400 focus:border-[var(--workspace-form-accent)] disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                        placeholder="Candidate email subject"
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-[var(--workspace-form-title)] dark:text-gray-200">
                        Email body
                      </span>
                      <textarea
                        value={draftBody}
                        onChange={(event) => setDraftBody(event.target.value)}
                        disabled={isActiveDraftSent}
                        rows={12}
                        className="w-full rounded-xl border border-[var(--workspace-form-border)] bg-white px-4 py-3 text-sm leading-7 text-[var(--workspace-form-title)] outline-hidden transition placeholder:text-gray-400 focus:border-[var(--workspace-form-accent)] disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                        placeholder="Draft body"
                      />
                    </label>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                    <ProfileDetailCard label="Status" value={humanizeCandidateEmailStatus(activeDraft.status)} />
                    <ProfileDetailCard label="Created by" value={activeDraft.requestedByEmail || "-"} />
                    <ProfileDetailCard label="Updated" value={formatApplicationDate(activeDraft.updatedAt)} />
                    <ProfileDetailCard
                      label="Approved by"
                      value={activeDraft.approvedByEmail || (activeDraft.status === "pending_approval" ? "Waiting for approval" : "-")}
                    />
                  </div>

                  {activeDraft.lastError ? (
                    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
                      {activeDraft.lastError}
                    </div>
                  ) : null}

                  <div className="mt-5 flex flex-wrap gap-3">
                    {!isActiveDraftSent ? (
                      <button
                        type="button"
                        onClick={() => void handleDraftAction("save")}
                        disabled={isSaving || isRequestingApproval || isSending || isCancelling}
                        className="inline-flex items-center justify-center rounded-lg border border-[var(--workspace-form-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--workspace-form-title)] transition hover:bg-[var(--workspace-form-page)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-transparent dark:text-white dark:hover:bg-white/5"
                      >
                        {isSaving ? "Saving..." : "Save draft"}
                      </button>
                    ) : null}

                    {!isActiveDraftSent ? (
                      <button
                        type="button"
                        onClick={() => void handleDraftAction("request_approval")}
                        disabled={isSaving || isRequestingApproval || isSending || isCancelling}
                        className="inline-flex items-center justify-center rounded-lg border border-[var(--workspace-form-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--workspace-form-title)] transition hover:bg-[var(--workspace-form-page)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-transparent dark:text-white dark:hover:bg-white/5"
                      >
                        {isRequestingApproval
                          ? "Sending approval..."
                          : sessionRole === "admin"
                            ? "Send approval email"
                            : "Request admin approval"}
                      </button>
                    ) : null}

                    {sessionRole === "admin" && !isActiveDraftSent ? (
                      <button
                        type="button"
                        onClick={() => void handleDraftAction("approve_send")}
                        disabled={isSaving || isRequestingApproval || isSending || isCancelling}
                        className="inline-flex items-center justify-center rounded-lg bg-[var(--workspace-form-accent)] px-4 py-2.5 text-sm font-medium text-[var(--workspace-form-accent-text)] transition hover:bg-[var(--workspace-form-accent-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSending ? "Sending email..." : "Approve and send"}
                      </button>
                    ) : null}

                    {!isActiveDraftSent ? (
                      <button
                        type="button"
                        onClick={() => void handleDraftAction("cancel")}
                        disabled={isSaving || isRequestingApproval || isSending || isCancelling}
                        className="inline-flex items-center justify-center rounded-lg border border-[#f1b7b1] px-4 py-2.5 text-sm font-medium text-[#a50e0e] transition hover:bg-[#fce8e6] disabled:cursor-not-allowed disabled:opacity-60 dark:border-error-500/30 dark:text-error-200 dark:hover:bg-error-500/10"
                      >
                        {isCancelling ? "Cancelling..." : "Cancel draft"}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {loadState === "ready" && drafts.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-[var(--workspace-form-border)] bg-white px-4 py-6 text-sm leading-6 text-[var(--workspace-form-muted)] dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
              No candidate emails have been drafted for this submission yet. Generate a rejection or follow-up draft above to start the approval flow.
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function DraftStatusBadge({ status }: { status: CandidateEmailDraftRecord["status"] }) {
  const tone =
    status === "sent"
      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-100"
      : status === "pending_approval"
        ? "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-100"
        : status === "cancelled"
          ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
          : "bg-[var(--workspace-form-pill-bg)] text-[var(--workspace-form-pill-text)] dark:bg-brand-500/15 dark:text-brand-200";

  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${tone}`}>
      {humanizeCandidateEmailStatus(status)}
    </span>
  );
}

function humanizeCandidateEmailStatus(status: CandidateEmailDraftRecord["status"]) {
  if (status === "pending_approval") {
    return "Pending approval";
  }

  if (status === "sent") {
    return "Sent";
  }

  if (status === "cancelled") {
    return "Cancelled";
  }

  return "Draft";
}

function describeCandidateEmailProvider(draft: CandidateEmailDraftRecord) {
  if (draft.provider === "gemini") {
    return "Drafted with Gemini";
  }

  if (draft.provider === "huggingface") {
    return "Drafted with Hugging Face";
  }

  if (draft.provider === "local") {
    return "Drafted with enhanced local AI";
  }

  return "Drafted in workspace";
}

function ReviewMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] px-4 py-3 dark:border-gray-800 dark:bg-gray-950/60">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium leading-6 text-[var(--workspace-form-title)] [overflow-wrap:anywhere] dark:text-white">
        {value}
      </p>
    </div>
  );
}

function ProfileDetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-[var(--workspace-form-border-soft)] bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
        {label}
      </p>
      <p className="mt-2 text-sm leading-7 text-[var(--workspace-form-title)] [overflow-wrap:anywhere] dark:text-white">
        {value || "-"}
      </p>
    </div>
  );
}

function MetaTag({ label }: { label: string }) {
  return (
    <span
      title={label}
      className="inline-flex max-w-full items-center rounded-full bg-white px-3 py-1 text-xs font-medium text-[var(--workspace-form-pill-text)] shadow-[0_1px_2px_rgba(103,58,183,0.08)] dark:bg-gray-950 dark:text-brand-200 dark:shadow-none"
    >
      <span className="truncate">{label}</span>
    </span>
  );
}

function formatApplicationDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}
