import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ThemeProvider } from "@/context/ThemeContext";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import { getWorkspaceSession } from "@/lib/workspace-auth";
import { getWorkspaceControlSettings } from "@/lib/workspace-control-store";
import { getWorkspaceSettings } from "@/lib/workspace-settings-store";

import "./globals.css";
import "flatpickr/dist/flatpickr.css";

export const metadata: Metadata = {
  title: {
    default: "Hiring Workspace OS",
    template: "%s | Hiring Workspace OS",
  },
  description:
    "A customizable multi-workspace recruiting platform for CV screening, public hiring forms, shortlist review, and workflow coordination.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const session = await getWorkspaceSession();
  const [initialSettings, initialControls] = session
    ? await Promise.all([
        getWorkspaceSettings(session.workspaceId),
        getWorkspaceControlSettings(session.workspaceId),
      ])
    : [undefined, undefined];

  return (
    <html lang="en">
      <body className="dark:bg-gray-900">
        <ThemeProvider>
          <WorkspaceProvider
            initialSettings={initialSettings}
            initialControls={initialControls}
          >
            {children}
          </WorkspaceProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
