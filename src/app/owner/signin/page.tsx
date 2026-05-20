import type { Metadata } from "next";
import { redirect } from "next/navigation";

import OwnerSignInForm from "@/components/auth/OwnerSignInForm";
import {
  getOwnerSession,
  normalizeOwnerNextPath,
} from "@/lib/owner-auth";

export const metadata: Metadata = {
  title: "Owner Sign In",
  description: "Sign in to the private platform owner dashboard.",
};

export default async function OwnerSignInPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = normalizeOwnerNextPath(params?.next);
  const session = await getOwnerSession();

  if (session) {
    redirect(nextPath);
  }

  return <OwnerSignInForm nextPath={nextPath} />;
}
