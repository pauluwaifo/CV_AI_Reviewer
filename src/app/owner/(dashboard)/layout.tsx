import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import OwnerDashboardShell from "@/components/workspace/OwnerDashboardShell";
import { getOwnerSession } from "@/lib/owner-auth";

export default async function OwnerDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getOwnerSession();

  if (!session) {
    redirect("/owner/signin?next=/owner");
  }

  return <OwnerDashboardShell session={session}>{children}</OwnerDashboardShell>;
}
