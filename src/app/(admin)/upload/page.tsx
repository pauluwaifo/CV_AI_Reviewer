import type { Metadata } from "next";

import UploadDocumentPage from "@/components/analyzer/UploadDocumentPage";
import { requireWorkspacePageSession } from "@/lib/workspace-auth";

export const metadata: Metadata = {
  title: "Upload Candidate CV",
  description: "Upload a candidate CV and run a focused AI screening review.",
};

export default async function UploadPage() {
  await requireWorkspacePageSession("/upload");
  return <UploadDocumentPage />;
}
