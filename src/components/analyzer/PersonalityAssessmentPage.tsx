"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  CheckLineIcon,
  CopyIcon,
  DownloadIcon,
  ShootingStarIcon,
} from "@/icons";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  appendWorkspaceQuery,
  buildPublicFormTheme,
  buildWorkspaceApiHeaders,
  getWorkspaceScopedStorageKey,
} from "@/lib/workspace-settings";
import {
  buildDefaultPersonalityAssessmentDraft,
  buildPersonalityAssessmentDraftFromSnapshot,
  buildPersonalityAssessmentSampleDraft,
  buildPersonalityAssessmentSummary,
  getPersonalityFitTier,
  getPersonalityRoleProfile,
  getPersonalityScoreBand,
  parsePersonalityAssessmentDraft,
  PERSONALITY_ROLE_PROFILES,
  PERSONALITY_SCALE_SECTIONS,
  scorePersonalityAssessment,
  type PersonalityAssessmentDraft,
  type PersonalityRoleId,
  type PersonalityScaleCategory,
  type PersonalityScaleDefinition,
  type PersonalityScaleScore,
} from "@/lib/personality-assessment";
import type { HiringApplicationRecord } from "@/types/hiring-funnel";

const CATEGORY_TONES: Record<
  PersonalityScaleCategory,
  {
    badge: string;
    panel: string;
    accent: string;
    softAccent: string;
  }
> = {
  bright: {
    badge:
      "border-cyan-200 bg-cyan-100 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/20 dark:text-cyan-100",
    panel:
      "border-cyan-200/70 bg-cyan-50/70 dark:border-cyan-500/20 dark:bg-cyan-500/10",
    accent: "#06b6d4",
    softAccent: "#a5f3fc",
  },
  derailer: {
    badge:
      "border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-100",
    panel:
      "border-rose-200/70 bg-rose-50/70 dark:border-rose-500/20 dark:bg-rose-500/10",
    accent: "#f43f5e",
    softAccent: "#fecdd3",
  },
  values: {
    badge:
      "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-100",
    panel:
      "border-amber-200/70 bg-amber-50/70 dark:border-amber-500/20 dark:bg-amber-500/10",
    accent: "#f59e0b",
    softAccent: "#fde68a",
  },
};

const roleProfiles = Object.values(PERSONALITY_ROLE_PROFILES);

