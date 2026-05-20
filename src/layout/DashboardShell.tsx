"use client";

import type { ReactNode } from "react";

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
  } | null;
};

export default function DashboardShell({ children, session }: DashboardShellProps) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const sidebarWidthClass =
    isExpanded || isHovered || isMobileOpen ? "lg:ml-[290px]" : "lg:ml-[90px]";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <AppSidebar />
      <Backdrop />
      <div className={`min-h-screen transition-all duration-300 ${sidebarWidthClass}`}>
        <AppHeader session={session} />
        <main className="mx-auto max-w-7xl px-4 pb-12 pt-5 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
