import Link from "next/link";

export default function WorkspaceModuleBlockedPage({
  billingHref = "/billing",
  description,
  title,
}: {
  billingHref?: string;
  description: string;
  title: string;
}) {
  return (
    <section className="mx-auto max-w-4xl rounded-2xl border border-[var(--workspace-form-border-soft)] bg-white p-6 shadow-[var(--workspace-form-shadow-sm)] dark:border-gray-800 dark:bg-gray-900 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
        Module locked
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--workspace-form-title)] dark:text-white">
        {title}
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--workspace-form-muted)] dark:text-gray-300">
        {description}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/pipeline"
          className="inline-flex items-center justify-center rounded-lg border border-[var(--workspace-form-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--workspace-form-title)] transition hover:bg-[var(--workspace-form-page)] dark:border-gray-700 dark:bg-transparent dark:text-white dark:hover:bg-white/5"
        >
          Back to workspace
        </Link>
        <Link
          href={billingHref}
          className="inline-flex items-center justify-center rounded-lg bg-[var(--workspace-form-accent)] px-4 py-2.5 text-sm font-medium text-[var(--workspace-form-accent-text)] transition hover:bg-[var(--workspace-form-accent-muted)]"
        >
          Open billing
        </Link>
      </div>
    </section>
  );
}
