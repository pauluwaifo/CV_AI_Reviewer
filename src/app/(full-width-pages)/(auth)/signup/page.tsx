import type { Metadata } from "next";
import { redirect } from "next/navigation";

import SignUpForm from "@/components/auth/SignUpForm";
import { getWorkspaceSession, normalizeNextPath } from "@/lib/workspace-auth";

export const metadata: Metadata = {
  title: "Create Workspace",
  description:
    "Create a secure hiring workspace for your company and launch the branded recruiting experience.",
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const session = await getWorkspaceSession();
  const { next } = await searchParams;
  const nextPath = normalizeNextPath(Array.isArray(next) ? next[0] : next);

  if (session) {
    redirect(nextPath === "/" ? (session.role === "admin" ? "/workspace" : "/pipeline") : nextPath);
  }

  return <SignUpForm nextPath={nextPath === "/" ? "/workspace" : nextPath} />;
}
