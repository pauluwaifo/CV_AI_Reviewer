"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { ChevronLeftIcon, EyeCloseIcon, EyeIcon } from "@/icons";
import { useWorkspace } from "@/context/WorkspaceContext";
import type { WorkspaceSettings } from "@/lib/workspace-settings";

export default function SignInForm({
  nextPath = "/pipeline",
}: {
  nextPath?: string;
}) {
  const router = useRouter();
  const { replaceSettings } = useWorkspace();
  const [workspaceId, setWorkspaceId] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [showAccessKey, setShowAccessKey] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResetRequest, setShowResetRequest] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetNote, setResetNote] = useState("");
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [isRequestingReset, setIsRequestingReset] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId,
          accessKey,
          keepSignedIn,
          next: normalizeClientNextPath(nextPath),
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
        throw new Error(
          payload?.error || "I couldn't sign you into that workspace."
        );
      }

      if (payload?.settings) {
        replaceSettings(payload.settings);
      }

      router.replace(payload?.nextPath || "/pipeline");
      router.refresh();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "I couldn't sign you into that workspace."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetRequest() {
    if (isRequestingReset) {
      return;
    }

    setIsRequestingReset(true);
    setResetError(null);
    setResetMessage(null);

    try {
      const response = await fetch("/api/auth/access-key-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId,
          contactEmail: resetEmail,
          note: resetNote,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            message?: string;
          }
        | null;

      if (!response.ok) {
        throw new Error(
          payload?.error || "I couldn't submit that reset request."
        );
      }

      setResetMessage(
        payload?.message ||
          "Your request has been sent. The platform owner can now review it."
      );
      setResetNote("");
    } catch (requestError) {
      setResetError(
        requestError instanceof Error
          ? requestError.message
          : "I couldn't submit that reset request."
      );
    } finally {
      setIsRequestingReset(false);
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
                Secure workspace access
              </span>
              <div>
                <h1 className="text-title-sm font-semibold text-gray-800 dark:text-white/90 sm:text-title-md">
                  Sign in to your hiring workspace
                </h1>
                <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                  Use the workspace ID and either the shared admin key for your company or the
                  member invite key issued to you. Candidate records stay locked to that workspace
                  session.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                  Workspace ID
                </span>
                <input
                  value={workspaceId}
                  onChange={(event) => setWorkspaceId(event.target.value)}
                  className={inputClassName}
                  placeholder="northwind-talent"
                  autoComplete="organization"
                  spellCheck={false}
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
                    placeholder="Enter your shared or member access key"
                    autoComplete="current-password"
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
                <button
                  type="button"
                  onClick={() => {
                    setShowResetRequest((current) => !current);
                    setResetMessage(null);
                    setResetError(null);
                  }}
                  className="text-sm font-medium text-brand-500 transition hover:text-brand-600 dark:text-brand-300 dark:hover:text-brand-200"
                >
                  Forgot access key?
                </button>
              </label>

              {showResetRequest ? (
                <div className="rounded-2xl border border-brand-100 bg-brand-50/80 p-4 dark:border-brand-500/20 dark:bg-brand-500/10">
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        Request a reset from the platform owner
                      </p>
                      <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">
                        Enter your workspace ID above, then add the admin email the owner should
                        verify before issuing a new access key.
                      </p>
                    </div>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                        Admin email
                      </span>
                      <input
                        value={resetEmail}
                        onChange={(event) => setResetEmail(event.target.value)}
                        className={inputClassName}
                        placeholder="team@company.com"
                        type="email"
                        autoComplete="email"
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                        Note for owner
                      </span>
                      <textarea
                        value={resetNote}
                        onChange={(event) => setResetNote(event.target.value)}
                        className={`${inputClassName} min-h-24 resize-none`}
                        placeholder="Optional: tell the owner why this needs to be reset."
                        maxLength={600}
                      />
                    </label>
                    {resetError ? (
                      <div className="rounded-2xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-200">
                        {resetError}
                      </div>
                    ) : null}
                    {resetMessage ? (
                      <div className="rounded-2xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-200">
                        {resetMessage}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleResetRequest()}
                      disabled={isRequestingReset}
                      className="inline-flex w-full items-center justify-center rounded-2xl border border-brand-200 bg-white px-4 py-3 text-sm font-semibold text-brand-600 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-100 dark:hover:bg-brand-500/20"
                    >
                      {isRequestingReset ? "Sending request..." : "Send reset request"}
                    </button>
                  </div>
                </div>
              ) : null}

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
                {isSubmitting ? "Signing in..." : "Enter workspace"}
              </button>
            </form>

            <div className="mt-6 rounded-3xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/70">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                What this protects
              </p>
              <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                Screenings, pipeline records, exports, downloads, and workspace settings now
                respect the signed company session instead of trusting a browser-selected
                workspace ID alone.
              </p>
            </div>

            <div className="mt-5">
              <p className="text-sm font-normal text-gray-700 dark:text-gray-400">
                Need a new workspace?{" "}
                <Link
                  href="/signup"
                  className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  Create one
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
    return "/pipeline";
  }

  return value;
}

const inputClassName =
  "w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-hidden transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90 dark:placeholder:text-gray-500";
