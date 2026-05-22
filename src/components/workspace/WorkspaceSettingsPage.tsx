"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  buildDefaultWorkspaceSettings,
  buildPublicFormTheme,
  type WorkspaceSettings,
} from "@/lib/workspace-settings";
import { useWorkspace } from "@/context/WorkspaceContext";

type WorkspaceMember = {
  id: string;
  workspaceId: string;
  email: string;
  role: "admin" | "member";
  status: "invited" | "active" | "revoked";
  invitedAt: string;
  acceptedAt: string | null;
  updatedAt: string;
};

export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const { settings, replaceSettings } = useWorkspace();
  const [draft, setDraft] = useState(settings);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteAccessKey, setInviteAccessKey] = useState("");
  const [newWorkspaceAccessKey, setNewWorkspaceAccessKey] = useState("");
  const [resetAccessKey, setResetAccessKey] = useState("");
  const [deleteWorkspaceConfirmation, setDeleteWorkspaceConfirmation] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [isResettingKey, setIsResettingKey] = useState(false);
  const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const formTheme = buildPublicFormTheme(draft.formAccent);
  const activeMembers = members.filter((member) => member.status === "active").length;
  const pendingMembers = members.filter((member) => member.status === "invited").length;
  const adminMembers = members.filter((member) => member.role === "admin").length;
  const brandingReadinessCount = [
    draft.tagline.trim(),
    draft.logoDataUrl,
    draft.formHeaderImageDataUrl,
  ].filter(Boolean).length;
  const workspaceProductName = draft.appName.trim() || "your hiring workspace";
  const workspaceOrganizationName = draft.organizationName.trim() || "your company";

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    let isCurrent = true;

    async function loadMembers() {
      try {
        const response = await fetch("/api/workspace/members", {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | { members?: WorkspaceMember[] }
          | null;

        if (isCurrent && response.ok) {
          setMembers(payload?.members ?? []);
        }
      } catch {
        if (isCurrent) {
          setMembers([]);
        }
      }
    }

    void loadMembers();

    return () => {
      isCurrent = false;
    };
  }, [settings.workspaceId]);

  async function handleSave() {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/workspace", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draft),
      });
      const payload = (await response.json().catch(() => null)) as
        | { settings?: WorkspaceSettings; error?: string }
        | null;

      if (!response.ok || !payload?.settings) {
        throw new Error(payload?.error || "I couldn't save those workspace settings.");
      }

      replaceSettings(payload.settings);
      setDraft(payload.settings);
      setFeedback({
        tone: "success",
        message: "Workspace settings saved securely for this company.",
      });
    } catch (saveError) {
      setFeedback({
        tone: "error",
        message:
          saveError instanceof Error
            ? saveError.message
            : "I couldn't save those workspace settings.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  function handleReset() {
    setDraft(buildDefaultWorkspaceSettings(settings.workspaceId));
    setFeedback(null);
  }

  async function handleLogoUpload(file: File | null) {
    await handleImageUpload({
      file,
      maxSize: 180_000,
      fieldName: "logoDataUrl",
      successMessage: "Logo added to the draft. Save workspace settings to persist it.",
      sizeErrorMessage: "Use a logo under 180 KB so workspace settings stay fast.",
    });
  }

  async function handleFormHeaderImageUpload(file: File | null) {
    await handleImageUpload({
      file,
      maxSize: 600_000,
      fieldName: "formHeaderImageDataUrl",
      successMessage: "Form header image added. Save workspace settings to publish it.",
      sizeErrorMessage: "Use a form header image under 600 KB so the public form loads fast.",
    });
  }

  async function handleImageUpload({
    file,
    maxSize,
    fieldName,
    successMessage,
    sizeErrorMessage,
  }: {
    file: File | null;
    maxSize: number;
    fieldName: "logoDataUrl" | "formHeaderImageDataUrl";
    successMessage: string;
    sizeErrorMessage: string;
  }) {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setFeedback({
        tone: "error",
        message: "Upload an image logo file.",
      });
      return;
    }

    if (file.size > maxSize) {
      setFeedback({
        tone: "error",
        message: sizeErrorMessage,
      });
      return;
    }

    const imageDataUrl = await readFileAsDataUrl(file);

    setDraft((current) => ({ ...current, [fieldName]: imageDataUrl }));
    setFeedback({
      tone: "success",
      message: successMessage,
    });
  }

  async function handleInviteMember() {
    if (isInviting) {
      return;
    }

    setIsInviting(true);
    setInviteAccessKey("");
    setFeedback(null);

    try {
      const response = await fetch("/api/workspace/members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            member?: WorkspaceMember;
            accessKey?: string;
            error?: string;
            mailDelivery?: { status: "sent" | "skipped"; reason?: string };
          }
        | null;

      if (!response.ok || !payload?.member || !payload.accessKey) {
        throw new Error(payload?.error || "I couldn't invite that member.");
      }

      setMembers((current) => [
        payload.member as WorkspaceMember,
        ...current.filter((item) => item.id !== payload.member?.id),
      ]);
      setInviteEmail("");
      setInviteRole("member");
      setInviteAccessKey(payload.accessKey);
      const emailMessage =
        payload.mailDelivery?.status === "sent"
          ? " Invitation email sent."
          : " Email is not configured yet, so share the generated key manually.";
      setFeedback({
        tone: "success",
        message: `Member invite created.${emailMessage}`,
      });
    } catch (inviteError) {
      setFeedback({
        tone: "error",
        message:
          inviteError instanceof Error
            ? inviteError.message
            : "I couldn't invite that member.",
      });
    } finally {
      setIsInviting(false);
    }
  }

  async function handleMemberStatus(memberId: string, status: "active" | "revoked") {
    if (updatingMemberId) {
      return;
    }

    setUpdatingMemberId(memberId);
    setFeedback(null);

    try {
      const response = await fetch("/api/workspace/members", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ memberId, status }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { member?: WorkspaceMember; error?: string }
        | null;

      if (!response.ok || !payload?.member) {
        throw new Error(payload?.error || "I couldn't update that member.");
      }

      setMembers((current) =>
        current.map((item) => (item.id === payload.member?.id ? payload.member : item))
      );
      setFeedback({
        tone: "success",
        message:
          status === "revoked"
            ? "Member access revoked."
            : "Member access restored.",
      });
    } catch (memberError) {
      setFeedback({
        tone: "error",
        message:
          memberError instanceof Error
            ? memberError.message
            : "I couldn't update that member.",
      });
    } finally {
      setUpdatingMemberId("");
    }
  }

  async function handleResetWorkspaceAccessKey() {
    if (isResettingKey) {
      return;
    }

    const accessKey = newWorkspaceAccessKey.trim();

    if (!accessKey) {
      setFeedback({
        tone: "error",
        message: "Enter the new shared access key first, or use Generate automatically.",
      });
      return;
    }

    setIsResettingKey(true);
    setResetAccessKey("");
    setFeedback(null);

    try {
      const response = await fetch("/api/workspace/security", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "reset-workspace-access-key",
          accessKey,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { accessKey?: string; error?: string }
        | null;

      if (!response.ok || !payload?.accessKey) {
        throw new Error(payload?.error || "I couldn't reset that access key.");
      }

      setResetAccessKey(payload.accessKey);
      setNewWorkspaceAccessKey(payload.accessKey);
      setFeedback({
        tone: "success",
        message: "Workspace access key updated. Save the new key now because it will only be shown once.",
      });
    } catch (resetError) {
      setFeedback({
        tone: "error",
        message:
          resetError instanceof Error
            ? resetError.message
            : "I couldn't reset that access key.",
      });
    } finally {
      setIsResettingKey(false);
    }
  }

  function handleGenerateWorkspaceAccessKey() {
    const suggestedAccessKey = createSuggestedWorkspaceAccessKey();
    setNewWorkspaceAccessKey(suggestedAccessKey);
    setResetAccessKey("");
    setFeedback({
      tone: "success",
      message: "Suggested shared access key generated. Review it, then save it for this workspace.",
    });
  }

  async function handleDeleteWorkspace() {
    if (isDeletingWorkspace) {
      return;
    }

    const confirmWorkspaceId = deleteWorkspaceConfirmation.trim();

    if (confirmWorkspaceId !== draft.workspaceId) {
      setFeedback({
        tone: "error",
        message: "Type the exact workspace ID before deleting this workspace.",
      });
      return;
    }

    setIsDeletingWorkspace(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/workspace", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmWorkspaceId }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "I couldn't delete that workspace.");
      }

      await fetch("/api/auth/signout", { method: "POST" }).catch(() => undefined);
      router.replace("/signup");
      router.refresh();
    } catch (deleteError) {
      setFeedback({
        tone: "error",
        message:
          deleteError instanceof Error
            ? deleteError.message
            : "I couldn't delete that workspace.",
      });
    } finally {
      setIsDeletingWorkspace(false);
    }
  }

  return (
    <div className="w-full space-y-6 py-6 sm:py-8 md:py-10">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="h-2.5 bg-brand-500" />
        <div className="grid gap-6 p-6 2xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700 dark:text-brand-300">
              Workspace setup
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
              Shape {workspaceProductName} for {workspaceOrganizationName}
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-gray-600 dark:text-gray-300">
              Customize the name, logo, and candidate-facing form so every applicant sees a
              branded hiring experience that feels built for {workspaceOrganizationName}. These
              settings also keep local candidate history and pipeline views scoped to this
              workspace.
            </p>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/70">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Current workspace
              </p>
              <div className="mt-4 space-y-3 text-sm text-gray-600 dark:text-gray-300">
                <PreviewRow label="App" value={draft.appName} />
                <PreviewRow label="Organization" value={draft.organizationName} />
                <PreviewRow label="Workspace ID" value={draft.workspaceId} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <WorkspaceMetricCard
                label="Active members"
                value={String(activeMembers)}
                caption={`${members.length} total`}
              />
              <WorkspaceMetricCard
                label="Pending invites"
                value={String(pendingMembers)}
                caption="Awaiting access"
              />
              <WorkspaceMetricCard
                label="Admin seats"
                value={String(adminMembers)}
                caption="Privileged access"
              />
              <WorkspaceMetricCard
                label="Branding ready"
                value={`${brandingReadinessCount}/3`}
                caption="Tagline, logo, header"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <article className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                Identity
              </p>
              <h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">
                Workspace details
              </h2>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
            >
              Reset defaults
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Product name" help="Shown in the header and landing page.">
              <input
                value={draft.appName}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, appName: event.target.value }))
                }
                className={inputClassName}
                placeholder="Hiring Workspace OS"
              />
            </Field>

            <Field label="Organization name" help="Shown as the active company workspace.">
              <input
                value={draft.organizationName}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    organizationName: event.target.value,
                  }))
                }
                className={inputClassName}
                placeholder="Northwind Talent"
              />
            </Field>
          </div>

          <Field
            label="Workspace tagline"
            help="Used on the landing page and workspace preview panels."
          >
            <textarea
              value={draft.tagline}
              onChange={(event) =>
                setDraft((current) => ({ ...current, tagline: event.target.value }))
              }
              className={`${inputClassName} min-h-24`}
              placeholder="Secure multi-workspace recruiting, screening, and public hiring intake."
            />
          </Field>

          <Field
            label="Workspace ID"
            help="This is the protected tenant boundary for the signed-in company, so it is provisioned at access setup time and not editable here."
          >
            <input
              value={draft.workspaceId}
              readOnly
              className={`${inputClassName} cursor-not-allowed bg-gray-50 text-gray-500 dark:bg-gray-900`}
            />
          </Field>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/70">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <LogoPreview settings={draft} />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Workspace logo
                </p>
                <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                  Upload a small PNG, JPG, WEBP, GIF, or SVG logo. It appears in the workspace
                  header and company preview.
                </p>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600">
                    Upload logo
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                      className="sr-only"
                      onChange={(event) => {
                        void handleLogoUpload(event.target.files?.[0] ?? null);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {draft.logoDataUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((current) => ({ ...current, logoDataUrl: "" }))
                      }
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-white dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
                    >
                      Remove logo
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </article>

        <article className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
              Public form design
            </p>
            <h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">
              Form color and header image
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              Keep the dashboard blue, but make the candidate-facing form match each company with
              a custom accent color and a Google Forms-style header image.
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/70">
            <Field
              label="Public form accent color"
              help="Controls form titles, buttons, tags, borders, and page tint."
            >
              <div className="flex gap-3">
                <input
                  type="color"
                  value={getColorInputValue(draft.formAccent)}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, formAccent: event.target.value }))
                  }
                  className="h-12 w-16 shrink-0 cursor-pointer rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-950"
                  aria-label="Public form accent color"
                />
                <input
                  value={draft.formAccent}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, formAccent: event.target.value }))
                  }
                  className={inputClassName}
                  placeholder="#0f766e"
                />
              </div>
            </Field>
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/70">
            {draft.formHeaderImageDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={draft.formHeaderImageDataUrl}
                alt="Public form header preview"
                className="h-36 w-full object-cover"
              />
            ) : (
              <div
                className="h-36 w-full"
                style={{
                  background: `linear-gradient(135deg, ${formTheme.accent}, ${formTheme.accentSoft})`,
                }}
              />
            )}
            <div className="space-y-3 p-4">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Public form header image
              </p>
              <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                Upload a wide banner image for the top of published application forms. A 1600 x 400
                image works well.
              </p>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex cursor-pointer rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600">
                  Upload header image
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    className="sr-only"
                    onChange={(event) => {
                      void handleFormHeaderImageUpload(event.target.files?.[0] ?? null);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                {draft.formHeaderImageDataUrl ? (
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({ ...current, formHeaderImageDataUrl: "" }))
                    }
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-white dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
                  >
                    Remove image
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <article className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
              Members
            </p>
            <h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">
              Invite workspace members
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              Generate a member-specific access key instead of sharing the company-wide key.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_150px]">
            <input
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              className={inputClassName}
              placeholder="member@company.com"
              type="email"
            />
            <select
              value={inviteRole}
              onChange={(event) =>
                setInviteRole(event.target.value === "admin" ? "admin" : "member")
              }
              className={inputClassName}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => void handleInviteMember()}
            disabled={isInviting}
            className="inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-5 py-3 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300 sm:w-auto"
          >
            {isInviting ? "Creating invite..." : "Invite member"}
          </button>

          {inviteAccessKey ? (
            <OneTimeSecretCard
              title="Member access key"
              value={inviteAccessKey}
              note={`Share this with the invited member. They sign in with workspace ID "${draft.workspaceId}" and this key.`}
            />
          ) : null}

          <div className="space-y-3">
            {members.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                No invited members yet.
              </p>
            ) : (
              members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  isUpdating={updatingMemberId === member.id}
                  onStatusChange={handleMemberStatus}
                />
              ))
            )}
          </div>
        </article>

        <article className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
              Security
            </p>
            <h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">
              Workspace access controls
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              Reset the company-wide workspace key if it was shared too broadly. Member-specific
              keys stay separate and can be revoked individually.
            </p>
          </div>

          <div className="rounded-lg border border-error-200 bg-error-50 p-5 dark:border-error-500/20 dark:bg-error-500/10">
            <p className="text-sm font-semibold text-error-700 dark:text-error-200">
              Set a new shared workspace key
            </p>
            <p className="mt-2 text-sm leading-6 text-error-700/80 dark:text-error-100">
              Enter the next shared key yourself when you want a controlled reset. Anyone using the
              old shared key will need the new one.
            </p>
            <div className="mt-4 space-y-3">
              <Field
                label="New shared access key"
                help="Use at least 8 characters. This is the company-wide sign-in key for shared access."
              >
                <input
                  value={newWorkspaceAccessKey}
                  onChange={(event) => setNewWorkspaceAccessKey(event.target.value)}
                  className="w-full rounded-lg border border-error-200 bg-white px-4 py-3 text-sm text-gray-800 outline-hidden transition placeholder:text-gray-400 focus:border-error-300 focus:ring-4 focus:ring-error-500/10 dark:border-error-500/30 dark:bg-gray-950 dark:text-white/90 dark:placeholder:text-gray-500"
                  placeholder="Enter the new shared access key"
                />
              </Field>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void handleResetWorkspaceAccessKey()}
                  disabled={isResettingKey || !newWorkspaceAccessKey.trim()}
                  className="inline-flex items-center justify-center rounded-lg bg-error-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-error-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isResettingKey ? "Saving new key..." : "Set new shared key"}
                </button>
                <button
                  type="button"
                  onClick={handleGenerateWorkspaceAccessKey}
                  disabled={isResettingKey}
                  className="inline-flex items-center justify-center rounded-lg border border-error-300 px-4 py-2 text-sm font-medium text-error-700 transition hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-error-500/30 dark:text-error-200 dark:hover:bg-error-500/10"
                >
                  Generate automatically
                </button>
              </div>
            </div>
          </div>

          {resetAccessKey ? (
            <OneTimeSecretCard
              title="New workspace access key"
              value={resetAccessKey}
              note="Save this now. For safety, it will not be shown again after you leave this page."
            />
          ) : null}

          <div className="rounded-lg border border-error-200 bg-error-50 p-5 dark:border-error-500/20 dark:bg-error-500/10">
            <p className="text-sm font-semibold text-error-700 dark:text-error-200">
              Delete this workspace
            </p>
            <p className="mt-2 text-sm leading-6 text-error-700/80 dark:text-error-100">
              This permanently removes this company workspace, including forms, applications,
              uploaded files, member access, and workspace sessions.
            </p>
            <div className="mt-4 space-y-3">
              <Field
                label="Confirm workspace ID"
                help={`Type ${draft.workspaceId} exactly before deleting this workspace.`}
              >
                <input
                  value={deleteWorkspaceConfirmation}
                  onChange={(event) => setDeleteWorkspaceConfirmation(event.target.value)}
                  className="w-full rounded-lg border border-error-200 bg-white px-4 py-3 text-sm text-gray-800 outline-hidden transition placeholder:text-gray-400 focus:border-error-300 focus:ring-4 focus:ring-error-500/10 dark:border-error-500/30 dark:bg-gray-950 dark:text-white/90 dark:placeholder:text-gray-500"
                  placeholder={draft.workspaceId}
                />
              </Field>
              <button
                type="button"
                onClick={() => void handleDeleteWorkspace()}
                disabled={
                  isDeletingWorkspace ||
                  deleteWorkspaceConfirmation.trim() !== draft.workspaceId
                }
                className="inline-flex items-center justify-center rounded-lg bg-error-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-error-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isDeletingWorkspace ? "Deleting workspace..." : "Delete workspace"}
              </button>
            </div>
          </div>
        </article>
      </section>

      {feedback ? (
        <div
          className={`rounded-lg px-5 py-4 text-sm ${
            feedback.tone === "success"
              ? "border border-success-200 bg-success-50 text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-200"
              : "border border-error-200 bg-error-50 text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-200"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <section>
        <PreviewCard
          eyebrow="Public form preview"
          title={`${draft.organizationName} application form`}
          body="Applicants see this palette on the published intake form, including titles, tags, and action buttons."
          headerImageDataUrl={draft.formHeaderImageDataUrl}
          accent={formTheme.accent}
          accentSoft={formTheme.accentSoft}
          accentHover={formTheme.accentHover}
          accentText={formTheme.accentText}
          titleColor={formTheme.title}
          bodyColor={formTheme.body}
          borderColor={formTheme.border}
          surfaceColor={formTheme.surface}
          shadow={formTheme.shadowMd}
          organization={draft.organizationName}
        />
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Save workspace settings
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Save this company&apos;s workspace details and public form setup to the server.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-3 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300 dark:disabled:bg-brand-500/50"
        >
          {isSaving ? "Saving..." : "Save workspace settings"}
        </button>
      </section>

    </div>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{label}</span>
      <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">{help}</p>
      {children}
    </label>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="truncate font-medium text-gray-900 dark:text-white">{value}</span>
    </div>
  );
}

function WorkspaceMetricCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-950/70">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{caption}</p>
    </div>
  );
}

function LogoPreview({ settings }: { settings: WorkspaceSettings }) {
  return (
    <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-gray-200 bg-white text-lg font-semibold text-brand-700 shadow-theme-xs dark:border-gray-700 dark:bg-gray-950 dark:text-brand-200">
      {settings.logoDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={settings.logoDataUrl}
          alt={`${settings.organizationName} logo`}
          className="h-full w-full object-contain p-2"
        />
      ) : (
        getInitials(settings.organizationName)
      )}
    </div>
  );
}

function MemberRow({
  member,
  isUpdating,
  onStatusChange,
}: {
  member: WorkspaceMember;
  isUpdating: boolean;
  onStatusChange: (memberId: string, status: "active" | "revoked") => Promise<void>;
}) {
  const isRevoked = member.status === "revoked";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-800 dark:bg-gray-900/70 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
          {member.email}
        </p>
        <p className="mt-1 text-xs capitalize text-gray-500 dark:text-gray-400">
          {member.role} / {member.status} / Invited {formatDate(member.invitedAt)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void onStatusChange(member.id, isRevoked ? "active" : "revoked")}
        disabled={isUpdating}
        className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-70 ${
          isRevoked
            ? "bg-brand-500 text-white hover:bg-brand-600"
            : "border border-error-200 text-error-700 hover:bg-error-50 dark:border-error-500/30 dark:text-error-200 dark:hover:bg-error-500/10"
        }`}
      >
        {isUpdating ? "Updating..." : isRevoked ? "Restore" : "Revoke"}
      </button>
    </div>
  );
}

