import Link from "next/link";
import type { Metadata } from "next";

import { getPpapSubmission } from "@/lib/ppap-store";
import { getWorkspaceSettings } from "@/lib/workspace-settings-store";
import { sanitizeWorkspaceId } from "@/lib/workspace-settings";

export const metadata: Metadata = {
  title: "PPAP Complete",
  description: "Your PPAP assessment summary.",
};

export default async function PpapCompletePage({
  searchParams,
}: {
  searchParams?: Promise<{
    submission?: string | string[];
    workspace?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const workspaceId = sanitizeWorkspaceId(normalizeSearchParam(params?.workspace));
  const submissionId = normalizeSearchParam(params?.submission);
  const [settings, submission] = await Promise.all([
    getWorkspaceSettings(workspaceId),
    submissionId ? getPpapSubmission(workspaceId, submissionId) : Promise.resolve(null),
  ]);

  return (
    <main className="min-h-screen px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <section className="border border-slate-200 bg-white px-5 py-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="grid h-11 w-11 place-items-center overflow-hidden border border-slate-200 bg-white text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                style={{ borderRadius: 2 }}
              >
                {settings.logoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={settings.logoDataUrl}
                    alt={`${settings.organizationName} logo`}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  settings.organizationName.slice(0, 1).toUpperCase()
                )}
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  {settings.appName}
                </p>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  Assessment complete
                </h1>
              </div>
            </div>

            <p className="max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
              Thanks for completing the assessment. Your summary is below.
            </p>
          </div>
        </section>

        <section className="border border-slate-200 bg-white px-5 py-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-6">
          {submission ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Candidate summary
                </p>
                <p className="text-sm leading-7 text-slate-700 dark:text-slate-300">{submission.candidateSummary}</p>
              </div>

              <div className="border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-950/60">
                <SummaryRow label="Candidate" value={submission.fullName} />
                <SummaryRow label="Role applied for" value={submission.roleApplied} />
                <SummaryRow label="Brand / function" value={submission.brand} />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
                We could not find a saved submission for that link. If you just finished the
                assessment, please open the completion link again from the browser that submitted
                it.
              </p>
            </div>
          )}
        </section>

        <div className="flex flex-wrap gap-3">
          <Link
          href={`/ppap?workspace=${encodeURIComponent(workspaceId)}`}
          className="border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          style={{ borderRadius: 2 }}
        >
            Start another assessment
          </Link>
        </div>
      </div>
    </main>
  );
}

function normalizeSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0]?.trim() ?? "" : value?.trim() ?? "";
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-200 pb-3 last:border-b-0 last:pb-0 dark:border-slate-700 sm:flex-row sm:items-start sm:justify-between">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <span className="text-sm text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  );
}
