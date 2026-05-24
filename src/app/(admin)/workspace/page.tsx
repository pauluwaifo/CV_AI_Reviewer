import type { Metadata } from "next";

import WorkspaceModuleBlockedPage from "@/components/workspace/WorkspaceModuleBlockedPage";
import WorkspaceSettingsPage from "@/components/workspace/WorkspaceSettingsPage";
import { requireWorkspaceFeaturePageAccess } from "@/lib/workspace-module-access";

export const metadata: Metadata = {
  title: "Workspace",
  description:
    "Configure workspace identity, public form design, security, and tenant-ready settings.",
};

export default async function WorkspacePage() {
  const access = await requireWorkspaceFeaturePageAccess("/workspace", "workspace_settings", {
    role: "admin",
  });

  if (!access.isAccessible) {
    return (
      <WorkspaceModuleBlockedPage
        title="Workspace Settings is currently locked"
        description={access.lockedMessage}
      />
    );
  }

  return <WorkspaceSettingsPage />;
}
