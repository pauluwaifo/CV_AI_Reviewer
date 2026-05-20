import type { Metadata } from "next";

import WorkspaceSettingsPage from "@/components/workspace/WorkspaceSettingsPage";
import { requireWorkspacePageSession } from "@/lib/workspace-auth";

export const metadata: Metadata = {
  title: "Workspace",
  description:
    "Configure workspace identity, public form design, security, and tenant-ready settings.",
};

export default async function WorkspacePage() {
  await requireWorkspacePageSession("/workspace");
  return <WorkspaceSettingsPage />;
}
