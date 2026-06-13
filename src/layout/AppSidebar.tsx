"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useWorkspace } from "@/context/WorkspaceContext";
import { isWorkspaceModuleAccessible } from "@/lib/workspace-controls";
import type { WorkspaceSession } from "@/types/workspace-session";
import { useSidebar } from "../context/SidebarContext";
import {
  BoltIcon,
  BellIcon,
  BoxCubeIcon,
  DollarLineIcon,
  DocsIcon,
  HorizontaLDots,
  ListIcon,
  MailIcon,
  PieChartIcon,
  ShootingStarIcon,
  TaskIcon,
} from "../icons";

export default function AppSidebar({
  session,
}: {
  session: Pick<WorkspaceSession, "principalType" | "role"> | null;
}) {
  const { controls, settings } = useWorkspace();
  const pathname = usePathname();
  const {
    isExpanded,
    isMobileOpen,
    toggleMobileSidebar,
  } = useSidebar();

  const navItems = [
    {
      name: "Screen CV",
      path: "/upload",
      icon: <DocsIcon />,
      visible: isWorkspaceModuleAccessible(controls, "screen_cv"),
    },
    {
      name: "Results",
      path: "/results",
      icon: <TaskIcon />,
      visible: isWorkspaceModuleAccessible(controls, "results"),
    },
    {
      name: "Personality",
      path: "/personality",
      icon: <ShootingStarIcon />,
      visible: isWorkspaceModuleAccessible(controls, "personality_assessment"),
    },
    ...(session?.role === "admin"
      ? [
          {
            name: "PPAP Dashboard",
            path: "/ppap-dashboard",
            icon: <ShootingStarIcon />,
            visible: true,
          },
        ]
      : []),
    {
      name: "Analytics",
      path: "/analytics",
      icon: <PieChartIcon />,
      visible: isWorkspaceModuleAccessible(controls, "analytics"),
    },
    {
      name: "Operations",
      path: "/operations",
      icon: <BellIcon />,
      visible: isWorkspaceModuleAccessible(controls, "operations"),
    },
    {
      name: "Audit Log",
      path: "/audit",
      icon: <ListIcon />,
      visible: isWorkspaceModuleAccessible(controls, "audit_log"),
    },
    {
      name: "Hiring Pipeline",
      path: "/pipeline",
      icon: <BoltIcon />,
      visible: isWorkspaceModuleAccessible(controls, "pipeline"),
    },
    {
      name: "Candidate Mail",
      path: "/candidate-mail",
      icon: <MailIcon />,
      visible: isWorkspaceModuleAccessible(controls, "candidate_mail"),
    },
    ...(session?.role === "admin"
      ? [
          {
            name: "Workspace Settings",
            path: "/workspace",
            icon: <BoxCubeIcon />,
            visible: isWorkspaceModuleAccessible(controls, "workspace_settings"),
          },
          {
            name: "Billing",
            path: "/billing",
            icon: <DollarLineIcon />,
            visible: true,
          },
        ]
      : []),
  ].filter((item) => item.visible);
  const showFull = isExpanded || isMobileOpen;

  return (
    <aside
      className={`fixed left-0 top-0 z-50 flex h-dvh flex-col border-r border-gray-200 bg-white px-5 text-gray-900 shadow-[18px_0_50px_rgba(15,23,42,0.04)] transition-all duration-300 ease-in-out dark:border-gray-800 dark:bg-gray-950 ${
        showFull ? "w-[290px]" : "w-[90px]"
      } ${isMobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
    >
      <div
        className={`border-b border-gray-100 py-6 dark:border-gray-800 ${
          showFull ? "flex justify-start" : "flex justify-center"
        }`}
      >
        <Link
          href="/pipeline"
          className="flex items-center gap-3 rounded-lg transition hover:opacity-90"
        >
          <div
            className={`grid h-10 w-10 place-items-center overflow-hidden rounded-lg text-sm font-semibold shadow-theme-sm ${
              settings.logoDataUrl
                ? "bg-transparent text-gray-900 dark:text-white"
                : "bg-brand-500 text-white"
            }`}
          >
            {settings.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.logoDataUrl}
                alt={`${settings.organizationName} logo`}
                className="h-full w-full object-contain"
              />
            ) : (
              settings.organizationName.slice(0, 1).toUpperCase()
            )}
          </div>
          {showFull ? (
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {settings.appName}
              </p>
              <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                {settings.organizationName}
              </p>
            </div>
          ) : null}
        </Link>
      </div>

      <div className="no-scrollbar flex flex-1 flex-col overflow-y-auto py-6">
        <nav className="mb-6 flex-1">
          <h2
            className={`mb-4 flex text-xs leading-[20px] text-gray-400 uppercase ${
              showFull ? "justify-start" : "justify-center"
            }`}
          >
            {showFull ? "Navigation" : <HorizontaLDots />}
          </h2>

          <ul className="flex flex-col gap-3">
            {navItems.map((item) => {
              const isActive =
                pathname === item.path ||
                (item.path !== "/upload" && pathname.startsWith(item.path));

              return (
                <li key={item.name}>
                  <Link
                    href={item.path}
                    onClick={() => {
                      if (isMobileOpen) {
                        toggleMobileSidebar();
                      }
                    }}
                    className={`menu-item group ${
                      isActive ? "menu-item-active" : "menu-item-inactive"
                    } ${showFull ? "lg:justify-start" : "lg:justify-center"}`}
                  >
                    <span
                      className={
                        isActive
                          ? "menu-item-icon-active"
                          : "menu-item-icon-inactive"
                      }
                    >
                      {item.icon}
                    </span>
                    {showFull ? <span className="menu-item-text">{item.name}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {showFull ? (
          <div className="rounded-lg border border-brand-100 bg-brand-50 p-4 dark:border-brand-500/20 dark:bg-brand-500/10">
            <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">
              {session?.principalType === "demo" ? "One-time demo workspace" : "Workspace dashboard"}
            </p>
            <p className="mt-2 text-xs leading-5 text-brand-700 dark:text-brand-200">
              {session?.principalType === "demo"
                ? "This isolated demo is safe to explore, but live email delivery, integrations, and real billing actions stay disabled."
                : session?.role === "admin"
                  ? "Screen candidates, manage forms, review results, and control workspace access from one admin area."
                  : "Screen candidates, manage forms, and review results from one secure workspace area."}
            </p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
