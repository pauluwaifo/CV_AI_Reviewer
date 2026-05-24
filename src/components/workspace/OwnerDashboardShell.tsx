"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

import { ThemeToggleButton } from "@/components/common/ThemeToggleButton";
import type { OwnerSession } from "@/lib/owner-auth";
import {
  CloseIcon,
  DollarLineIcon,
  GridIcon,
  GroupIcon,
  LockIcon,
  PieChartIcon,
  PlusIcon,
} from "@/icons";

const ownerNavItems = [
  {
    name: "Overview",
    description: "Platform summary",
    path: "/owner",
    icon: <GridIcon />,
  },
  {
    name: "Recovery",
    description: "Reset queue",
    path: "/owner/recovery",
    icon: <LockIcon />,
  },
  {
    name: "Workspaces",
    description: "Tenant registry",
    path: "/owner/workspaces",
    icon: <GroupIcon />,
  },
  {
    name: "Insights",
    description: "Health and activity",
    path: "/owner/insights",
    icon: <PieChartIcon />,
  },
  {
    name: "Controls",
    description: "Billing and release",
    path: "/owner/controls",
    icon: <DollarLineIcon />,
  },
] as const;

export default function OwnerDashboardShell({
  children,
  session,
}: {
  children: ReactNode;
  session: OwnerSession;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isDesktopNavOpen, setIsDesktopNavOpen] = useState(true);
  const activeItem =
    ownerNavItems.find((item) =>
      item.path === "/owner" ? pathname === item.path : pathname.startsWith(item.path)
    ) ?? ownerNavItems[0];

  function closeMobileNav() {
    setIsMobileNavOpen(false);
  }

  function closeDesktopNav() {
    setIsDesktopNavOpen(false);
  }

  function toggleDesktopNav() {
    setIsDesktopNavOpen((open) => !open);
  }

  async function handleSignOut() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      await fetch("/api/owner/auth/signout", { method: "POST" });
    } finally {
      router.push("/owner/signin");
      router.refresh();
      setIsSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {isMobileNavOpen ? (
        <button
          type="button"
          aria-label="Close owner navigation"
          onClick={closeMobileNav}
          className="fixed inset-0 z-40 bg-gray-950/55 lg:hidden"
        />
      ) : null}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-dvh w-[290px] flex-col border-r border-gray-200 bg-white px-5 shadow-[18px_0_50px_rgba(15,23,42,0.04)] transition-transform duration-300 ease-in-out dark:border-gray-800 dark:bg-gray-950 ${
          isMobileNavOpen ? "translate-x-0" : "-translate-x-full"
        } ${isDesktopNavOpen ? "lg:translate-x-0" : "lg:-translate-x-full"}`}
      >
        <div className="border-b border-gray-100 py-6 dark:border-gray-800">
          <div className="flex items-start justify-between gap-3">
            <Link
              href="/owner"
              onClick={closeMobileNav}
              className="flex min-w-0 items-center gap-3 rounded-lg transition hover:opacity-90"
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-500 text-sm font-semibold text-white shadow-theme-sm">
                OS
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Owner Control
                </p>
                <p className="truncate text-theme-xs text-gray-500 dark:text-gray-400">
                  {session.email}
                </p>
              </div>
            </Link>

            <button
              type="button"
              onClick={() => {
                if (isMobileNavOpen) {
                  closeMobileNav();
                } else {
                  closeDesktopNav();
                }
              }}
              className="grid h-10 w-10 place-items-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/5"
              aria-label="Close owner sidebar"
            >
              <CloseIcon className="h-5 w-5 fill-current" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col py-6">
          <div className="mb-6">
            <p className="mb-4 text-xs uppercase tracking-[0.18em] text-gray-400">Navigation</p>
            <nav className="space-y-2">
              {ownerNavItems.map((item) => {
                const isActive =
                  item.path === "/owner"
                    ? pathname === item.path
                    : pathname.startsWith(item.path);

                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    onClick={closeMobileNav}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition ${
                      isActive
                        ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-200"
                        : "border-transparent text-gray-600 hover:border-gray-200 hover:bg-gray-50 dark:text-gray-300 dark:hover:border-gray-800 dark:hover:bg-white/[0.03]"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                        isActive
                          ? "bg-brand-500 text-white"
                          : "bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-400"
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{item.name}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        {item.description}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="mt-auto rounded-2xl border border-brand-100 bg-brand-50 p-4 dark:border-brand-500/20 dark:bg-brand-500/10">
            <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">
              Owner-only controls
            </p>
            <p className="mt-2 text-xs leading-5 text-brand-700 dark:text-brand-200">
              Reset any company key, review platform health, and manage workspace lifecycle from one place.
            </p>
            <Link
              href="/signup"
              onClick={closeMobileNav}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
            >
              <PlusIcon className="size-4" />
              Create workspace
            </Link>
          </div>
        </div>
      </aside>

      <div
        className={`transition-[padding] duration-300 ${
          isDesktopNavOpen ? "lg:pl-[290px]" : "lg:pl-0"
        }`}
      >
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/85">
          <div className="px-4 py-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <button
                  type="button"
                  onClick={() => setIsMobileNavOpen(true)}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 lg:hidden"
                  aria-label="Open owner navigation"
                >
                  <MenuIcon />
                </button>
                <button
                  type="button"
                  onClick={toggleDesktopNav}
                  className="hidden h-11 w-11 shrink-0 place-items-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 lg:grid"
                  aria-label={isDesktopNavOpen ? "Hide owner navigation" : "Show owner navigation"}
                >
                  <MenuIcon />
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                    Owner Workspace
                  </p>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
                    {activeItem.name}
                  </h1>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    {activeItem.description}
                  </p>
                </div>
              </div>

              <div className="flex w-full flex-wrap items-center justify-start gap-2 xl:ml-auto xl:w-auto xl:justify-end">
                <Link
                  href="/workspace"
                  className="inline-flex min-w-[180px] items-center justify-center rounded-xl border border-gray-300 px-4 py-2.5 text-center text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
                >
                  Open admin workspace
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex min-w-[180px] items-center justify-center rounded-xl bg-brand-500 px-4 py-2.5 text-center text-sm font-medium text-white transition hover:bg-brand-600"
                >
                  Create workspace
                </Link>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  disabled={isSigningOut}
                  className="inline-flex min-w-[132px] items-center justify-center rounded-xl border border-gray-300 px-4 py-2.5 text-center text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
                >
                  {isSigningOut ? "Signing out..." : "Sign out"}
                </button>
                <div className="flex items-center justify-center">
                  <ThemeToggleButton />
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 pb-12 pt-5 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">{children}</main>
      </div>
    </div>
  );
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
