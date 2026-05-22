"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { ThemeToggleButton } from "@/components/common/ThemeToggleButton";
import { useSidebar } from "@/context/SidebarContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { DEFAULT_WORKSPACE_SETTINGS } from "@/lib/workspace-settings";

type AppHeaderProps = {
  session: {
    workspaceId: string;
    expiresAt: string;
    issuedAt: string;
    role: "admin" | "member";
    principalType: "shared" | "member";
    email: string;
    memberId: string | null;
  } | null;
};

export default function AppHeader({ session }: AppHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { settings, replaceSettings } = useWorkspace();
  const { toggleMobileSidebar, toggleSidebar, isExpanded } = useSidebar();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const isAuthenticated = Boolean(session);
  const pageTitle = getPageTitle(pathname);

  async function handleSignOut() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } finally {
      replaceSettings(DEFAULT_WORKSPACE_SETTINGS);
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
                  {isSigningOut ? "Signing out..." : "Sign out"}
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

  if (pathname.startsWith("/workspace")) {
    return "Workspace settings";
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
