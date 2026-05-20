"use client";

import Link from "next/link";

import { useWorkspace } from "@/context/WorkspaceContext";
import { buildPublicFormTheme } from "@/lib/workspace-settings";

const originCards = [
  {
    number: "1",
    title: "Built for real hiring pressure",
    description:
      "Created for teams that need clarity fast, without juggling CV reviews, public forms, shortlist notes, and follow-up decisions across scattered tools.",
  },
  {
    number: "2",
    title: "Explainable AI, not vague scoring",
    description:
      "Every screening result is grounded in evidence, role-match signals, risk flags, and recruiter-facing prompts that can actually support decisions.",
  },
  {
    number: "3",
    title: "Ready for any company brand",
    description:
      "Each workspace can carry its own colors, titles, intake experience, and secure admin workflow while still running from one scalable product foundation.",
  },
];

const platformCards: Array<{
  title: string;
  description: string;
  icon: "spark" | "orbit" | "pulse";
}> = [
  {
    title: "Screen with confidence",
    description:
      "Upload a candidate CV, attach the role brief, and get structured analysis, score rationale, interview prompts, and grounded evidence in one pass.",
    icon: "spark",
  },
  {
    title: "Launch branded applicant intake",
    description:
      "Publish public hiring forms with company-specific titles, accent colors, and a smoother candidate-facing application experience.",
    icon: "orbit",
  },
  {
    title: "Move from review to decision",
    description:
      "Compare candidates, export submissions, download resumes, and manage shortlist actions inside one secure workspace instead of switching tools.",
    icon: "pulse",
  },
];

const workflowPills = [
  "CV screening",
  "Workspace security",
  "Public application forms",
  "Shortlist review",
];

const sparkles = [
  { top: "14%", left: "8%" },
  { top: "19%", right: "13%" },
  { top: "34%", left: "16%" },
  { top: "43%", right: "22%" },
  { top: "60%", left: "10%" },
  { top: "72%", right: "8%" },
];