function OneTimeSecretCard({
  title,
  value,
  note,
}: {
  title: string;
  value: string;
  note: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50 p-4 dark:border-brand-500/20 dark:bg-brand-500/10">
      <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">{title}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <code className="min-w-0 flex-1 break-all rounded-lg border border-brand-200 bg-white px-4 py-3 text-sm text-brand-900 dark:border-brand-500/20 dark:bg-gray-950 dark:text-brand-100">
          {value}
        </code>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-3 text-xs leading-5 text-brand-800 dark:text-brand-100/80">
        {note}
      </p>
    </div>
  );
}

function PreviewCard({
  eyebrow,
  title,
  body,
  headerImageDataUrl,
  accent,
  accentSoft,
  accentHover,
  accentText,
  titleColor,
  bodyColor,
  borderColor,
  surfaceColor,
  shadow,
  organization,
}: {
  eyebrow: string;
  title: string;
  body: string;
  headerImageDataUrl?: string;
  accent: string;
  accentSoft: string;
  accentHover: string;
  accentText: string;
  titleColor: string;
  bodyColor: string;
  borderColor: string;
  surfaceColor: string;
  shadow: string;
  organization: string;
}) {
  const previewStyle = {
    "--preview-accent": accent,
    "--preview-accent-soft": accentSoft,
    "--preview-accent-hover": accentHover,
    "--preview-accent-text": accentText,
    "--preview-title": titleColor,
    "--preview-body": bodyColor,
    "--preview-border": borderColor,
    "--preview-surface": surfaceColor,
    boxShadow: shadow,
  } as CSSProperties;

  return (
    <article
      className="overflow-hidden rounded-xl border border-[var(--preview-border)] bg-white dark:border-white/10 dark:bg-gray-950/80"
      style={previewStyle}
    >
      {headerImageDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={headerImageDataUrl}
          alt=""
          className="h-32 w-full object-cover"
        />
      ) : null}
      <div className="h-2.5 bg-[var(--preview-accent)]" />
      <div className="space-y-4 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--preview-accent)] dark:text-blue-200">
          {eyebrow}
        </p>
        <div className="space-y-3">
          <h3 className="text-2xl font-semibold text-[var(--preview-title)] dark:text-white">
            {title}
          </h3>
          <p className="text-sm leading-7 text-[var(--preview-body)] dark:text-gray-300">
            {body}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span
            className="rounded-full bg-[var(--preview-accent-soft)] px-3 py-1 text-xs font-medium text-[var(--preview-accent-hover)] dark:bg-white/10 dark:text-blue-100"
          >
            {organization}
          </span>
          <span
            className="rounded-full bg-[var(--preview-surface)] px-3 py-1 text-xs font-medium text-[var(--preview-body)] dark:bg-white/10 dark:text-gray-300"
          >
            Workspace-ready
          </span>
        </div>
        <div
          className="rounded-lg border border-[var(--preview-border)] bg-[var(--preview-surface)] px-4 py-4 dark:border-white/10 dark:bg-white/[0.04]"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[var(--preview-title)] dark:text-white">
                Form accent preview
              </p>
              <p className="mt-1 text-xs text-[var(--preview-body)] dark:text-gray-400">
                Buttons, tags, and form titles use this color.
              </p>
            </div>
            <button
              type="button"
              className="rounded-full bg-[var(--preview-accent)] px-4 py-2 text-sm font-medium text-[var(--preview-accent-text)] shadow-theme-sm transition hover:bg-[var(--preview-accent-hover)]"
            >
              Primary action
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

const inputClassName =
  "w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-hidden transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90 dark:placeholder:text-gray-500";

function createSuggestedWorkspaceAccessKey() {
  if (typeof globalThis.crypto !== "undefined") {
    const bytes = new Uint8Array(8);
    globalThis.crypto.getRandomValues(bytes);
    return `workspace_${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
  }

  return `workspace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => reject(new Error("I couldn't read that logo file."));
    reader.readAsDataURL(file);
  });
}

function getInitials(value: string) {
  const parts = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return (parts[0]?.[0] ?? "W").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(value));
}

function getColorInputValue(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#0f766e";
}