export default function PersonalityAssessmentPage() {
  const searchParams = useSearchParams();
  const { settings } = useWorkspace();
  const theme = buildPublicFormTheme(settings.dashboardAccent);
  const accentRgb = toRgb(settings.dashboardAccent);
  const accentDeepRgb = toRgb(theme.accentHover);
  const linkedApplicationId = searchParams.get("application")?.trim() ?? "";
  const linkedFormId = searchParams.get("form")?.trim() ?? "";
  const storageKey = useMemo(
    () =>
      getWorkspaceScopedStorageKey(
        `personality-assessment-draft${linkedApplicationId ? `:${linkedApplicationId}` : ""}`,
        settings.workspaceId
      ),
    [linkedApplicationId, settings.workspaceId]
  );
  const workspaceHeaders = useMemo(
    () => buildWorkspaceApiHeaders(settings.workspaceId),
    [settings.workspaceId]
  );
  const [draft, setDraft] = useState<PersonalityAssessmentDraft>(
    buildDefaultPersonalityAssessmentDraft()
  );
  const [isHydrated, setIsHydrated] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
  const [linkedApplication, setLinkedApplication] = useState<HiringApplicationRecord | null>(
    null
  );
  const [linkedApplicationState, setLinkedApplicationState] = useState<
    "idle" | "loading" | "ready"
  >("idle");
  const [isSavingAssessment, setIsSavingAssessment] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [applicationLoadError, setApplicationLoadError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);

      if (raw) {
        setDraft(parsePersonalityAssessmentDraft(JSON.parse(raw)));
      }
    } catch {
      setDraft(buildDefaultPersonalityAssessmentDraft());
    } finally {
      setIsHydrated(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!linkedApplicationId) {
      setLinkedApplication(null);
      setLinkedApplicationState("idle");
      setApplicationLoadError(null);
      return;
    }

    let isActive = true;
    setLinkedApplicationState("loading");
    setApplicationLoadError(null);
    setSaveStatus("idle");
    setSaveError(null);

    async function loadLinkedApplication() {
      try {
        const response = await fetch(
          appendWorkspaceQuery(
            `/api/applications/${linkedApplicationId}/personality-assessment`,
            settings.workspaceId
          ),
          {
            cache: "no-store",
            headers: workspaceHeaders,
          }
        );
        const payload = (await response.json()) as {
          application?: HiringApplicationRecord;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || "I couldn't load that application.");
        }

        if (!isActive) {
          return;
        }

        const application = payload.application ?? null;
        setLinkedApplication(application);

        if (application?.personalityAssessment) {
          setDraft(
            buildPersonalityAssessmentDraftFromSnapshot(application.personalityAssessment)
          );
        }

        setLinkedApplicationState("ready");
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        setLinkedApplication(null);
        setLinkedApplicationState("ready");
        setApplicationLoadError(
          loadError instanceof Error
            ? loadError.message
            : "I couldn't load that application."
        );
      }
    }

    void loadLinkedApplication();

    return () => {
      isActive = false;
    };
  }, [linkedApplicationId, settings.workspaceId, workspaceHeaders]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      // Local persistence is a convenience only.
    }
  }, [draft, isHydrated, storageKey]);

  useEffect(() => {
    if (copyStatus !== "copied") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setCopyStatus("idle");
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  useEffect(() => {
    if (saveStatus !== "saved") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setSaveStatus("idle");
    }, 2200);

    return () => window.clearTimeout(timeout);
  }, [saveStatus]);

  const roleProfile = useMemo(
    () => getPersonalityRoleProfile(draft.roleId),
    [draft.roleId]
  );
  const snapshot = useMemo(() => scorePersonalityAssessment(draft), [draft]);
  const summaryText = useMemo(() => buildPersonalityAssessmentSummary(snapshot), [snapshot]);
  const fitTier = getPersonalityFitTier(snapshot.fitScore);
  const linkedPipelineUrl = useMemo(() => {
    if (!linkedApplicationId) {
      return "";
    }

    return appendWorkspaceQuery(
      `/pipeline?form=${encodeURIComponent(linkedApplication?.formId || linkedFormId)}&application=${encodeURIComponent(linkedApplicationId)}`,
      settings.workspaceId
    );
  }, [linkedApplication?.formId, linkedApplicationId, linkedFormId, settings.workspaceId]);
  const isReady = isHydrated;

  function updateDraft(updater: (current: PersonalityAssessmentDraft) => PersonalityAssessmentDraft) {
    setDraft((current) => updater(current));
  }

  function handleRoleChange(roleId: PersonalityRoleId) {
    updateDraft((current) => ({
      ...current,
      roleId,
    }));
  }

  function handleLoadSample() {
    updateDraft((current) => buildPersonalityAssessmentSampleDraft(current.roleId));
  }

  function handleReset() {
    updateDraft((current) => ({
      ...buildDefaultPersonalityAssessmentDraft(),
      roleId: current.roleId,
    }));
  }

  function handleResponseChange(scaleId: PersonalityScaleDefinition["id"], value: number) {
    updateDraft((current) => ({
      ...current,
      responses: {
        ...current.responses,
        [scaleId]: clamp(value, 1, 5),
      },
    }));
  }

  async function handleCopySummary() {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("idle");
    }
  }

  async function handleSaveToApplication() {
    if (!linkedApplicationId) {
      return;
    }

    setIsSavingAssessment(true);
    setSaveError(null);
    setSaveStatus("idle");

    try {
      const response = await fetch(
        appendWorkspaceQuery(
          `/api/applications/${linkedApplicationId}/personality-assessment`,
          settings.workspaceId
        ),
        {
          method: "PATCH",
          headers: {
            ...workspaceHeaders,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            assessment: snapshot,
          }),
        }
      );
      const payload = (await response.json()) as {
        application?: HiringApplicationRecord;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "I couldn't save that assessment.");
      }

      if (payload.application) {
        setLinkedApplication(payload.application);
      }

      setSaveStatus("saved");
    } catch (saveProblem) {
      setSaveError(
        saveProblem instanceof Error ? saveProblem.message : "I couldn't save that assessment."
      );
    } finally {
      setIsSavingAssessment(false);
    }
  }

  function handleDownloadSnapshot() {
    const exportPayload = {
      workspaceId: settings.workspaceId,
      organizationName: settings.organizationName,
      appName: settings.appName,
      generatedAt: new Date().toISOString(),
      assessment: snapshot,
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const fileName = slugify(snapshot.candidateName || roleProfile.label);

    link.href = url;
    link.download = `personality-assessment-${fileName}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <section
        className="relative overflow-hidden rounded-[4px] border border-slate-800/80 px-6 py-6 text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] sm:px-8 sm:py-8"
        style={{
          backgroundImage: [
            `radial-gradient(circle at top left, rgba(${accentRgb}, 0.28), transparent 28%)`,
            `radial-gradient(circle at 86% 20%, rgba(${accentDeepRgb}, 0.18), transparent 24%)`,
            "linear-gradient(180deg, rgba(9,13,30,0.98) 0%, rgba(7,10,24,0.98) 100%)",
          ].join(","),
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage: [
              "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
              "linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
            ].join(","),
            backgroundSize: "112px 112px",
            maskImage:
              "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.95) 28%, rgba(0,0,0,0.8) 100%)",
          }}
        />

        <div className="relative z-10 space-y-8">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <Badge accent={settings.dashboardAccent}>
                <ShootingStarIcon />
                Dedicated workspace page
              </Badge>
              <span className="inline-flex items-center rounded-[4px] border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">
                Hogan-inspired
              </span>
              <span className="inline-flex items-center rounded-[4px] border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">
                Stored locally
              </span>
            </div>

            <div className="max-w-3xl space-y-4">
              <h1 className="text-[2.4rem] font-semibold leading-[0.95] tracking-tight sm:text-6xl sm:leading-none">
                Personality signals, framed for hiring conversations.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-white/70 sm:text-base sm:leading-8">
                This screen turns the bright side, derailers, and values lens into a practical
                assessment workspace. Use it to structure follow-up interviews, spot stress
                patterns, and understand what keeps a candidate engaged.
              </p>
            </div>

            <div className="grid gap-3">
              {PERSONALITY_SCALE_SECTIONS.map((section) => (
                <article
                  key={section.id}
                  className="rounded-[4px] border border-white/10 bg-white/[0.05] p-4"
                >
                  <p
                    className={`inline-flex items-center rounded-[4px] border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${CATEGORY_TONES[section.id].badge}`}
                  >
                    {section.label}
                  </p>
                  <p className="mt-4 text-sm leading-7 text-white/68">{section.description}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-[4px] border border-white/12 bg-white/[0.06] p-5 shadow-[0_10px_28px_rgba(0,0,0,0.16)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">
                  Assessment controls
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  {isReady ? "Live draft" : "Loading saved draft..."}
                </h2>
                <p className="mt-2 text-sm leading-7 text-white/64">
                  Pick a role lens, label the candidate, and then tune the sliders to build a
                  profile.
                </p>
              </div>
              <span className="inline-flex items-center rounded-[4px] border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
                {fitTier} fit
              </span>
            </div>

            <div className="mt-5 space-y-4">
              <Field label="Candidate name or code">
                <input
                  value={draft.candidateName}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      candidateName: event.target.value,
                    }))
                  }
                  placeholder="Candidate A"
                  className="w-full rounded-[4px] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/34 focus:border-white/25 focus:bg-white/[0.08] focus:ring-4 focus:ring-white/10"
                />
              </Field>

              <Field label="Role lens">
                <select
                  value={draft.roleId}
                  onChange={(event) => handleRoleChange(event.target.value as PersonalityRoleId)}
                  className="w-full rounded-[4px] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none transition focus:border-white/25 focus:bg-white/[0.08] focus:ring-4 focus:ring-white/10"
                >
                  {roleProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id} className="text-slate-950">
                      {profile.label}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="rounded-[4px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                  Selected lens
                </p>
                <p className="mt-2 text-lg font-semibold text-white">{roleProfile.label}</p>
                <p className="mt-2 text-sm leading-7 text-white/64">{roleProfile.summary}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {roleProfile.emphasis.map((item) => (
                    <span
                      key={item}
                      className="rounded-[4px] border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-medium text-white/72"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleLoadSample}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-[4px] px-4 py-3 text-sm font-medium text-slate-950 transition hover:translate-y-[-1px]"
                  style={{
                    background: `linear-gradient(135deg, ${settings.dashboardAccent}, ${theme.accentHover})`,
                  }}
                >
                  <ShootingStarIcon />
                  Load sample profile
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex flex-1 items-center justify-center rounded-[4px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white transition hover:bg-white/[0.08]"
                >
                  Reset draft
                </button>
              </div>

              {linkedApplicationId ? (
                <div className="rounded-[4px] border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                        Linked application
                      </p>
                      <h3 className="mt-2 text-lg font-semibold text-white">
                        {linkedApplication?.applicant.fullName ||
                          linkedApplication?.analysis.result.candidateProfile.name ||
                          linkedApplicationId}
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-white/64">
                        {linkedApplication
                          ? `Form ${linkedApplication.formId} · ${linkedApplication.workflow.stage} stage`
                          : linkedApplicationState === "loading"
                            ? "Loading the candidate record..."
                            : "This assessment will save against the selected candidate record."}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center rounded-[4px] border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                      {linkedApplication?.personalityAssessment
                        ? `Saved ${getPersonalityFitTier(
                            linkedApplication.personalityAssessment.fitScore
                          )}`
                        : linkedApplicationState === "loading"
                          ? "Loading"
                          : "Unsaved"}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleSaveToApplication}
                      disabled={!isReady || linkedApplicationState === "loading" || isSavingAssessment}
                      className="inline-flex items-center justify-center rounded-[4px] px-4 py-3 text-sm font-medium text-slate-950 transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
                      style={{
                        background: `linear-gradient(135deg, ${settings.dashboardAccent}, ${theme.accentHover})`,
                      }}
                    >
                      {isSavingAssessment ? "Saving assessment..." : "Save to application"}
                    </button>
                    <Link
                      href={linkedPipelineUrl || "#"}
                      className="inline-flex items-center justify-center rounded-[4px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white transition hover:bg-white/[0.08]"
                    >
                      Open pipeline record
                    </Link>
                  </div>

                  <p className="mt-3 text-xs leading-6 text-white/55">
                    {applicationLoadError
                      ? applicationLoadError
                      : saveError
                        ? saveError
                        : saveStatus === "saved"
                          ? "Saved to the application record."
                          : linkedApplication?.personalityAssessment
                            ? "This assessment is already stored on the application record."
                            : "Keep refining the draft locally, then save it to the application when you are ready."}
                  </p>
                </div>
              ) : null}
            </div>

            <p className="mt-4 rounded-[4px] border border-white/10 bg-white/[0.04] px-4 py-3 text-xs leading-6 text-white/58">
              Prototype only. Use this as a structured interview aid and conversation starter,
              not as the only hiring decision.
            </p>

            <p className="mt-4 text-xs leading-6 text-white/45">
              {linkedApplicationId
                ? isReady
                  ? `Draft kept locally for application ${linkedApplicationId} and ready to sync with the candidate record.`
                  : "Restoring the draft for this application..."
                : isReady
                  ? `Saved locally in this browser for ${settings.organizationName}.`
                  : "Restoring your previous draft for this workspace."}
            </p>
          </div>
        </div>
      </section>

      <div className="space-y-6">
        <div className="space-y-6">
          {PERSONALITY_SCALE_SECTIONS.map((section) => (
            <section
              key={section.id}
              className={`overflow-hidden rounded-[4px] border p-5 shadow-[0_8px_20px_rgba(15,23,42,0.04)] sm:p-6 ${CATEGORY_TONES[section.id].panel} dark:shadow-none`}
            >
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p
                    className={`inline-flex items-center rounded-[4px] border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${CATEGORY_TONES[section.id].badge}`}
                  >
                    {section.label}
                  </p>
                  <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                    {section.description}
                  </h2>
                </div>
                <p className="max-w-sm text-sm leading-7 text-slate-600 dark:text-slate-300">
                  Slide each item to match what you are seeing in the candidate, then compare the
                  pattern against the selected role lens.
                </p>
              </div>

              <div className="mt-5 space-y-4">
                {section.scales.map((scale) => (
                  <QuestionCard
                    key={scale.id}
                    scale={scale}
                    value={draft.responses[scale.id]}
                    onChange={(nextValue) => handleResponseChange(scale.id, nextValue)}
                  />
                ))}
              </div>
            </section>
          ))}

          <section className="rounded-[4px] border border-slate-200 bg-white p-5 shadow-[0_8px_20px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  Recruiter notes
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                  Capture what to explore next
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                  Store the interview angle, calibration notes, or concerns right beside the
                  assessment so the whole conversation stays together.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleCopySummary}
                  className="inline-flex items-center gap-2 rounded-[4px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {copyStatus === "copied" ? <CheckLineIcon /> : <CopyIcon />}
                  {copyStatus === "copied" ? "Copied summary" : "Copy summary"}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSnapshot}
                  className="inline-flex items-center gap-2 rounded-[4px] border border-slate-200 bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-slate-800 dark:border-slate-700 dark:bg-slate-50 dark:text-slate-950 dark:hover:bg-white"
                >
                  <DownloadIcon />
                  Download JSON
                </button>
              </div>
            </div>

            <textarea
              value={draft.notes}
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              placeholder="Example: Probe for stakeholder communication, reaction to change, and how they respond to direct feedback."
              className="mt-5 min-h-32 w-full rounded-[4px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-slate-600 dark:focus:ring-slate-700/50"
            />
            <p className="mt-3 text-xs leading-6 text-slate-500 dark:text-slate-400">
              Notes are saved locally per workspace browser so you can come back and refine the
              profile later.
            </p>
          </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <section className="rounded-[4px] border border-slate-800 bg-slate-950 p-6 text-white shadow-[0_16px_40px_rgba(2,6,23,0.24)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/42">
                  Profile snapshot
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  {snapshot.candidateName || "Untitled profile"}
                </h2>
                <p className="mt-2 text-sm leading-7 text-white/62">{snapshot.role.summary}</p>
              </div>
                    <span className="inline-flex shrink-0 items-center rounded-[4px] border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                {fitTier}
              </span>
            </div>

            <div className="mt-6 flex justify-center">
              <FitRing
                fitScore={snapshot.fitScore}
                accent={settings.dashboardAccent}
                accentSoft={theme.accentHover}
              />
            </div>

            <div className="mt-6 grid gap-3">
              <SummaryMetric
                label="Bright side"
                value={snapshot.brightAverage}
                helper="Typical strengths when things are going well."
                accent={CATEGORY_TONES.bright.accent}
                band={getPersonalityScoreBand("bright", snapshot.brightAverage)}
              />
              <SummaryMetric
                label="Derailer risk"
                value={snapshot.derailerAverage}
                helper="What may appear under pressure or ambiguity."
                accent={CATEGORY_TONES.derailer.accent}
                band={getPersonalityScoreBand("derailer", snapshot.derailerAverage)}
              />
              <SummaryMetric
                label="Values"
                value={snapshot.valuesAverage}
                helper="What keeps the work motivating over time."
                accent={CATEGORY_TONES.values.accent}
                band={getPersonalityScoreBand("values", snapshot.valuesAverage)}
              />
            </div>
          </section>

          <section className="rounded-[4px] border border-slate-200 bg-white p-5 shadow-[0_8px_20px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Signals
            </p>
            <div className="mt-4 space-y-4">
              <SignalGroup
                title="Strengths"
                description="The clearest positive signals surfaced by the current answers."
                items={snapshot.strengths}
                emptyMessage="Answer a few bright-side questions or load a sample profile to surface strengths."
              />
              <SignalGroup
                title="Watch-outs"
                description="Traits worth probing more deeply in interview."
                items={snapshot.watchouts}
                emptyMessage="No elevated derailers yet. Add more profile detail to surface risk areas."
              />
              <SignalGroup
                title="Motivators"
                description="What appears to energize the candidate the most."
                items={snapshot.motivators}
                emptyMessage="Answer more values items to reveal what will keep this candidate engaged."
              />
            </div>
          </section>

          <section className="rounded-[4px] border border-slate-200 bg-white p-5 shadow-[0_8px_20px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Interview prompts
            </p>
            <div className="mt-4 space-y-3">
              {snapshot.prompts.map((prompt, index) => (
                <div
                  key={`${prompt}-${index}`}
                  className="rounded-[4px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                    Prompt {index + 1}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-slate-700 dark:text-slate-200">
                    {prompt}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-6 text-slate-500 dark:text-slate-400">
              Use these prompts to validate the numbers against real examples, not to replace the
              conversation.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function QuestionCard({
  scale,
  value,
  onChange,
}: {
  scale: PersonalityScaleDefinition;
  value: number;
  onChange: (nextValue: number) => void;
}) {
  const tone = CATEGORY_TONES[scale.category];
  const score = sliderValueToScore(value);
  const band = getPersonalityScoreBand(scale.category, score);

  return (
    <article className="rounded-[4px] border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 dark:border-slate-800 dark:bg-slate-950 dark:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-[4px] border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${tone.badge}`}
            >
              {scale.label}
            </span>
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
              {band}
            </span>
          </div>
          <p className="mt-3 text-base font-semibold leading-7 text-slate-950 dark:text-white">
            {scale.prompt}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
            {scale.detail}
          </p>
        </div>

        <div className="rounded-[4px] border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
          {score}/100
        </div>
      </div>

      <div className="mt-4">
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-current dark:bg-slate-800"
          style={{ accentColor: tone.accent }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-500">
        <span>{scale.lowLabel}</span>
        <span>{scale.highLabel}</span>
      </div>
    </article>
  );
}