export default function AnalyzerHomePage({
  isAuthenticated = false,
}: {
  isAuthenticated?: boolean;
}) {
  const { settings } = useWorkspace();
  const theme = buildPublicFormTheme(settings.dashboardAccent);
  const accentRgb = toRgb(settings.dashboardAccent);
  const accentDeepRgb = toRgb(theme.accentHover);
  const primaryHref = isAuthenticated ? "/pipeline" : "/signup?next=%2Fworkspace";
  const secondaryHref = isAuthenticated ? "/workspace" : "/signin?next=%2Fpipeline";

  return (
    <div
      className="-mx-4 -mt-4 min-h-screen overflow-x-clip bg-[#050b1d] text-white sm:-mx-6"
      style={{
        backgroundImage: [
          `radial-gradient(circle at top, rgba(${accentRgb}, 0.24), transparent 30%)`,
          `radial-gradient(circle at 50% 30%, rgba(${accentDeepRgb}, 0.14), transparent 24%)`,
          "linear-gradient(180deg, #0b1539 0%, #061028 28%, #040918 100%)",
        ].join(","),
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage: [
            "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
          ].join(","),
          backgroundSize: "112px 112px",
          maskImage:
            "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.95) 26%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      {sparkles.map((sparkle, index) => (
        <span
          key={`${sparkle.top}-${sparkle.left ?? sparkle.right}-${index}`}
          className="pointer-events-none absolute h-1 w-1 rounded-full bg-white shadow-[0_0_16px_rgba(255,255,255,0.7)]"
          style={sparkle}
        />
      ))}

      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#07112e]/68 backdrop-blur-2xl supports-[backdrop-filter]:bg-[#07112e]/48">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-4 py-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-4">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-semibold text-white"
              style={{
                borderColor: `rgba(${accentRgb}, 0.34)`,
                background: `linear-gradient(135deg, rgba(${accentRgb}, 0.42), rgba(${accentDeepRgb}, 0.18))`,
              }}
            >
              {settings.appName.charAt(0)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-white">{settings.appName}</p>
              <p className="truncate text-sm text-white/58">
                {settings.organizationName} workspace
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 text-sm text-white/72 lg:flex">
            <a href="#about" className="transition hover:text-white">
              About Us
            </a>
            <a href="#vision" className="transition hover:text-white">
              Our Vision
            </a>
            <a href="#platform" className="transition hover:text-white">
              Platform
            </a>
            <a href="#workflow" className="transition hover:text-white">
              Workflow
            </a>
            <a href="#contact" className="transition hover:text-white">
              Contacts
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href={isAuthenticated ? "/upload" : "/signup?next=%2Fworkspace"}
              className="hidden text-sm text-white/72 transition hover:text-white sm:inline-flex"
            >
              {isAuthenticated ? "Upload" : "Create Workspace"}
            </Link>
            <Link
              href={isAuthenticated ? "/pipeline" : "/signin"}
              className="inline-flex items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/8"
              style={{
                borderColor: `rgba(${accentRgb}, 0.24)`,
                backgroundColor: "rgba(255,255,255,0.03)",
              }}
            >
              {isAuthenticated ? "Open Workspace" : "Workspace Sign In"}
            </Link>
          </div>
        </div>
      </header>

      <main className="relative">
        <section className="relative min-h-screen px-4 pb-24 pt-32 sm:px-6 sm:pb-28 sm:pt-36 lg:pt-40">
          <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-7xl flex-col justify-center">
            <div className="mx-auto max-w-4xl text-center">
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/74">
                Multi-workspace hiring operating system
              </div>

              <h1 className="mt-8 text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-8xl">
                Simplify the Hiring Journey.
                <span
                  className="mt-2 block"
                  style={{
                    color: theme.accentSoft,
                    textShadow: `0 0 44px rgba(${accentRgb}, 0.18)`,
                  }}
                >
                  Empower the Outcome.
                </span>
              </h1>

              <p className="mx-auto mt-8 max-w-3xl text-lg leading-9 text-white/72 sm:text-xl">
                {settings.appName} transforms recruiting complexity into a secure, branded,
                evidence-led workflow for screening, public applications, and shortlist decisions.
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href={primaryHref}
                  className="inline-flex min-w-[220px] items-center justify-center rounded-full px-7 py-4 text-base font-medium text-white shadow-[0_25px_70px_rgba(0,0,0,0.28)] transition hover:translate-y-[-1px]"
                  style={{
                    background: `linear-gradient(135deg, ${settings.dashboardAccent}, ${theme.accentHover})`,
                  }}
                >
                  {isAuthenticated ? "Open Secure Workspace" : "Create Workspace"}
                </Link>
                <Link
                  href={secondaryHref}
                  className="inline-flex min-w-[220px] items-center justify-center rounded-full border border-white/12 px-7 py-4 text-base font-medium text-white/84 transition hover:bg-white/6 hover:text-white"
                >
                  {isAuthenticated ? "Workspace Settings" : "Sign In"}
                </Link>
              </div>
            </div>

            <div className="relative mt-20 h-64 sm:mt-24 sm:h-72 lg:h-80">
              <div
                className="absolute inset-x-[-18%] bottom-[-72%] h-[155%] rounded-[50%] border"
                style={{
                  borderColor: `rgba(${accentRgb}, 0.18)`,
                  background: `radial-gradient(circle at 50% 0%, rgba(${accentRgb}, 0.34), rgba(10,18,44,0.18) 45%, transparent 76%)`,
                  boxShadow: `0 -50px 150px rgba(${accentRgb}, 0.12)`,
                }}
              />
              <div
                className="absolute inset-x-[-5%] bottom-[-32%] h-[90%] rounded-[50%] border border-white/6"
                style={{
                  background: "linear-gradient(180deg, rgba(255,255,255,0.03), transparent)",
                }}
              />
            </div>
          </div>
        </section>

        <section
          id="about"
          className="scroll-mt-24 border-t border-white/6 px-4 py-20 sm:px-6 sm:py-24"
        >
          <div className="mx-auto max-w-7xl space-y-10">
            <div className="mx-auto max-w-3xl space-y-4 text-center">
              <SectionPill label={`Why ${settings.appName}`} />
              <h2 className="text-3xl font-medium leading-tight text-white sm:text-5xl">
                A strategic recruiting platform turning fragmented hiring work into one clear,
                confident operating flow.
              </h2>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              {originCards.map((card) => (
                <article
                  key={card.number}
                  className="rounded-[28px] border p-6 sm:p-7"
                  style={{
                    borderColor: "rgba(255,255,255,0.08)",
                    background:
                      "linear-gradient(180deg, rgba(255,255,255,0.028), rgba(255,255,255,0.012))",
                  }}
                >
                  <p
                    className="text-6xl font-light leading-none"
                    style={{ color: theme.accentSoft }}
                  >
                    {card.number}
                  </p>
                  <h3 className="mt-6 text-2xl font-semibold text-white">{card.title}</h3>
                  <p className="mt-4 text-sm leading-7 text-white/64">{card.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="vision"
          className="scroll-mt-24 relative overflow-hidden border-t border-white/6 px-4 py-24 sm:px-6 sm:py-28"
        >
          <WaveLine className="-top-4 left-1/2 w-[150%] -translate-x-1/2" />
          <WaveLine className="top-16 left-1/2 w-[140%] -translate-x-1/2" />
          <WaveLine className="top-36 left-1/2 w-[130%] -translate-x-1/2" />

          <div className="relative mx-auto max-w-5xl text-center">
            <SectionPill label="Our Vision" />
            <h2 className="mt-6 text-3xl font-medium leading-tight text-white sm:text-5xl sm:leading-tight">
              To empower hiring teams to move from candidate complexity to clear outcomes, making
              every recruiting step easier, faster, and more brand-consistent.
            </h2>
            <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-white/62 sm:text-lg">
              The product stays reusable for any company, while each workspace still feels tailored
              to its own hiring identity, public forms, and secure review process.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <AvatarToken label="HR" accent={settings.dashboardAccent} />
              <AvatarToken label="AI" accent={theme.accentHover} />
              <AvatarToken label="Ops" accent={theme.accentSoft} darkText />
              <AvatarToken label="JD" accent={settings.dashboardAccent} />
              <AvatarToken label="CV" accent={theme.accentHover} />
            </div>
          </div>
        </section>

        <section
          id="platform"
          className="scroll-mt-24 border-t border-white/6 px-4 py-20 sm:px-6 sm:py-24"
        >
          <div className="mx-auto max-w-7xl space-y-8">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-end">
              <div className="space-y-4">
                <SectionPill label="The Platform" />
                <h2 className="max-w-3xl text-3xl font-medium leading-tight text-white sm:text-5xl">
                  Navigate the hiring path. Clarify the fit. Deliver the decision.
                </h2>
              </div>
              <p className="max-w-2xl justify-self-end text-sm leading-8 text-white/62 lg:text-right">
                {settings.appName} brings AI screening, secure workspace access, branded applicant
                intake, and candidate review into one operational system instead of a patchwork of
                forms, spreadsheets, and inbox decisions.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {workflowPills.map((pill) => (
                <span
                  key={pill}
                  className="rounded-full border px-3 py-1.5 text-xs font-medium text-white/76"
                  style={{
                    borderColor: `rgba(${accentRgb}, 0.18)`,
                    backgroundColor: "rgba(255,255,255,0.03)",
                  }}
                >
                  {pill}
                </span>
              ))}
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              {platformCards.map((card) => (
                <article
                  key={card.title}
                  className="rounded-[28px] border p-6 sm:p-7"
                  style={{
                    borderColor: `rgba(${accentRgb}, 0.1)`,
                    background: `linear-gradient(180deg, rgba(${accentRgb}, 0.08) 0%, rgba(255,255,255,0.02) 100%)`,
                  }}
                >
                  <div
                    className="flex h-16 w-16 items-center justify-center rounded-full border"
                    style={{
                      borderColor: `rgba(${accentRgb}, 0.24)`,
                      background: `radial-gradient(circle at 30% 30%, rgba(${accentRgb}, 0.38), rgba(${accentDeepRgb}, 0.08))`,
                    }}
                  >
                    <FeatureIcon kind={card.icon} accent={theme.accentSoft} />
                  </div>
                  <h3 className="mt-6 text-2xl font-semibold text-white">{card.title}</h3>
                  <p className="mt-4 text-sm leading-7 text-white/64">{card.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="workflow"
          className="scroll-mt-24 border-t border-white/6 px-4 py-20 sm:px-6 sm:py-24"
        >
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-[30px] border border-white/8 bg-white/[0.025] p-7 sm:p-8">
                <SectionPill label="Workflow" />
                <h2 className="mt-5 max-w-3xl text-3xl font-medium leading-tight text-white sm:text-5xl">
                  From first resume upload to final shortlist, the whole recruiting motion stays in
                  one branded workspace.
                </h2>
                <div className="mt-8 grid gap-4 md:grid-cols-3">
                  <WorkflowMetric
                    label="Secure Workspaces"
                    value="Company-scoped"
                    text="Sessions, forms, records, and exports stay aligned to the active hiring workspace."
                  />
                  <WorkflowMetric
                    label="Public Intake"
                    value="Branded"
                    text="Applicant-facing forms inherit workspace titles, colors, and context without custom builds."
                  />
                  <WorkflowMetric
                    label="AI Review"
                    value="Evidence-led"
                    text="Screening outputs are structured around fit, risk, highlights, and interview direction."
                  />
                </div>
              </div>

              <div className="rounded-[30px] border border-white/8 bg-white/[0.025] p-7 sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/48">
                  Practical outcome
                </p>
                <div className="mt-5 space-y-4">
                  <WorkflowStep
                    title="Publish the role"
                    text="Create a form, attach the JD, and launch a public application page in minutes."
                  />
                  <WorkflowStep
                    title="Screen intelligently"
                    text="Run CV analysis against the real role benchmark and surface candidate strengths and gaps."
                  />
                  <WorkflowStep
                    title="Review with confidence"
                    text="Download resumes, compare applicants, export responses, and move faster on shortlist decisions."
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="contact"
          className="scroll-mt-24 border-t border-white/6 px-4 py-20 sm:px-6 sm:py-24"
        >
          <div
            className="mx-auto max-w-7xl rounded-[32px] border px-6 py-8 sm:px-8 sm:py-10"
            style={{
              borderColor: `rgba(${accentRgb}, 0.12)`,
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)",
            }}
          >
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/48">
                  Ready to launch
                </p>
                <h2 className="max-w-3xl text-3xl font-medium leading-tight text-white sm:text-5xl">
                  Make this your company&apos;s recruiting front door with your own name, colors,
                  public forms, and secure hiring workflow.
                </h2>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href={secondaryHref}
                  className="inline-flex items-center justify-center rounded-full border border-white/12 px-5 py-3 text-sm font-medium text-white/84 transition hover:bg-white/6 hover:text-white"
                >
                  {isAuthenticated ? "Customize workspace" : "Sign in"}
                </Link>
                <Link
                  href={primaryHref}
                  className="inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium text-white transition hover:translate-y-[-1px]"
                  style={{
                    background: `linear-gradient(135deg, ${settings.dashboardAccent}, ${theme.accentHover})`,
                  }}
                >
                  {isAuthenticated ? "Go to pipeline" : "Create workspace"}
                </Link>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-white/6 px-4 py-10 sm:px-6 sm:py-12">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.6fr))]">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold text-white"
                  style={{
                    borderColor: `rgba(${accentRgb}, 0.34)`,
                    background: `linear-gradient(135deg, rgba(${accentRgb}, 0.42), rgba(${accentDeepRgb}, 0.18))`,
                  }}
                >
                  {settings.appName.charAt(0)}
                </span>
                <div>
                  <p className="text-base font-semibold text-white">{settings.appName}</p>
                  <p className="text-sm text-white/56">{settings.organizationName} workspace</p>
                </div>
              </div>
              <p className="max-w-md text-sm leading-7 text-white/58">
                Secure, brandable recruiting operations for screening, public applicant intake, and
                shortlist decisions across any company workspace.
              </p>
            </div>

            <FooterColumn
              title="Platform"
              items={[
                { label: "About Us", href: "#about" },
                { label: "Our Vision", href: "#vision" },
                { label: "Workflow", href: "#workflow" },
              ]}
            />
            <FooterColumn
              title="Access"
              items={[
                {
                  label: isAuthenticated ? "Open Workspace" : "Create Workspace",
                  href: primaryHref,
                },
                {
                  label: isAuthenticated ? "Workspace Settings" : "Sign In",
                  href: secondaryHref,
                },
                { label: "Contacts", href: "#contact" },
              ]}
            />
            <FooterColumn
              title="Product"
              items={[
                { label: "Form Setup", href: isAuthenticated ? "/workspace" : "/signup" },
                { label: "Pipeline", href: isAuthenticated ? "/pipeline" : "/signin" },
                { label: "Applicant Forms", href: "#platform" },
              ]}
            />
          </div>

          <div className="mx-auto mt-8 max-w-7xl border-t border-white/6 pt-5 text-sm text-white/42">
            {new Date().getFullYear()} {settings.appName}. Built for secure multi-workspace hiring.
          </div>
        </footer>
      </main>
    </div>
  );
}

function SectionPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/68">
      {label}
    </span>
  );
}

function AvatarToken({
  label,
  accent,
  darkText = false,
}: {
  label: string;
  accent: string;
  darkText?: boolean;
}) {
  return (
    <span
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full border text-xs font-semibold ${
        darkText ? "text-gray-900" : "text-white"
      }`}
      style={{
        borderColor: "rgba(255,255,255,0.18)",
        background: `linear-gradient(135deg, ${accent}, rgba(255,255,255,0.12))`,
      }}
    >
      {label}
    </span>
  );
}

function WorkflowMetric({
  label,
  value,
  text,
}: {
  label: string;
  value: string;
  text: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/48">
        {label}
      </p>
      <p className="mt-3 text-xl font-semibold text-white">{value}</p>
      <p className="mt-3 text-sm leading-7 text-white/62">{text}</p>
    </div>
  );
}

function WorkflowStep({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-5">
      <p className="text-lg font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-7 text-white/62">{text}</p>
    </div>
  );
}

function FooterColumn({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; href: string }>;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/42">
        {title}
      </p>
      <div className="mt-4 space-y-3">
        {items.map((item) =>
          item.href.startsWith("/") ? (
            <Link
              key={`${title}:${item.label}`}
              href={item.href}
              className="block text-sm text-white/62 transition hover:text-white"
            >
              {item.label}
            </Link>
          ) : (
            <a
              key={`${title}:${item.label}`}
              href={item.href}
              className="block text-sm text-white/62 transition hover:text-white"
            >
              {item.label}
            </a>
          )
        )}
      </div>
    </div>
  );
}

function FeatureIcon({
  kind,
  accent,
}: {
  kind: "spark" | "orbit" | "pulse";
  accent: string;
}) {
  if (kind === "orbit") {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <circle cx="14" cy="14" r="3" fill={accent} />
        <circle cx="14" cy="14" r="9.25" stroke={accent} strokeOpacity="0.9" />
        <path
          d="M4.75 14C6.2 9.4 9.46 6.5 14 6.5C18.54 6.5 21.8 9.4 23.25 14"
          stroke={accent}
          strokeOpacity="0.65"
          strokeLinecap="round"
        />
        <path
          d="M23.25 14C21.8 18.6 18.54 21.5 14 21.5C9.46 21.5 6.2 18.6 4.75 14"
          stroke={accent}
          strokeOpacity="0.65"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (kind === "pulse") {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path
          d="M4.5 14H9.25L11.5 9.5L15.25 18.5L18.25 12.5L20 14H23.5"
          stroke={accent}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="4.5" y="5.5" width="19" height="17" rx="5" stroke={accent} strokeOpacity="0.65" />
      </svg>
    );
  }

  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path
        d="M14 5.5L15.95 10.05L20.5 12L15.95 13.95L14 18.5L12.05 13.95L7.5 12L12.05 10.05L14 5.5Z"
        stroke={accent}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="14" cy="14" r="9.5" stroke={accent} strokeOpacity="0.45" />
    </svg>
  );
}

function WaveLine({ className }: { className: string }) {
  return (
    <div
      className={`pointer-events-none absolute h-40 rounded-[50%] border border-white/6 ${className}`}
      style={{ transform: "translateX(-50%) rotate(-6deg)" }}
    />
  );
}

function toRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const padded = normalized.length === 6 ? normalized : normalized.padEnd(6, "0");
  const red = Number.parseInt(padded.slice(0, 2), 16);
  const green = Number.parseInt(padded.slice(2, 4), 16);
  const blue = Number.parseInt(padded.slice(4, 6), 16);

  return `${red}, ${green}, ${blue}`;
}
