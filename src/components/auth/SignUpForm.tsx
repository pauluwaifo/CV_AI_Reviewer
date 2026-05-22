"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { ChevronLeftIcon, EyeCloseIcon, EyeIcon } from "@/icons";
import { useWorkspace } from "@/context/WorkspaceContext";
import type { WorkspaceSettings } from "@/lib/workspace-settings";

export default function SignUpForm({
  nextPath = "/workspace",
}: {
  nextPath?: string;
}) {
  const router = useRouter();
  const { replaceSettings } = useWorkspace();
  const [phase, setPhase] = useState<"details" | "verify">("details");
  const [organizationName, setOrganizationName] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [confirmAccessKey, setConfirmAccessKey] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationExpiresInMinutes, setVerificationExpiresInMinutes] = useState<number | null>(
    null
  );
  const [showAccessKey, setShowAccessKey] = useState(false);
  const [showConfirmAccessKey, setShowConfirmAccessKey] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function requestVerificationCode() {
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organizationName,
        workspaceId,
        contactEmail,
        accessKey,
        confirmAccessKey,
        keepSignedIn,
        next: normalizeClientNextPath(nextPath),
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | {
          error?: string;
          challengeId?: string;
          verificationEmail?: string;
          expiresInMinutes?: number;
        }
      | null;

    if (!response.ok || !payload?.challengeId || !payload.verificationEmail) {
      throw new Error(payload?.error || "I couldn't send the verification code.");
    }

    setChallengeId(payload.challengeId);
    setVerificationEmail(payload.verificationEmail);
    setVerificationExpiresInMinutes(payload.expiresInMinutes ?? null);
    setVerificationCode("");
    setPhase("verify");
  }

  async function verifyWorkspaceEmail() {
    const response = await fetch("/api/auth/signup/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        challengeId,
        verificationCode,
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | {
          error?: string;
          nextPath?: string;
          settings?: WorkspaceSettings;
        }
      | null;

    if (!response.ok) {
      throw new Error(payload?.error || "I couldn't verify that workspace email.");
    }

    if (payload?.settings) {
      replaceSettings(payload.settings);
    }

    router.replace(payload?.nextPath || "/workspace");
    router.refresh();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (phase === "details") {
        await requestVerificationCode();
        return;
      }

      await verifyWorkspaceEmail();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : phase === "details"
            ? "I couldn't send the verification code."
            : "I couldn't verify that workspace email."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendCode() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await requestVerificationCode();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "I couldn't send a new verification code."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden px-4 py-4 sm:px-6 lg:w-1/2 lg:px-8">
      <div className="mx-auto w-full max-w-md shrink-0 pb-4 pt-1 sm:pt-6">
        <Link
          href="/"
          className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ChevronLeftIcon />
          Back to homepage
        </Link>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        <div className="mx-auto flex min-h-full w-full max-w-md flex-col py-4">
          <div className="my-auto w-full">
            <div className="mb-6 space-y-3 sm:mb-8">
              <span className="inline-flex rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-200">
                Create a workspace
              </span>
              <div>
                <h1 className="text-title-sm font-semibold text-gray-800 dark:text-white/90 sm:text-title-md">
                  {phase === "details"
                    ? "Set up your company workspace"
                    : "Verify your admin email"}
                </h1>
                <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                  {phase === "details"
                    ? "Create a secure hiring workspace for your team, choose a workspace ID, and set the shared admin access key your company will use to manage the workspace."
                    : `We sent a 6-digit verification code to ${verificationEmail || contactEmail}. Enter it below${verificationExpiresInMinutes ? ` within ${verificationExpiresInMinutes} minutes` : ""} before we create the workspace.`}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {phase === "details" ? (
                <>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      Organization name
                    </span>
                    <input
                      value={organizationName}
                      onChange={(event) => setOrganizationName(event.target.value)}
                      className={inputClassName}
                      placeholder="Northwind Talent"
                      autoComplete="organization"
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      Workspace ID
                    </span>
                    <input
                      value={workspaceId}
                      onChange={(event) => setWorkspaceId(event.target.value)}
                      className={inputClassName}
                      placeholder="northwind-talent"
                      spellCheck={false}
                    />
                    <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                      This becomes the secure identifier for your company workspace.
                    </p>
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      Admin email
                    </span>
                    <input
                      value={contactEmail}
                      onChange={(event) => setContactEmail(event.target.value)}
                      type="email"
                      className={inputClassName}
                      placeholder="team@company.com"
                      autoComplete="email"
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      Access key
                    </span>
                    <div className="relative">
                      <input
                        value={accessKey}
                        onChange={(event) => setAccessKey(event.target.value)}
                        type={showAccessKey ? "text" : "password"}
                        className={`${inputClassName} pr-12`}
                        placeholder="Create a shared admin access key"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAccessKey((current) => !current)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 transition hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        aria-label={showAccessKey ? "Hide access key" : "Show access key"}
                      >
                        {showAccessKey ? (
                          <EyeIcon className="fill-current" />
                        ) : (
                          <EyeCloseIcon className="fill-current" />
                        )}
                      </button>
                    </div>
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      Confirm access key
                    </span>
                    <div className="relative">
                      <input
                        value={confirmAccessKey}
                        onChange={(event) => setConfirmAccessKey(event.target.value)}
                        type={showConfirmAccessKey ? "text" : "password"}
                        className={`${inputClassName} pr-12`}
                        placeholder="Re-enter the access key"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmAccessKey((current) => !current)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 transition hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        aria-label={
                          showConfirmAccessKey
                            ? "Hide access key confirmation"
                            : "Show access key confirmation"
                        }
                      >
                        {showConfirmAccessKey ? (
                          <EyeIcon className="fill-current" />
                        ) : (
                          <EyeCloseIcon className="fill-current" />
                        )}
                      </button>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-white/[0.03]">
                    <input
                      type="checkbox"
                      checked={keepSignedIn}
                      onChange={(event) => setKeepSignedIn(event.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500/20 dark:border-gray-700"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Keep this workspace signed in on this browser
                    </span>
                  </label>
                </>
              ) : (
                <div className="space-y-4">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      Verification code
                    </span>
                    <input
                      value={verificationCode}
                      onChange={(event) =>
                        setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      className={`${inputClassName} text-center text-lg tracking-[0.35em]`}
                      placeholder="123456"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => {
                        setPhase("details");
                        setVerificationCode("");
                        setError(null);
                      }}
                      className="inline-flex items-center justify-center rounded-2xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
                    >
                      Use a different email
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleResendCode()}
                      disabled={isSubmitting}
                      className="inline-flex items-center justify-center rounded-2xl border border-brand-200 px-4 py-3 text-sm font-medium text-brand-600 transition hover:bg-brand-50 dark:border-brand-500/30 dark:text-brand-200 dark:hover:bg-brand-500/10"
                    >
                      {isSubmitting ? "Sending..." : "Send a new code"}
                    </button>
                  </div>
                </div>
              )}

              {error ? (
                <div className="rounded-2xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-200">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-brand-500 px-5 py-3 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300 dark:disabled:bg-brand-500/50"
              >
                {isSubmitting
                  ? phase === "details"
                    ? "Sending code..."
                    : "Verifying email..."
                  : phase === "details"
                    ? "Send verification code"
                    : "Verify and create workspace"}
              </button>
            </form>

            <div className="mt-6 rounded-3xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/70">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                What happens next
              </p>
              <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                {phase === "details"
                  ? "We send a short verification code to the admin email first. Once you confirm it, the workspace is created and you are signed in immediately."
                  : "As soon as the code is verified, the workspace is created and you are signed in automatically."}
              </p>
            </div>

            <div className="mt-5">
              <p className="text-sm font-normal text-gray-700 dark:text-gray-400">
                Already have a workspace?{" "}
                <Link
                  href="/signin"
                  className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function normalizeClientNextPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/workspace";
  }

  return value;
}

const inputClassName =
  "w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-hidden transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90 dark:placeholder:text-gray-500";