function SignalGroup({
  title,
  description,
  items,
  emptyMessage,
}: {
  title: string;
  description: string;
  items: PersonalityScaleScore[];
  emptyMessage: string;
}) {
  const tone = items[0] ? CATEGORY_TONES[items[0].category] : CATEGORY_TONES.bright;

  return (
    <div className="rounded-[4px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950 dark:text-white">{title}</p>
          <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
            {description}
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-[4px] border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${tone.badge}`}
        >
          {items.length}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <ScaleRow key={item.id} item={item} />
          ))
        ) : (
          <p className="text-sm leading-7 text-slate-600 dark:text-slate-400">{emptyMessage}</p>
        )}
      </div>
    </div>
  );
}

function ScaleRow({ item }: { item: PersonalityScaleScore }) {
  const tone = CATEGORY_TONES[item.category];
  const band = getPersonalityScoreBand(item.category, item.score);

  return (
    <div className="space-y-2 rounded-[4px] border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">
            {item.label}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Target {item.target}% | Gap {item.gap}%
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-[4px] border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
          {band}
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full"
          style={{
            width: `${item.score}%`,
            background: `linear-gradient(90deg, ${tone.accent}, ${tone.softAccent})`,
          }}
        />
      </div>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  helper,
  accent,
  band,
}: {
  label: string;
  value: number;
  helper: string;
  accent: string;
  band: string;
}) {
  return (
    <div className="rounded-[4px] border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/42">
            {label}
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}%</p>
        </div>
        <span className="rounded-[4px] border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/72">
          {band}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-white/62">{helper}</p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full"
          style={{
            width: `${value}%`,
            background: `linear-gradient(90deg, ${accent}, rgba(255,255,255,0.85))`,
          }}
        />
      </div>
    </div>
  );
}

function FitRing({
  fitScore,
  accent,
  accentSoft,
}: {
  fitScore: number;
  accent: string;
  accentSoft: string;
}) {
  return (
    <div className="relative flex h-44 w-44 items-center justify-center rounded-full">
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(${accent} 0 ${fitScore}%, rgba(255,255,255,0.08) ${fitScore}% 100%)`,
          boxShadow: `0 0 0 1px rgba(255,255,255,0.08), inset 0 0 80px rgba(255,255,255,0.02)`,
        }}
      />
      <div
        className="absolute inset-[10px] rounded-full border border-white/10"
        style={{
          background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.05), rgba(7,10,24,0.96) 72%)`,
          boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.03), 0 0 40px ${accentSoft}`,
        }}
      />
      <div className="relative z-10 text-center">
        <p className="text-5xl font-semibold tracking-tight text-white">{fitScore}</p>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/50">
          fit score
        </p>
      </div>
    </div>
  );
}

function Badge({
  children,
  accent,
}: {
  children: ReactNode;
  accent: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-[4px] border border-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/78"
      style={{
        background: `linear-gradient(135deg, rgba(${toRgb(accent)}, 0.28), rgba(255,255,255,0.04))`,
      }}
    >
      {children}
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-white/78">{label}</span>
      {children}
    </label>
  );
}

function sliderValueToScore(value: number) {
  return clamp(Math.floor((value - 1) * 25), 0, 100);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "assessment";
}

function toRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const padded = normalized.length === 6 ? normalized : normalized.padEnd(6, "0");
  const red = Number.parseInt(padded.slice(0, 2), 16);
  const green = Number.parseInt(padded.slice(2, 4), 16);
  const blue = Number.parseInt(padded.slice(4, 6), 16);

  return `${red}, ${green}, ${blue}`;
}
