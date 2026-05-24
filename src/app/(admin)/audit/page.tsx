import type { Metadata } from "next";

import WorkspaceAuditPage from "@/components/workspace/WorkspaceAuditPage";
import WorkspaceModuleBlockedPage from "@/components/workspace/WorkspaceModuleBlockedPage";
import { listWorkspaceAuditEvents } from "@/lib/workspace-audit-store";
import { requireWorkspaceFeaturePageAccess } from "@/lib/workspace-module-access";

export const metadata: Metadata = {
  title: "Audit Log",
  description: "Review workspace access, workflow, billing, and integration activity.",
};

export default async function AuditLogPage() {
  const access = await requireWorkspaceFeaturePageAccess("/audit", "audit_log", {
    role: "admin",
  });

  if (!access.isAccessible) {
    return (
      <WorkspaceModuleBlockedPage
        title="Audit Log is currently locked"
        description={access.lockedMessage}
      />
    );
  }

  const events = await listWorkspaceAuditEvents(access.session.workspaceId, 250).catch(
    () => []
  );

  return <WorkspaceAuditPage events={events} />;
}
