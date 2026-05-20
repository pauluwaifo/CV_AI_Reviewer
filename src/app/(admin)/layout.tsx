import type { ReactNode } from "react";

import { SidebarProvider } from "@/context/SidebarContext";
import DashboardShell from "@/layout/DashboardShell";
import { getWorkspaceSession } from "@/lib/workspace-auth";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getWorkspaceSession();

  return (
    <SidebarProvider>
      <DashboardShell session={session}>{children}</DashboardShell>
    </SidebarProvider>
  );
}
