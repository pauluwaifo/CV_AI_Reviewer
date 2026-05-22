"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import WorkspaceAssistant from "@/components/workspace/WorkspaceAssistant";
import { useSidebar } from "@/context/SidebarContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";

type DashboardShellProps = {
  children: ReactNode;
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

export default function DashboardShell({ children, session }: DashboardShellProps) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const pathname = usePathname();
  const sidebarWidthClass =
    isExpanded || isHovered || isMobileOpen ? "lg:ml-[290px]" : "lg:ml-[90px]";
  const isWideWorkspacePage =
    pathname.startsWith("/pipeline") ||
    pathname.startsWith("/results") ||
    pathname.startsWith("/workspace");
  const mainClassName = isWideWorkspacePage
    ? "px-4 pb-12 pt-5 sm:px-6 lg:px-8 xl:px-10 2xl:px-12"
    : "mx-auto max-w-7xl px-4 pb-12 pt-5 sm:px-6 lg:px-8";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <AppSidebar session={session} />
      <Backdrop />
      <div className={`min-h-screen transition-all duration-300 ${sidebarWidthClass}`}>
        <AppHeader session={session} />
        <main className={mainClassName}>
          {children}
        </main>
        {session ? <WorkspaceAssistant session={{ role: session.role }} /> : null}
      </div>
    </div>
  );
}
