import type { Metadata } from "next";

import PublicApplicationFormPage from "@/components/analyzer/PublicApplicationFormPage";

export const metadata: Metadata = {
  title: "Apply",
  description: "Submit your application and resume to the hiring team.",
};

export const dynamic = "force-dynamic";

export default async function ApplyPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;
  return <PublicApplicationFormPage formId={formId} />;
}
