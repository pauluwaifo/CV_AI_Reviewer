"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ThemeToggleButton } from "@/components/common/ThemeToggleButton";
import { useSidebar } from "@/context/SidebarContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { buildDefaultWorkspaceControlSettings } from "@/lib/workspace-controls";
import { DEFAULT_WORKSPACE_SETTINGS } from "@/lib/workspace-settings";
import type { WorkspaceSession } from "@/types/workspace-session";

type AppHeaderProps = {
  session: WorkspaceSession | null;
};

export default function AppHeader({ session }: AppHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { settings, replaceControls, replaceSettings } = useWorkspace();
  const { toggleMobileSidebar, toggleSidebar, isExpanded } = useSidebar();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [demoMinutesRemaining, setDemoMinutesRemaining] = useState(() =>
    getDemoMinutesRemaining(session?.expiresAt)
  );
  const isAuthenticated = Boolean(session);
  const isDemoSession = session?.principalType === "demo";
  const pageTitle = getPageTitle(pathname);

  useEffect(() => {
    if (!isDemoSession) {
      setDemoMinutesRemaining(null);
      return;
    }

    const updateRemaining = () => {
      setDemoMinutesRemaining(getDemoMinutesRemaining(session?.expiresAt));
    };

    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 30_000);

    return () => window.clearInterval(intervalId);
  }, [isDemoSession, session?.expiresAt]);

  async function handleSignOut() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } finally {
      replaceSettings(DEFAULT_WORKSPACE_SETTINGS);
      replaceControls(
        buildDefaultWorkspaceControlSettings(DEFAULT_WORKSPACE_SETTINGS.workspaceId)
      );
      router.push("/");
      router.refresh();
      setIsSigningOut(false);
    }
  }

  if (pathname === "/") {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/90">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={toggleMobileSidebar}
              className="grid h-11 w-11 place-items-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 lg:hidden"
              aria-label="Open workspace navigation"
            >
              <MenuIcon />
            </button>
            <button
              type="button"
              onClick={toggleSidebar}
              className="hidden h-11 w-11 place-items-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 lg:grid"
              aria-label={isExpanded ? "Collapse workspace navigation" : "Expand workspace navigation"}
            >
              <MenuIcon />
            </button>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">
                {settings.organizationName}
              </p>
              <h1 className="truncate text-lg font-semibold text-gray-900 dark:text-white sm:text-xl">
                {pageTitle}
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {isAuthenticated ? (
              <>
                <Link
                  href="/upload"
                  className="hidden rounded-full bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 md:inline-flex"
                >
                  New screening
                </Link>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  disabled={isSigningOut}
                  className="hidden rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5 md:inline-flex"
                >
                  {isSigningOut
                    ? isDemoSession
                      ? "Leaving demo..."
                      : "Signing out..."
                    : isDemoSession
                      ? "Leave demo"
                      : "Sign out"}
                </button>
              </>
            ) : (
              <Link
                href="/signin"
                className="hidden rounded-full bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 md:inline-flex"
              >
                Workspace sign in
              </Link>
            )}
            <ThemeToggleButton />
          </div>
        </div>
      </div>
      {isDemoSession ? (
        <div className="border-t border-amber-200/60 bg-amber-50/80 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-2 text-sm text-amber-900 dark:text-amber-100 xl:flex-row xl:items-center xl:justify-between">
            <p>
              One-time demo workspace.
              {demoMinutesRemaining !== null
                ? ` ${demoMinutesRemaining} minute${demoMinutesRemaining === 1 ? "" : "s"} remaining.`
                : " Limited time remaining."}{" "}
              Live email delivery, integrations, and billing checkout stay disabled here.
            </p>
            <p className="font-medium">This trial is limited to this browser.</p>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function getPageTitle(pathname: string) {
  if (pathname.startsWith("/upload")) {
    return "Screen candidate";
  }

  if (pathname.startsWith("/results")) {
    return "Screening results";
  }

  if (pathname.startsWith("/pipeline")) {
    return "Hiring pipeline";
  }

  if (pathname.startsWith("/analytics")) {
    return "Workspace analytics";
  }

  if (pathname.startsWith("/operations")) {
    return "Operations queue";
  }

  if (pathname.startsWith("/audit")) {
    return "Audit log";
  }

  if (pathname.startsWith("/candidate-mail")) {
    return "Candidate mail";
  }

  if (pathname.startsWith("/workspace")) {
    return "Workspace settings";
  }

  if (pathname.startsWith("/billing")) {
    return "Workspace billing";
  }

  return "Workspace dashboard";
}

function MenuIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function getDemoMinutesRemaining(expiresAt: string | undefined) {
  if (!expiresAt) {
    return null;
  }

  const expiresAtTime = new Date(expiresAt).getTime();

  if (Number.isNaN(expiresAtTime)) {
    return null;
  }

  return Math.max(1, Math.ceil((expiresAtTime - Date.now()) / (60 * 1000)));
}
