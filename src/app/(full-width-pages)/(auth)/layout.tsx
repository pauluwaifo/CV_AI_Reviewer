import GridShape from "@/components/common/GridShape";
import ThemeTogglerTwo from "@/components/common/ThemeTogglerTwo";

import Link from "next/link";
import React from "react";

import { getWorkspaceSession } from "@/lib/workspace-auth";
import { getWorkspaceSettings } from "@/lib/workspace-settings-store";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getWorkspaceSession();
  const settings = session
    ? await getWorkspaceSettings(session.workspaceId)
    : null;
  const productName = settings?.appName || "Hiring Workspace OS";
  const organizationName = settings?.organizationName || "Your company";

  return (
    <div className="relative z-1 h-dvh overflow-hidden bg-white dark:bg-gray-900">
      <div className="relative flex h-full min-h-0 w-full flex-col dark:bg-gray-900 lg:flex-row">
        {children}
        <div className="hidden h-full min-h-0 w-full items-center overflow-hidden bg-brand-950 dark:bg-white/5 lg:grid lg:w-1/2">
          <div className="relative z-1 flex items-center justify-center">
            <GridShape />
            <div className="flex max-w-md flex-col items-start px-10 text-white">
              <Link href="/" className="mb-5 block">
                <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold tracking-[0.14em] text-white/90 backdrop-blur">
                  {productName}
                </div>
              </Link>
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
                  Multi-company recruiting platform
                </p>
                <h2 className="text-4xl font-semibold leading-tight">
                  Secure workspace access for {organizationName}.
                </h2>
                <p className="text-sm leading-7 text-white/75">
                  Each company can maintain its own hiring pipeline, public forms, and
                  candidate review workflow while staying isolated behind a signed workspace
                  session.
                </p>
                <div className="grid gap-3 pt-2 text-sm text-white/80">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 backdrop-blur">
                    Server-backed workspace identity and color settings
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 backdrop-blur">
                    Protected admin routes, exports, downloads, and screening tools
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 backdrop-blur">
                    Public application forms that stay branded to the hiring workspace
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="fixed bottom-6 right-6 z-50 hidden sm:block">
          <ThemeTogglerTwo />
        </div>
      </div>
    </div>
  );
}
