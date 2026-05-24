import type { Metadata } from "next";

import UploadDocumentPage from "@/components/analyzer/UploadDocumentPage";
import WorkspaceModuleBlockedPage from "@/components/workspace/WorkspaceModuleBlockedPage";
import { requireWorkspaceFeaturePageAccess } from "@/lib/workspace-module-access";

export const metadata: Metadata = {
  title: "Upload Candidate CV",
  description: "Upload a candidate CV and run a focused AI screening review.",
};

export default async function UploadPage() {
  const access = await requireWorkspaceFeaturePageAccess("/upload", "screen_cv");

  if (!access.isAccessible) {
    return (
      <WorkspaceModuleBlockedPage
        title="Screen CV is currently locked"
        description={access.lockedMessage}
      />
    );
  }

  return <UploadDocumentPage />;
}
