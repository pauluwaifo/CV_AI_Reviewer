import type { Metadata } from "next";
import { redirect } from "next/navigation";

import SignInForm from "@/components/auth/SignInForm";
import { getWorkspaceSession, normalizeNextPath } from "@/lib/workspace-auth";

export const metadata: Metadata = {
  title: "Workspace Sign In",
  description:
    "Sign in with your workspace ID and access key to open secure recruiting tools.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const session = await getWorkspaceSession();
  const { next } = await searchParams;
  const nextPath = normalizeNextPath(Array.isArray(next) ? next[0] : next);

  if (session) {
    redirect(nextPath === "/" ? "/pipeline" : nextPath);
  }

  return <SignInForm nextPath={nextPath === "/" ? "/pipeline" : nextPath} />;
}
