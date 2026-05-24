"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import CandidateInterviewScorecardPanel from "@/components/analyzer/CandidateInterviewScorecardPanel";
import CandidateWorkflowPanel from "@/components/analyzer/CandidateWorkflowPanel";
import { useWorkspace } from "@/context/WorkspaceContext";
import { describeHiringApplicationStage } from "@/lib/hiring-application-workflow";
import {
  DEFAULT_HIRING_FORM_SCREENING_POLICY,
  evaluateHiringApplicationFilter,
  normalizeHiringFormScreeningPolicy,
} from "@/lib/hiring-screening-policy";
import {
  appendWorkspaceQuery,
  buildWorkspaceApiHeaders,
} from "@/lib/workspace-settings";
import type {
  HiringApplicationRecord,
  HiringFormField,
  HiringFormFieldType,
  HiringFormDetail,
  HiringFormListItem,
} from "@/types/hiring-funnel";
import type { RoleSetup } from "@/types/document-intelligence";

type LoadState = "idle" | "loading" | "ready";
type PipelineTab = "create" | "review";
type BuilderView = "questions" | "templates";
type BuilderModal = "aiForm" | "jobDescription" | null;

type FormTemplateId = "blank" | "general" | "technical" | "customer";

export default function PipelineDashboardPage({
  initialForms = null,
  initialSelectedForm = null,
  initialSelectedFormId = "",
}: {
  initialForms?: HiringFormListItem[] | null;
  initialSelectedForm?: HiringFormDetail | null;
  initialSelectedFormId?: string;
}) {
  const searchParams = useSearchParams();
  const { settings } = useWorkspace();
  const [forms, setForms] = useState<HiringFormListItem[]>(initialForms ?? []);
  const [selectedFormId, setSelectedFormId] = useState(initialSelectedFormId);
  const [selectedForm, setSelectedForm] = useState<HiringFormDetail | null>(
    initialSelectedForm
  );
  const [selectedApplicationId, setSelectedApplicationId] = useState("");
  const [pipelineTab, setPipelineTab] = useState<PipelineTab>("create");
  const [builderView, setBuilderView] = useState<BuilderView>("questions");
  const [loadState, setLoadState] = useState<LoadState>(
    initialForms ? "ready" : "loading"
  );
  const [detailState, setDetailState] = useState<LoadState>(
    initialSelectedForm ? "ready" : initialSelectedFormId ? "loading" : "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [editingFormId, setEditingFormId] = useState("");
  const [isPublishingToggle, setIsPublishingToggle] = useState(false);

  const [title, setTitle] = useState("");
  const [team, setTeam] = useState("");
  const [intro, setIntro] = useState("");
  const [analysisGoal, setAnalysisGoal] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [roleSeniority, setRoleSeniority] = useState("");
  const [roleLocation, setRoleLocation] = useState("");
  const [roleSummary, setRoleSummary] = useState("");
  const [mustHaveSkills, setMustHaveSkills] = useState("");
  const [niceToHaveSkills, setNiceToHaveSkills] = useState("");
  const [interviewFocus, setInterviewFocus] = useState("");
  const [formFields, setFormFields] = useState<HiringFormField[]>([]);
  const [draggedFieldId, setDraggedFieldId] = useState("");
  const [activeBuilderTarget, setActiveBuilderTarget] = useState<string>("empty");
  const [expiresAt, setExpiresAt] = useState("");
  const [jobDescriptionFile, setJobDescriptionFile] = useState<File | null>(null);
  const [jobDescriptionDraftText, setJobDescriptionDraftText] = useState("");
  const [jobDescriptionDraftName, setJobDescriptionDraftName] = useState("");
  const [jdGenerationNote, setJdGenerationNote] = useState("");
  const [isGeneratingJd, setIsGeneratingJd] = useState(false);
  const [aiFormPrompt, setAiFormPrompt] = useState("");
  const [formGenerationNote, setFormGenerationNote] = useState("");
  const [isGeneratingFormDraft, setIsGeneratingFormDraft] = useState(false);
  const [activeBuilderModal, setActiveBuilderModal] = useState<BuilderModal>(null);
  const [copyLinkState, setCopyLinkState] = useState<"idle" | "copying" | "copied">("idle");
  const [isPreparingExport, setIsPreparingExport] = useState(false);
  const [autoFilterLowRoleMatch, setAutoFilterLowRoleMatch] = useState(
    DEFAULT_HIRING_FORM_SCREENING_POLICY.autoFilterLowRoleMatch
  );
  const [minimumRoleMatchScore, setMinimumRoleMatchScore] = useState(
    DEFAULT_HIRING_FORM_SCREENING_POLICY.minimumRoleMatchScore
  );
  const [showFilteredApplications, setShowFilteredApplications] = useState(false);
  const currentRoleSetup = useMemo(
    () =>
      buildRoleSetup({
        roleTitle,
        roleSeniority,
        roleLocation,
        roleSummary,
        mustHaveSkills,
        niceToHaveSkills,
        interviewFocus,
      }),
    [
      interviewFocus,
      mustHaveSkills,
      niceToHaveSkills,
      roleLocation,
      roleSeniority,
      roleSummary,
      roleTitle,
    ]
  );
  const canGenerateJobDescription = useMemo(
    () =>
      Boolean(
        title.trim() ||
          team.trim() ||
          intro.trim() ||
          analysisGoal.trim() ||
          currentRoleSetup.title ||
          currentRoleSetup.seniority ||
          currentRoleSetup.location ||
          currentRoleSetup.summary ||
          currentRoleSetup.mustHaveSkills.length > 0 ||
          currentRoleSetup.niceToHaveSkills.length > 0 ||
          currentRoleSetup.interviewFocus.length > 0
      ),
    [analysisGoal, currentRoleSetup, intro, team, title]
  );
  const canGenerateFormDraft = useMemo(
    () => Boolean(aiFormPrompt.trim() || canGenerateJobDescription),
    [aiFormPrompt, canGenerateJobDescription]
  );
  const isBuilderBusy = isSubmitting || isGeneratingFormDraft || isGeneratingJd;
  const builderBusyMessage = isSubmitting
    ? editingFormId
      ? "Saving form changes and refreshing the shared workspace view..."
      : "Publishing the form and preparing the shared review view..."
    : isGeneratingFormDraft
      ? "Generating an editable form draft from your role brief..."
      : isGeneratingJd
        ? "Generating a job description draft from your role context..."
        : "";
  const jobDescriptionDraftLength = jobDescriptionDraftText.trim().length;

  const selectedFormScreeningPolicy = useMemo(
    () => normalizeHiringFormScreeningPolicy(selectedForm?.screeningPolicy),
    [selectedForm?.screeningPolicy]
  );
  const applicationFilterResults = useMemo(
    () =>
      new Map(
        (selectedForm?.applications ?? []).map((application) => [
          application.id,
          evaluateHiringApplicationFilter(application, selectedFormScreeningPolicy),
        ])
      ),
    [selectedForm?.applications, selectedFormScreeningPolicy]
  );
  const primaryQueueApplications = useMemo(
    () =>
      (selectedForm?.applications ?? []).filter(
        (application) => !applicationFilterResults.get(application.id)?.autoFiltered
      ),
    [applicationFilterResults, selectedForm?.applications]
  );
  const filteredOutApplications = useMemo(
    () =>
      (selectedForm?.applications ?? []).filter(
        (application) => applicationFilterResults.get(application.id)?.autoFiltered
      ),
    [applicationFilterResults, selectedForm?.applications]
  );
  const visibleApplications = useMemo(
    () =>
      showFilteredApplications
        ? selectedForm?.applications ?? []
        : primaryQueueApplications,
    [primaryQueueApplications, selectedForm?.applications, showFilteredApplications]
  );
  const selectedApplication = useMemo(
    () =>
      visibleApplications.find((item) => item.id === selectedApplicationId) ??
      visibleApplications[0] ??
      null,
    [selectedApplicationId, visibleApplications]
  );
  const totalApplications = useMemo(
    () => forms.reduce((sum, item) => sum + item.applicationCount, 0),
    [forms]
  );
  const activeForms = useMemo(
    () => forms.filter((item) => item.status === "active").length,
    [forms]
  );
  const workspaceHeaders = useMemo(
    () => buildWorkspaceApiHeaders(settings.workspaceId),
    [settings.workspaceId]
  );
  const requestedFormId = searchParams.get("form")?.trim() ?? "";
  const requestedApplicationId = searchParams.get("application")?.trim() ?? "";
  const refreshForms = useCallback(async (nextSelectedFormId?: string) => {
    setLoadState("loading");
    setError(null);

    try {
      const response = await fetch(
        appendWorkspaceQuery("/api/forms", settings.workspaceId),
        {
          cache: "no-store",
          headers: workspaceHeaders,
        }
      );
      const payload = (await response.json()) as { forms?: HiringFormListItem[]; error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "I couldn't load the hiring pipeline.");
      }

      const nextForms = payload.forms ?? [];
      const targetId =
        nextSelectedFormId || requestedFormId || selectedFormId || nextForms[0]?.id || "";

      setForms(nextForms);
      setSelectedFormId(targetId);

      if (nextForms.length === 0) {
        setPipelineTab("create");
      }

      setLoadState("ready");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "I couldn't load the hiring pipeline."
      );
      setLoadState("ready");
    }
  }, [requestedFormId, selectedFormId, settings.workspaceId, workspaceHeaders]);

  const loadFormDetail = useCallback(async (formId: string) => {
    setDetailState("loading");
    setError(null);
    setSelectedForm(null);
    setSelectedApplicationId("");
    setShowFilteredApplications(false);

    try {
      const response = await fetch(
        appendWorkspaceQuery(`/api/forms/${formId}`, settings.workspaceId),
        {
          cache: "no-store",
          headers: workspaceHeaders,
        }
      );
      const payload = (await response.json()) as { form?: HiringFormDetail; error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "I couldn't load that form.");
      }

      const nextForm = payload.form ?? null;
      setSelectedForm(nextForm);
      const requestedApplicationMatches =
        requestedApplicationId &&
        nextForm?.applications.some((item) => item.id === requestedApplicationId);
      setSelectedApplicationId(
        requestedApplicationMatches
          ? requestedApplicationId
          : nextForm?.applications[0]?.id || ""
      );
      setDetailState("ready");
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "I couldn't load that form."
      );
      setDetailState("ready");
    }
  }, [requestedApplicationId, settings.workspaceId, workspaceHeaders]);

  useEffect(() => {
    if (initialForms) {
      return;
    }

    void refreshForms();
  }, [initialForms, refreshForms]);

  useEffect(() => {
    if (!requestedFormId || requestedFormId === selectedFormId) {
      return;
    }

    if (forms.some((form) => form.id === requestedFormId)) {
      setSelectedFormId(requestedFormId);
    }
  }, [forms, requestedFormId, selectedFormId]);

  useEffect(() => {
    if (!selectedFormId) {
      setSelectedForm(null);
      setDetailState("idle");
      return;
    }

    if (
      initialSelectedForm &&
      selectedFormId === initialSelectedForm.id &&
      selectedForm?.id === initialSelectedForm.id
    ) {
      return;
    }

    void loadFormDetail(selectedFormId);
  }, [initialSelectedForm, loadFormDetail, selectedForm, selectedFormId]);

  useEffect(() => {
    if (!initialSelectedForm) {
      return;
    }

    const requestedApplicationMatches =
      requestedApplicationId &&
      initialSelectedForm.applications.some((item) => item.id === requestedApplicationId);

    setSelectedApplicationId(
      requestedApplicationMatches
        ? requestedApplicationId
        : initialSelectedForm.applications[0]?.id || ""
    );
  }, [initialSelectedForm, requestedApplicationId]);

  useEffect(() => {
    setCopyLinkState("idle");
  }, [selectedFormId]);

  useEffect(() => {
    if (pipelineTab !== "create") {
      setActiveBuilderModal(null);
    }
  }, [pipelineTab]);

  useEffect(() => {
    if (!activeBuilderModal) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveBuilderModal(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeBuilderModal]);

  async function handleSaveForm() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      const jdDraftText = jobDescriptionDraftText.trim();
      const screeningPolicy = normalizeHiringFormScreeningPolicy({
        autoFilterLowRoleMatch,
        minimumRoleMatchScore,
      });
      formData.set("title", title.trim());
      formData.set("team", team.trim());
      formData.set("intro", intro.trim());
      formData.set("analysisGoal", analysisGoal.trim());
      formData.set("roleSetup", JSON.stringify(currentRoleSetup));
      formData.set("screeningPolicy", JSON.stringify(screeningPolicy));
      const publishFields = prepareFieldsForPublish(formFields);
      formData.set("customQuestions", JSON.stringify(buildCustomQuestionsFromFields(publishFields)));
      formData.set("formFields", JSON.stringify(publishFields));

      if (expiresAt) {
        formData.set("expiresAt", expiresAt);
      }

      if (jobDescriptionFile) {
        formData.set("jobDescriptionFile", jobDescriptionFile);
      } else if (jdDraftText) {
        formData.set("jobDescriptionText", jdDraftText);
        formData.set(
          "jobDescriptionFileName",
          jobDescriptionDraftName.trim() ||
            buildGeneratedJobDescriptionFileName(title, currentRoleSetup.title)
        );
      }

      const endpoint = editingFormId
        ? `/api/forms/${editingFormId}`
        : "/api/forms";
      const response = await fetch(appendWorkspaceQuery(endpoint, settings.workspaceId), {
        method: editingFormId ? "PATCH" : "POST",
        headers: workspaceHeaders,
        body: formData,
      });
      const payload = (await response.json()) as {
        form?: HiringFormListItem;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "I couldn't save that hiring form.");
      }

      const savedFormId = payload.form?.id || editingFormId;
      resetBuilder();
      setPipelineTab("review");
      await refreshForms(savedFormId);
      if (savedFormId) {
        await loadFormDetail(savedFormId);
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "I couldn't save that hiring form."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGenerateJobDescription() {
    if (isGeneratingJd || !canGenerateJobDescription) {
      return;
    }

    setIsGeneratingJd(true);
    setError(null);

    try {
      const response = await fetch(
        appendWorkspaceQuery("/api/forms/generate-jd", settings.workspaceId),
        {
          method: "POST",
          headers: {
            ...workspaceHeaders,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: title.trim(),
            team: team.trim(),
            intro: intro.trim(),
            analysisGoal: analysisGoal.trim(),
            roleSetup: currentRoleSetup,
          }),
        }
      );
      const payload = (await response.json()) as {
        jobDescription?: string;
        provider?: "local" | "gemini" | "huggingface";
        providerDetail?: string;
        providerWarnings?: string[];
        error?: string;
      };

      if (!response.ok || !payload.jobDescription?.trim()) {
        throw new Error(payload.error || "I couldn't generate a job description.");
      }

      setJobDescriptionFile(null);
      setJobDescriptionDraftText(payload.jobDescription.trim());
      setJobDescriptionDraftName(
        buildGeneratedJobDescriptionFileName(title, currentRoleSetup.title)
      );
      setJdGenerationNote(
        describeGeneratedJobDescription(
          payload.provider || "local",
          payload.providerDetail,
          payload.providerWarnings
        )
      );
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "I couldn't generate a job description."
      );
    } finally {
      setIsGeneratingJd(false);
    }
  }

  async function handleGenerateFormDraft() {
    if (isGeneratingFormDraft || !canGenerateFormDraft) {
      return;
    }

    setIsGeneratingFormDraft(true);
    setError(null);

    try {
      const response = await fetch(
        appendWorkspaceQuery("/api/forms/generate-draft", settings.workspaceId),
        {
          method: "POST",
          headers: {
            ...workspaceHeaders,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: title.trim(),
            team: team.trim(),
            intro: intro.trim(),
            analysisGoal: analysisGoal.trim(),
            prompt: aiFormPrompt.trim(),
            roleSetup: currentRoleSetup,
          }),
        }
      );
      const payload = (await response.json()) as {
        draft?: {
          title: string;
          team: string;
          intro: string;
          analysisGoal: string;
          roleSetup: RoleSetup;
          formFields: HiringFormField[];
        };
        provider?: "local" | "gemini" | "huggingface";
        providerDetail?: string;
        providerWarnings?: string[];
        error?: string;
      };

      if (!response.ok || !payload.draft) {
        throw new Error(payload.error || "I couldn't generate a form draft.");
      }

      applyGeneratedFormDraft(payload.draft);
      setFormGenerationNote(
        describeGeneratedFormDraft(
          payload.provider || "local",
          payload.providerDetail,
          payload.providerWarnings
        )
      );
      setBuilderView("questions");
      setActiveBuilderModal(null);
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "I couldn't generate a form draft."
      );
    } finally {
      setIsGeneratingFormDraft(false);
    }
  }

  function applyGeneratedFormDraft(draft: {
    title: string;
    team: string;
    intro: string;
    analysisGoal: string;
    roleSetup: RoleSetup;
    formFields: HiringFormField[];
  }) {
    setTitle(draft.title);
    setTeam(draft.team);
    setIntro(draft.intro);
    setAnalysisGoal(draft.analysisGoal);
    setRoleTitle(draft.roleSetup.title);
    setRoleSeniority(draft.roleSetup.seniority);
    setRoleLocation(draft.roleSetup.location);
    setRoleSummary(draft.roleSetup.summary);
    setMustHaveSkills(draft.roleSetup.mustHaveSkills.join("\n"));
    setNiceToHaveSkills(draft.roleSetup.niceToHaveSkills.join("\n"));
    setInterviewFocus(draft.roleSetup.interviewFocus.join("\n"));
    const hydratedFields = hydrateGeneratedFormFields(draft.formFields);
    setFormFields(hydratedFields);
    setActiveBuilderTarget(hydratedFields[0]?.id || "empty");
  }

  function clearFormGenerationState() {
    setAiFormPrompt("");
    setFormGenerationNote("");
  }

  function clearJobDescriptionState() {
    setJobDescriptionFile(null);
    setJobDescriptionDraftText("");
    setJobDescriptionDraftName("");
    setJdGenerationNote("");
  }

  async function handleCopyPublicLink(publicUrl: string) {
    if (copyLinkState === "copying") {
      return;
    }

    setCopyLinkState("copying");

    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopyLinkState("copied");
      window.setTimeout(() => setCopyLinkState("idle"), 1800);
    } catch {
      setCopyLinkState("idle");
      setError("I couldn't copy that public form link right now.");
    }
  }

  function handleExportResponses(formId: string) {
    setIsPreparingExport(true);
    window.location.assign(
      appendWorkspaceQuery(`/api/forms/${formId}?export=csv`, settings.workspaceId)
    );
    window.setTimeout(() => setIsPreparingExport(false), 1800);
  }

  async function handleDeleteApplication(applicationId: string) {
    setIsDeleting(applicationId);
    setError(null);

    try {
      const response = await fetch(
        appendWorkspaceQuery(`/api/applications/${applicationId}`, settings.workspaceId),
        {
        method: "DELETE",
          headers: workspaceHeaders,
        }
      );
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "I couldn't delete that application.");
      }

      if (selectedApplicationId === applicationId) {
        setSelectedApplicationId("");
      }

      if (selectedFormId) {
        await Promise.all([refreshForms(selectedFormId), loadFormDetail(selectedFormId)]);
      }
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "I couldn't delete that application."
      );
    } finally {
      setIsDeleting(null);
    }
  }

  function handleApplicationUpdated(updatedApplication: HiringApplicationRecord) {
    setSelectedForm((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        applications: current.applications.map((application) =>
          application.id === updatedApplication.id ? updatedApplication : application
        ),
      };
    });
  }

  async function handleDeleteForm(formId: string) {
    setIsDeleting(formId);
    setError(null);

    try {
      const response = await fetch(
        appendWorkspaceQuery(`/api/forms/${formId}`, settings.workspaceId),
        {
        method: "DELETE",
          headers: workspaceHeaders,
        }
      );
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "I couldn't delete that form.");
      }

      const nextForms = forms.filter((item) => item.id !== formId);
      const nextSelected = nextForms[0]?.id || "";
      setSelectedApplicationId("");
      setSelectedForm(null);
      await refreshForms(nextSelected);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "I couldn't delete that form."
      );
    } finally {
      setIsDeleting(null);
    }
  }

  function resetBuilder() {
    setActiveBuilderModal(null);
    setEditingFormId("");
    setTitle("");
    setTeam("");
    setIntro("");
    setAnalysisGoal("");
    setRoleTitle("");
    setRoleSeniority("");
    setRoleLocation("");
    setRoleSummary("");
    setMustHaveSkills("");
    setNiceToHaveSkills("");
    setInterviewFocus("");
    setFormFields([]);
    setDraggedFieldId("");
    setActiveBuilderTarget("empty");
    setExpiresAt("");
    clearFormGenerationState();
    clearJobDescriptionState();
    setAutoFilterLowRoleMatch(DEFAULT_HIRING_FORM_SCREENING_POLICY.autoFilterLowRoleMatch);
    setMinimumRoleMatchScore(DEFAULT_HIRING_FORM_SCREENING_POLICY.minimumRoleMatchScore);
  }

  function editSelectedForm(form: HiringFormDetail) {
    setActiveBuilderModal(null);
    const nextScreeningPolicy = normalizeHiringFormScreeningPolicy(form.screeningPolicy);
    setEditingFormId(form.id);
    setTitle(form.title);
    setTeam(form.team);
    setIntro(form.intro);
    setAnalysisGoal(form.analysisGoal);
    setRoleTitle(form.roleSetup.title);
    setRoleSeniority(form.roleSetup.seniority);
    setRoleLocation(form.roleSetup.location);
    setRoleSummary(form.roleSetup.summary);
    setMustHaveSkills(form.roleSetup.mustHaveSkills.join("\n"));
    setNiceToHaveSkills(form.roleSetup.niceToHaveSkills.join("\n"));
    setInterviewFocus(form.roleSetup.interviewFocus.join("\n"));
    clearFormGenerationState();
    setFormFields(
      form.formFields.filter(
        (field) =>
          field.systemKey !== "fullName" &&
          field.systemKey !== "email" &&
          field.systemKey !== "resumeFile"
      )
    );
    setExpiresAt(form.expiresAt ? toDateInputValue(form.expiresAt) : "");
    setJobDescriptionFile(null);
    setJobDescriptionDraftText(form.jdAttachment?.text || "");
    setJobDescriptionDraftName(form.jdAttachment?.fileName || "");
    setJdGenerationNote(
      form.jdAttachment
        ? "The current attached JD is loaded below, so you can review or edit it before saving."
        : ""
    );
    setAutoFilterLowRoleMatch(nextScreeningPolicy.autoFilterLowRoleMatch);
    setMinimumRoleMatchScore(nextScreeningPolicy.minimumRoleMatchScore);
    setBuilderView("questions");
    setPipelineTab("create");
  }

  async function toggleSelectedFormPublished(form: HiringFormDetail) {
    if (isPublishingToggle) {
      return;
    }

    setIsPublishingToggle(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("action", "set-published");
      formData.set("published", form.status === "unpublished" ? "true" : "false");

      const response = await fetch(
        appendWorkspaceQuery(`/api/forms/${form.id}`, settings.workspaceId),
        {
          method: "PATCH",
          headers: workspaceHeaders,
          body: formData,
        }
      );
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "I couldn't update publishing status.");
      }

      await Promise.all([refreshForms(form.id), loadFormDetail(form.id)]);
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "I couldn't update publishing status."
      );
    } finally {
      setIsPublishingToggle(false);
    }
  }

  function applyTemplate(templateId: FormTemplateId) {
    setFormFields(buildTemplateFields(templateId));
    setBuilderView("questions");
  }

  function addField(
    type: HiringFormFieldType = "short_text",
    targetFieldId = activeBuilderTarget
  ) {
    const nextField = {
        id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        label: "Untitled question",
        placeholder: "",
        helper: "",
        required: false,
        type,
        options: isChoiceFieldType(type) ? ["Option 1"] : [],
      } satisfies HiringFormField;

    setFormFields((current) => {
      const targetIndex = current.findIndex((field) => field.id === targetFieldId);

      if (targetIndex < 0) {
        return [...current, nextField];
      }

      const next = [...current];
      next.splice(targetIndex + 1, 0, nextField);
      return next;
    });
    setActiveBuilderTarget(nextField.id);
  }

  function updateField(fieldId: string, patch: Partial<HiringFormField>) {
    setFormFields((current) =>
      current.map((field) => (field.id === fieldId ? { ...field, ...patch } : field))
    );
  }

  function removeField(fieldId: string) {
    setFormFields((current) =>
      current.filter(
        (field) =>
          field.id !== fieldId ||
          field.systemKey === "fullName" ||
          field.systemKey === "email" ||
          field.systemKey === "resumeFile"
      )
    );
  }

  function duplicateField(fieldId: string) {
    setFormFields((current) => {
      const index = current.findIndex((field) => field.id === fieldId);
      const field = current[index];

      if (!field || field.systemKey) {
        return current;
      }

      const next = [...current];
      next.splice(index + 1, 0, {
        ...field,
        id: `field-${Date.now()}`,
        label: `${field.label} copy`,
      });
      return next;
    });
  }

  function moveField(fieldId: string, direction: -1 | 1) {
    setFormFields((current) => {
      const index = current.findIndex((field) => field.id === fieldId);
      const nextIndex = index + direction;

      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [field] = next.splice(index, 1);
      next.splice(nextIndex, 0, field);
      return next;
    });
  }

  function moveDraggedField(targetFieldId: string) {
    if (!draggedFieldId || draggedFieldId === targetFieldId) {
      return;
    }

    setFormFields((current) => {
      const draggedIndex = current.findIndex((field) => field.id === draggedFieldId);
      const targetIndex = current.findIndex((field) => field.id === targetFieldId);

      if (draggedIndex < 0 || targetIndex < 0) {
        return current;
      }

      const next = [...current];
      const [field] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, field);
      return next;
    });
  }

  return (
    <div className="w-full space-y-6 py-6 sm:py-8 md:py-10">
      <section className="overflow-hidden rounded-xl border border-[var(--workspace-form-border)] bg-white shadow-[0_12px_40px_rgba(103,58,183,0.08)] dark:border-gray-800 dark:bg-gray-900">
        <div className="h-3 bg-[var(--workspace-form-accent)]" />
        <div className="space-y-5 bg-[var(--workspace-form-page)] px-5 py-5 dark:bg-gray-900 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                Hiring funnel
              </p>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight text-[var(--workspace-form-title)] dark:text-white sm:text-3xl">
                  {settings.organizationName} hiring intake and response review
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-[var(--workspace-form-muted)] dark:text-gray-300">
                  Build a public application form, publish it with one link, review submissions,
                  export spreadsheet-ready data, and download every submitted CV.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <MetaTag label={`${forms.length} forms`} />
              <MetaTag label={`${activeForms} active`} />
              <MetaTag label={`${totalApplications} submissions`} />
            </div>
          </div>

          <div className="border-b border-[var(--workspace-form-border-soft)] dark:border-gray-800">
            <div className="flex gap-6 overflow-x-auto pb-1">
              <TopTabButton
                isActive={pipelineTab === "create"}
                onClick={() => setPipelineTab("create")}
              >
                Form creation
              </TopTabButton>
              <TopTabButton
                isActive={pipelineTab === "review"}
                onClick={() => setPipelineTab("review")}
              >
                Submitted forms
              </TopTabButton>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-[var(--workspace-form-danger-border)] bg-[var(--workspace-form-danger-bg)] px-4 py-3 text-sm text-[var(--workspace-form-danger-text)] dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-200">
          {error}
        </div>
      ) : null}

      {pipelineTab === "create" ? (
        <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
          <article className="self-start rounded-xl border border-[var(--workspace-form-border)] bg-[var(--workspace-form-page)] p-4 shadow-[0_8px_30px_rgba(103,58,183,0.06)] dark:border-gray-800 dark:bg-gray-900 sm:p-6">
            <div className="space-y-4">
              {isBuilderBusy ? (
                <div className="flex items-start gap-3 rounded-lg border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] px-4 py-3 text-sm text-[var(--workspace-form-muted)] dark:border-gray-800 dark:bg-gray-950/60 dark:text-gray-300">
                  <InlineLoader />
                  <span>{builderBusyMessage}</span>
                </div>
              ) : null}

              {editingFormId ? (
                <div className="rounded-lg border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] px-4 py-3 text-sm text-[var(--workspace-form-muted)] dark:border-gray-800 dark:bg-gray-950/60 dark:text-gray-300">
                  Editing published form. Saving changes updates the same public link.
                </div>
              ) : null}

              <div className="rounded-xl border border-[var(--workspace-form-border)] bg-white shadow-[0_2px_8px_rgba(60,64,67,0.12)] dark:border-gray-800 dark:bg-gray-950">
                <div className="h-2.5 rounded-t-xl bg-[var(--workspace-form-accent)]" />
                <div className="space-y-4 p-5 sm:p-6">
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Untitled form"
                    className="w-full border-0 border-b border-[var(--workspace-form-border-soft)] bg-transparent px-0 py-2 text-3xl font-normal text-[var(--workspace-form-title)] outline-hidden transition placeholder:text-gray-400 focus:border-[var(--workspace-form-accent)] dark:text-white"
                  />
                  <textarea
                    value={intro}
                    onChange={(event) => setIntro(event.target.value)}
                    placeholder="Form description"
                    className="min-h-16 w-full resize-none border-0 border-b border-[var(--workspace-form-border-soft)] bg-transparent px-0 py-2 text-sm text-[var(--workspace-form-muted)] outline-hidden transition placeholder:text-gray-400 focus:border-[var(--workspace-form-accent)] dark:text-gray-300"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={team}
                      onChange={(event) => setTeam(event.target.value)}
                      placeholder="Team"
                      className={inputClassName}
                    />
                    <input
                      type="date"
                      value={expiresAt}
                      onChange={(event) => setExpiresAt(event.target.value)}
                      className={inputClassName}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-center border-b border-[var(--workspace-form-border-soft)]">
                <button
                  type="button"
                  onClick={() => setBuilderView("questions")}
                  disabled={isBuilderBusy}
                  className={`px-5 py-3 text-sm font-medium ${
                    builderView === "questions"
                      ? "border-b-2 border-[var(--workspace-form-accent)] text-[var(--workspace-form-accent)]"
                      : "text-[var(--workspace-form-muted)]"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  Questions
                </button>
                <button
                  type="button"
                  onClick={() => setBuilderView("templates")}
                  disabled={isBuilderBusy}
                  className={`px-5 py-3 text-sm font-medium ${
                    builderView === "templates"
                      ? "border-b-2 border-[var(--workspace-form-accent)] text-[var(--workspace-form-accent)]"
                      : "text-[var(--workspace-form-muted)]"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  Select template
                </button>
              </div>

              {builderView === "templates" ? (
                <div className="rounded-xl border border-[var(--workspace-form-border)] bg-white p-5 shadow-[0_2px_8px_rgba(60,64,67,0.08)] dark:border-gray-800 dark:bg-gray-950">
                  <p className="text-lg font-semibold text-[var(--workspace-form-title)] dark:text-white">
                    Choose a template
                  </p>
                  <p className="mt-1 text-sm text-[var(--workspace-form-muted)] dark:text-gray-400">
                    Pick one only if you want a quick start. Otherwise return to Questions and
                    build from scratch.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {formTemplates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => applyTemplate(template.id)}
                        disabled={isBuilderBusy}
                        className="rounded-xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-4 text-left text-sm font-medium text-[var(--workspace-form-title)] transition hover:border-[var(--workspace-form-accent)] hover:bg-[var(--workspace-form-surface-strong)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900/70 dark:text-white"
                      >
                        {template.label}
                        <span className="mt-2 block text-xs font-normal leading-5 text-[var(--workspace-form-muted)] dark:text-gray-400">
                          {template.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
              <div className="space-y-3">
                  {formFields.length === 0 ? (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setActiveBuilderTarget("empty")}
                      onFocus={() => setActiveBuilderTarget("empty")}
                      className={`relative rounded-xl border border-dashed border-[var(--workspace-form-border)] bg-white p-8 text-center text-sm text-[var(--workspace-form-muted)] shadow-[0_2px_8px_rgba(60,64,67,0.08)] outline-hidden transition focus:border-[var(--workspace-form-accent)] dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 ${
                        activeBuilderTarget === "empty" ? "z-20" : "z-0"
                      }`}
                    >
                      Start with a blank form. Tap here, then use the floating tools to add your
                      first question, or use Select template if you want a quick start.
                      <ContextualBuilderToolbar
                        isVisible={activeBuilderTarget === "empty"}
                        onAddLongText={() => addField("long_text", "empty")}
                        onAddQuestion={() => addField("short_text", "empty")}
                      />
                    </div>
                  ) : (
                    formFields.map((field, index) => (
                      <FormFieldBuilderCard
                        key={field.id}
                        isActive={activeBuilderTarget === field.id}
                        field={field}
                        index={index}
                        total={formFields.length}
                        onActivate={setActiveBuilderTarget}
                        onAddField={addField}
                        onUpdate={updateField}
                        onRemove={removeField}
                        onDuplicate={duplicateField}
                        onMove={moveField}
                        onDragStart={setDraggedFieldId}
                        onDragEnter={moveDraggedField}
                        onDragEnd={() => setDraggedFieldId("")}
                      />
                    ))
                  )}
              </div>
              )}

            <div className="flex flex-col gap-3 border-t border-[var(--workspace-form-border-soft)] pt-5 dark:border-gray-800 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={resetBuilder}
                disabled={isBuilderBusy}
                className="inline-flex w-full items-center justify-center rounded-lg border border-[var(--workspace-form-border)] bg-white px-4 py-3 text-sm font-medium text-[var(--workspace-form-muted)] transition hover:bg-[var(--workspace-form-surface)] dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/5 sm:w-auto"
              >
                Reset draft
              </button>
              <button
                type="button"
                onClick={handleSaveForm}
                disabled={!title.trim() || isBuilderBusy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--workspace-form-accent)] px-5 py-3 text-sm font-medium text-[var(--workspace-form-accent-text)] shadow-theme-xs transition hover:bg-[var(--workspace-form-accent-muted)] disabled:cursor-not-allowed disabled:bg-[var(--workspace-form-border)] sm:w-auto"
              >
                {isSubmitting ? <InlineLoader className="h-4 w-4" /> : null}
                {isSubmitting
                  ? editingFormId
                    ? "Saving changes..."
                    : "Publishing form..."
                  : editingFormId
                    ? "Save changes"
                    : "Publish form"}
              </button>
            </div>
            </div>
          </article>
          <section className="rounded-xl border border-[var(--workspace-form-border)] bg-[var(--workspace-form-page)] p-4 shadow-[0_8px_30px_rgba(103,58,183,0.06)] dark:border-gray-800 dark:bg-gray-900 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setActiveBuilderModal("aiForm")}
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center rounded-lg border border-[var(--workspace-form-border)] bg-white px-4 py-3 text-sm font-medium text-[var(--workspace-form-title)] transition hover:bg-[var(--workspace-form-surface)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-transparent dark:text-gray-100 dark:hover:bg-white/5 sm:w-auto"
              >
                Generate form with AI
              </button>
              <button
                type="button"
                onClick={() => setActiveBuilderModal("jobDescription")}
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center rounded-lg border border-[var(--workspace-form-border)] bg-white px-4 py-3 text-sm font-medium text-[var(--workspace-form-title)] transition hover:bg-[var(--workspace-form-surface)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-transparent dark:text-gray-100 dark:hover:bg-white/5 sm:w-auto"
              >
                Generate JD with AI
              </button>
            </div>
          </section>
          </div>

          <aside className="self-start space-y-5">
            <details className="rounded-xl border border-[var(--workspace-form-border)] bg-white p-5 shadow-[0_8px_30px_rgba(103,58,183,0.06)] dark:border-gray-800 dark:bg-gray-900 sm:p-6">
              <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--workspace-form-title)] dark:text-white">
                Screening settings
              </summary>
              <div className="mt-4 space-y-4">
                <Field label="Role title">
                  <input
                    value={roleTitle}
                    onChange={(event) => setRoleTitle(event.target.value)}
                    placeholder="IT Support Specialist"
                    className={inputClassName}
                  />
                </Field>
                <Field label="Seniority">
                  <input
                    value={roleSeniority}
                    onChange={(event) => setRoleSeniority(event.target.value)}
                    placeholder="Mid-level"
                    className={inputClassName}
                  />
                </Field>
                <Field label="Location">
                  <input
                    value={roleLocation}
                    onChange={(event) => setRoleLocation(event.target.value)}
                    placeholder="Lagos / hybrid"
                    className={inputClassName}
                  />
                </Field>
                <Field label="Role brief">
                  <textarea
                    value={analysisGoal}
                    onChange={(event) => setAnalysisGoal(event.target.value)}
                    placeholder="Paste key requirements and what strong applicants should demonstrate."
                    className={`${inputClassName} min-h-24`}
                  />
                </Field>
              </div>
            </details>

            <article className="rounded-xl border border-[var(--workspace-form-border)] bg-white p-5 shadow-[0_8px_30px_rgba(103,58,183,0.06)] dark:border-gray-800 dark:bg-gray-900 sm:p-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                  Auto filter
                </p>
                <p className="text-sm leading-6 text-[var(--workspace-form-muted)] dark:text-gray-300">
                  Keep low role-match CVs out of the main review queue automatically while still
                  allowing recruiters to reveal them when needed.
                </p>
              </div>

              <div className="mt-5 space-y-4">
                <label className="flex items-start gap-3 rounded-xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-4 dark:border-gray-800 dark:bg-gray-950/60">
                  <input
                    type="checkbox"
                    checked={autoFilterLowRoleMatch}
                    onChange={(event) => setAutoFilterLowRoleMatch(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-[var(--workspace-form-border)] text-[var(--workspace-form-accent)]"
                  />
                  <span className="space-y-1">
                    <span className="block text-sm font-medium text-[var(--workspace-form-title)] dark:text-white">
                      Automatically filter weak role matches
                    </span>
                    <span className="block text-xs leading-5 text-[var(--workspace-form-muted)] dark:text-gray-300">
                      Role-match score is calculated from the benchmark criteria using matched,
                      partial, and missing signals.
                    </span>
                  </span>
                </label>

                <Field label="Minimum role-match score">
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={minimumRoleMatchScore}
                      onChange={(event) =>
                        setMinimumRoleMatchScore(
                          clampInteger(
                            Number.parseInt(event.target.value || "0", 10),
                            0,
                            100,
                            DEFAULT_HIRING_FORM_SCREENING_POLICY.minimumRoleMatchScore
                          )
                        )
                      }
                      disabled={!autoFilterLowRoleMatch}
                      className={inputClassName}
                    />
                    <span className="shrink-0 text-sm font-medium text-[var(--workspace-form-muted)] dark:text-gray-300">
                      / 100
                    </span>
                  </div>
                </Field>

                <div className="rounded-xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] px-4 py-3 text-sm leading-6 text-[var(--workspace-form-muted)] dark:border-gray-800 dark:bg-gray-950/60 dark:text-gray-300">
                  {autoFilterLowRoleMatch
                    ? `Candidates below ${minimumRoleMatchScore} will be moved out of the main review queue automatically.`
                    : "All submitted CVs will stay in the main review queue."}
                </div>
              </div>
            </article>

            <details className="rounded-xl border border-[var(--workspace-form-border)] bg-white p-5 shadow-[0_8px_30px_rgba(103,58,183,0.06)] dark:border-gray-800 dark:bg-gray-900 sm:p-6">
              <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--workspace-form-title)] dark:text-white">
                Advanced scoring notes
              </summary>
              <div className="mt-4 space-y-4">
                <Field label="Role summary">
                  <textarea
                    value={roleSummary}
                    onChange={(event) => setRoleSummary(event.target.value)}
                    placeholder="Summarize what success looks like in this role."
                    className={`${inputClassName} min-h-24`}
                  />
                </Field>
                <Field label="Must-have skills">
                  <textarea
                    value={mustHaveSkills}
                    onChange={(event) => setMustHaveSkills(event.target.value)}
                    placeholder="Windows support, ticketing, networking"
                    className={`${inputClassName} min-h-24`}
                  />
                </Field>
                <Field label="Nice-to-have skills">
                  <textarea
                    value={niceToHaveSkills}
                    onChange={(event) => setNiceToHaveSkills(event.target.value)}
                    placeholder="Azure, scripting, SLA reporting"
                    className={`${inputClassName} min-h-24`}
                  />
                </Field>
                <Field label="Interview focus">
                  <textarea
                    value={interviewFocus}
                    onChange={(event) => setInterviewFocus(event.target.value)}
                    placeholder="Communication, escalation handling, measurable outcomes"
                    className={`${inputClassName} min-h-24`}
                  />
                </Field>
              </div>
            </details>

            <article className="rounded-xl border border-[var(--workspace-form-border)] bg-white p-5 shadow-[0_8px_30px_rgba(103,58,183,0.06)] dark:border-gray-800 dark:bg-gray-900 sm:p-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                  Published forms
                </p>
                <p className="text-sm leading-6 text-[var(--workspace-form-muted)] dark:text-gray-300">
                  Open any existing form, copy its link, or jump straight to its responses.
                </p>
              </div>

              <div className="mt-5 space-y-3">
                {loadState === "loading" ? (
                  <PublishedFormsListSkeleton />
                ) : forms.length === 0 ? (
                  <EmptyMessage text="No published forms yet. Your first form will show here." />
                ) : (
                  forms.map((form) => (
                    <button
                      key={form.id}
                      type="button"
                      onClick={() => {
                        setSelectedFormId(form.id);
                        setSelectedApplicationId("");
                        setPipelineTab("review");
                      }}
                      className={`w-full rounded-lg border px-4 py-4 text-left transition ${
                        selectedFormId === form.id
                          ? "border-[var(--workspace-form-border)] bg-[var(--workspace-form-pill-bg)] dark:border-brand-500/30 dark:bg-brand-500/10"
                          : "border-[var(--workspace-form-border-soft)] bg-white hover:border-[var(--workspace-form-border)] hover:bg-[var(--workspace-form-surface)] dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 dark:hover:bg-gray-900/80"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold text-[var(--workspace-form-title)] dark:text-white">
                            {form.title}
                          </p>
                          <p className="mt-1 text-xs text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                            {form.team || "General hiring"}
                          </p>
                        </div>
                        <StatusBadge status={form.status} />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--workspace-form-muted)] dark:text-gray-400">
                        <span>{form.applicationCount} responses</span>
                        <span>/</span>
                        <span>{form.topScore ? `Top score ${form.topScore}` : "No scores yet"}</span>
                        {selectedFormId === form.id && detailState === "loading" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-medium text-[var(--workspace-form-pill-text)] shadow-[0_1px_2px_rgba(15,23,42,0.08)] dark:bg-gray-950 dark:text-brand-200 dark:shadow-none">
                            <InlineLoader className="h-3.5 w-3.5" />
                            Opening
                          </span>
                        ) : null}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </article>

            <article className="rounded-xl border border-[var(--workspace-form-border)] bg-white p-5 shadow-[0_8px_30px_rgba(103,58,183,0.06)] dark:border-gray-800 dark:bg-gray-900 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                Publishing notes
              </p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--workspace-form-muted)] dark:text-gray-300">
                <li>Published forms open on a light Google Forms-style submission page.</li>
                <li>Every response is auto-screened against the role benchmark and JD.</li>
                <li>HR can export CSV data and download each submitted CV from the review tab.</li>
              </ul>
            </article>
          </aside>
        </section>
      ) : (
        <section className="space-y-6">
          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
            <article className="rounded-xl border border-[var(--workspace-form-border)] bg-white p-5 shadow-[var(--workspace-form-shadow-md)] dark:border-gray-800 dark:bg-gray-900 sm:p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6f63a1] dark:text-gray-400">
                    Submitted forms
                  </p>
                  <p className="max-w-3xl text-sm leading-6 text-[#5f6368] dark:text-gray-300">
                    Choose a form to review its responses, export data, and download applicant CVs.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <MetaTag label={`${forms.length} forms`} />
                  <MetaTag label={`${totalApplications} submissions`} />
                </div>
              </div>

              <div className="mt-5">
                {loadState === "loading" ? (
                  <FormsGridSkeleton />
                ) : forms.length === 0 ? (
                  <div className="space-y-4">
                    <EmptyMessage text="No forms yet. Create one first to start receiving submissions." />
                    <button
                      type="button"
                      onClick={() => setPipelineTab("create")}
                      className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--workspace-form-accent)] px-4 py-3 text-sm font-medium text-[var(--workspace-form-accent-text)] shadow-theme-xs transition hover:bg-[var(--workspace-form-accent-muted)] sm:w-auto"
                    >
                      Create form
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    {forms.map((form) => (
                      <button
                        key={form.id}
                        type="button"
                        onClick={() => {
                          setSelectedFormId(form.id);
                          setSelectedApplicationId("");
                        }}
                        className={`w-full rounded-xl border px-4 py-4 text-left transition ${
                          selectedFormId === form.id
                            ? "border-[var(--workspace-form-border)] bg-[var(--workspace-form-pill-bg)] shadow-[0_10px_24px_rgba(15,23,42,0.08)] dark:border-brand-500/30 dark:bg-brand-500/10"
                            : "border-[var(--workspace-form-border-soft)] bg-white hover:border-[var(--workspace-form-border)] hover:bg-[var(--workspace-form-surface)] hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)] dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 dark:hover:bg-gray-900/80"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="break-words text-sm font-semibold text-[#1f1b2d] dark:text-white">
                              {form.title}
                            </p>
                            <p className="mt-1 text-xs text-[#6f63a1] dark:text-gray-400">
                              {form.team || "General hiring"}
                            </p>
                          </div>
                          <StatusBadge status={form.status} />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#5f6368] dark:text-gray-400">
                          <span>{form.applicationCount} responses</span>
                          <span>/</span>
                          <span>{form.topScore ? `Top score ${form.topScore}` : "No scores yet"}</span>
                          {selectedFormId === form.id && detailState === "loading" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-medium text-[var(--workspace-form-pill-text)] shadow-[0_1px_2px_rgba(15,23,42,0.08)] dark:bg-gray-950 dark:text-brand-200 dark:shadow-none">
                              <InlineLoader className="h-3.5 w-3.5" />
                              Loading
                            </span>
                          ) : null}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </article>

            <article className="rounded-xl border border-[var(--workspace-form-border)] bg-white p-5 shadow-[var(--workspace-form-shadow-md)] dark:border-gray-800 dark:bg-gray-900 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6f63a1] dark:text-gray-400">
                Response tools
              </p>
              <div className="mt-4 space-y-3 text-sm leading-6 text-[#5f6368] dark:text-gray-300">
                <p>Export spreadsheet-ready CSV data from the selected form.</p>
                <p>Open any applicant to download the original CV and review AI screening notes.</p>
                <p>Use the response list below to jump between candidates quickly.</p>
              </div>
            </article>
          </div>

          <div className="space-y-6">
            {selectedForm ? (
              <>
                <section className="overflow-hidden rounded-xl border border-[var(--workspace-form-border)] bg-white shadow-[var(--workspace-form-shadow-md)] dark:border-gray-800 dark:bg-gray-900">
                  <div className="space-y-5 p-5 sm:p-6">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={selectedForm.status} />
                          <span className="text-xs font-medium text-[#6f63a1] dark:text-gray-400">
                            {selectedForm.team || "General hiring"}
                          </span>
                        </div>
                        <h2 className="break-words text-2xl font-semibold tracking-tight text-[#1f1b2d] dark:text-white sm:text-3xl">
                          {selectedForm.title}
                        </h2>
                        <p className="max-w-3xl text-sm leading-6 text-[#5f6368] dark:text-gray-300">
                          {selectedForm.intro || "No public intro added for this form yet."}
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#6f63a1] dark:text-gray-400">
                          <span>Created {new Date(selectedForm.createdAt).toLocaleDateString()}</span>
                          <span>
                            {selectedForm.expiresAt
                              ? `Expires ${new Date(selectedForm.expiresAt).toLocaleDateString()}`
                              : "No expiration"}
                          </span>
                          <span>{selectedForm.jdAttachment ? "JD attached" : "No JD attached"}</span>
                        </div>
                      </div>

                      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap xl:justify-end">
                        {selectedForm.status !== "unpublished" ? (
                          <Link
                            href={selectedForm.publicUrl}
                            target="_blank"
                            className="col-span-2 inline-flex items-center justify-center rounded-lg bg-[var(--workspace-form-accent)] px-4 py-2.5 text-sm font-medium text-[var(--workspace-form-accent-text)] shadow-theme-xs transition hover:bg-[var(--workspace-form-accent-muted)] sm:col-span-1"
                          >
                            Open form
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => editSelectedForm(selectedForm)}
                          disabled={detailState === "loading"}
                          className="inline-flex items-center justify-center rounded-lg border border-[var(--workspace-form-border-soft)] bg-white px-4 py-2.5 text-sm font-medium text-[#5f6368] transition hover:bg-[var(--workspace-form-surface)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/5"
                        >
                          Edit form
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleSelectedFormPublished(selectedForm)}
                          disabled={isPublishingToggle}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--workspace-form-border-soft)] bg-white px-4 py-2.5 text-sm font-medium text-[#5f6368] transition hover:bg-[var(--workspace-form-surface)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/5"
                        >
                          {isPublishingToggle ? <InlineLoader className="h-4 w-4" /> : null}
                          {isPublishingToggle
                            ? "Updating..."
                            : selectedForm.status === "unpublished"
                              ? "Publish"
                              : "Unpublish"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCopyPublicLink(selectedForm.publicUrl)}
                          disabled={copyLinkState === "copying"}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--workspace-form-border-soft)] bg-white px-4 py-2.5 text-sm font-medium text-[#5f6368] transition hover:bg-[var(--workspace-form-surface)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/5"
                        >
                          {copyLinkState === "copying" ? (
                            <>
                              <InlineLoader className="h-4 w-4" />
                              Copying...
                            </>
                          ) : copyLinkState === "copied" ? (
                            "Copied"
                          ) : (
                            "Copy link"
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportResponses(selectedForm.id)}
                          disabled={isPreparingExport}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--workspace-form-border-soft)] bg-white px-4 py-2.5 text-sm font-medium text-[#5f6368] transition hover:bg-[var(--workspace-form-surface)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/5"
                        >
                          {isPreparingExport ? (
                            <>
                              <InlineLoader className="h-4 w-4" />
                              Preparing CSV...
                            </>
                          ) : (
                            "Export CSV"
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteForm(selectedForm.id)}
                          disabled={isDeleting === selectedForm.id}
                          className="col-span-2 inline-flex items-center justify-center gap-2 rounded-lg border border-[#f1b7b1] bg-white px-4 py-2.5 text-sm font-medium text-[#a50e0e] transition hover:bg-[#fce8e6] disabled:cursor-not-allowed dark:border-error-500/30 dark:bg-transparent dark:text-error-200 dark:hover:bg-error-500/10 sm:col-span-1"
                        >
                          {isDeleting === selectedForm.id ? (
                            <InlineLoader className="h-4 w-4" />
                          ) : null}
                          {isDeleting === selectedForm.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <ReviewStat label="Responses" value={String(selectedForm.applicationCount)} />
                      <ReviewStat
                        label="Top score"
                        value={selectedForm.topScore ? String(selectedForm.topScore) : "-"}
                      />
                      <ReviewStat label="Questions" value={String(selectedForm.formFields.length)} />
                      <ReviewStat
                        label="Auto-filtered"
                        value={String(filteredOutApplications.length)}
                      />
                      <ReviewStat
                        label="JD"
                        value={selectedForm.jdAttachment ? "Attached" : "None"}
                      />
                    </div>
                  </div>

                  <div className="grid border-t border-[var(--workspace-form-border-soft)] dark:border-gray-800 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="space-y-4 p-5 sm:p-6">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                          Screening benchmark
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedForm.roleSetup.title ? <MetaTag label={selectedForm.roleSetup.title} /> : null}
                          {selectedForm.roleSetup.seniority ? <MetaTag label={selectedForm.roleSetup.seniority} /> : null}
                          {selectedForm.roleSetup.location ? <MetaTag label={selectedForm.roleSetup.location} /> : null}
                          {!selectedForm.roleSetup.title &&
                          !selectedForm.roleSetup.seniority &&
                          !selectedForm.roleSetup.location ? (
                            <span className="text-sm text-[#5f6368] dark:text-gray-300">
                              No benchmark labels added yet.
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {selectedForm.roleSetup.summary || selectedForm.analysisGoal ? (
                        <div className="rounded-lg bg-[var(--workspace-form-surface)] p-4 text-sm leading-6 text-[#5f6368] dark:bg-gray-950/60 dark:text-gray-300">
                          {selectedForm.roleSetup.summary ? <p>{selectedForm.roleSetup.summary}</p> : null}
                          {selectedForm.analysisGoal ? (
                            <p className={selectedForm.roleSetup.summary ? "mt-3" : ""}>
                              {selectedForm.analysisGoal}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="rounded-lg border border-[var(--workspace-form-border-soft)] bg-white p-4 text-sm leading-6 text-[var(--workspace-form-muted)] dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                          Queue policy
                        </p>
                        <p className="mt-2">
                          {selectedFormScreeningPolicy.autoFilterLowRoleMatch
                            ? `CVs below role-match score ${selectedFormScreeningPolicy.minimumRoleMatchScore} are filtered out of the primary review queue automatically.`
                            : "Automatic low role-match filtering is turned off for this form."}
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <CompactSkillList
                          title="Must-have"
                          items={selectedForm.roleSetup.mustHaveSkills}
                        />
                        <CompactSkillList
                          title="Nice to have"
                          items={selectedForm.roleSetup.niceToHaveSkills}
                        />
                      </div>
                    </div>

                    <aside className="space-y-4 border-t border-[var(--workspace-form-border-soft)] p-5 dark:border-gray-800 lg:border-l lg:border-t-0 sm:p-6">
                      <DetailRow
                        label="Expiration"
                        value={
                          selectedForm.expiresAt
                            ? new Date(selectedForm.expiresAt).toLocaleDateString()
                            : "No expiration"
                        }
                      />
                      <DetailRow label="Fields" value={String(selectedForm.formFields.length)} />
                      <DetailRow
                        label="JD file"
                        value={selectedForm.jdAttachment?.fileName || "No file attached"}
                      />

                      {selectedForm.jdAttachment ? (
                        <details className="rounded-lg border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-4 dark:border-gray-800 dark:bg-gray-950/60">
                          <summary className="cursor-pointer list-none text-sm font-semibold text-[#1f1b2d] dark:text-white">
                            Preview JD
                          </summary>
                          <p className="mt-3 text-sm leading-6 text-[#5f6368] dark:text-gray-300">
                            {selectedForm.jdAttachment.text.slice(0, 260)}
                            {selectedForm.jdAttachment.text.length > 260 ? "..." : ""}
                          </p>
                        </details>
                      ) : null}
                    </aside>
                  </div>
                </section>

                <section className="overflow-hidden rounded-xl border border-[var(--workspace-form-border)] bg-white shadow-[var(--workspace-form-shadow-md)] dark:border-gray-800 dark:bg-gray-900">
                  <div className="border-b border-[var(--workspace-form-border-soft)] p-5 dark:border-gray-800 sm:p-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6f63a1] dark:text-gray-400">
                          Candidate responses
                        </p>
                        <h3 className="mt-2 text-2xl font-semibold text-[#1f1b2d] dark:text-white">
                          Review submissions
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-[#5f6368] dark:text-gray-300">
                          Select a candidate to view the AI summary, signals, answers, and CV.
                        </p>
                      </div>
                      <MetaTag label={`${selectedForm.applicationCount} responses`} />
                    </div>
                  </div>
                  {detailState === "loading" ? (
                    <div className="p-5 sm:p-6">
                      <ResponsesSectionSkeleton />
                    </div>
                  ) : visibleApplications.length === 0 && filteredOutApplications.length === 0 ? (
                    <div className="p-5 sm:p-6">
                      <EmptyMessage text="No applications yet for this form." />
                    </div>
                  ) : (
                    <div className="space-y-6 p-5 sm:p-6">
                      <div className="rounded-2xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-4 shadow-[var(--workspace-form-shadow-sm)] dark:border-gray-800 dark:bg-gray-950/40">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                              Response list
                            </p>
                            <p className="mt-1 text-sm leading-6 text-[var(--workspace-form-muted)] dark:text-gray-300">
                              {selectedApplication
                                ? `Showing ${getApplicationDisplayName(selectedApplication)}`
                                : visibleApplications.length > 0
                                  ? "Choose a response to open the full review."
                                  : "All submissions are currently outside the primary review queue."}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--workspace-form-pill-text)] shadow-[0_1px_2px_rgba(15,23,42,0.08)] dark:bg-gray-900 dark:text-brand-200 dark:shadow-none">
                              {visibleApplications.length} in queue
                            </span>
                            {filteredOutApplications.length > 0 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setShowFilteredApplications((current) => !current)
                                }
                                className="rounded-full border border-[var(--workspace-form-border-soft)] bg-white px-3 py-1 text-xs font-semibold text-[var(--workspace-form-muted)] transition hover:bg-[var(--workspace-form-surface)] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                              >
                                {showFilteredApplications
                                  ? "Hide filtered-out CVs"
                                  : `Show ${filteredOutApplications.length} filtered-out CVs`}
                              </button>
                            ) : null}
                          </div>
                        </div>

                        {selectedFormScreeningPolicy.autoFilterLowRoleMatch ? (
                          <div className="mt-4 rounded-xl border border-[var(--workspace-form-border-soft)] bg-white px-4 py-3 text-sm leading-6 text-[var(--workspace-form-muted)] dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                            The primary queue hides CVs below role-match score{" "}
                            <span className="font-semibold text-[var(--workspace-form-title)] dark:text-white">
                              {selectedFormScreeningPolicy.minimumRoleMatchScore}
                            </span>
                            . Recruiters can reveal them for audit or edge-case review.
                          </div>
                        ) : null}

                        {visibleApplications.length > 0 ? (
                          <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                            {visibleApplications.map((application) => (
                              <CandidateListItem
                                key={application.id}
                                application={application}
                                filterResult={applicationFilterResults.get(application.id)}
                                isActive={selectedApplication?.id === application.id}
                                onClick={() => setSelectedApplicationId(application.id)}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="mt-4 rounded-xl border border-dashed border-[var(--workspace-form-border)] bg-white px-4 py-6 text-sm text-[var(--workspace-form-muted)] dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                            {filteredOutApplications.length > 0
                              ? `All ${filteredOutApplications.length} submissions were filtered below the current role-match threshold. Use the button above to review them.`
                              : "No submissions are in this queue yet."}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        {selectedApplication ? (
                          <ApplicationReviewCard
                            application={selectedApplication}
                            filterResult={applicationFilterResults.get(selectedApplication.id)}
                            isDeleting={isDeleting === selectedApplication.id}
                            onApplicationUpdated={handleApplicationUpdated}
                            onDelete={() => void handleDeleteApplication(selectedApplication.id)}
                            questions={selectedForm.formFields}
                          />
                        ) : (
                          <EmptyMessage text="Select a response to open the full candidate review." />
                        )}
                      </div>
                    </div>
                  )}
                </section>
              </>
            ) : detailState === "loading" ? (
              <ReviewWorkspaceSkeleton />
            ) : (
              <div className="rounded-xl border border-[var(--workspace-form-border)] bg-white p-6 shadow-[var(--workspace-form-shadow-md)] dark:border-gray-800 dark:bg-gray-900">
                <EmptyMessage text="Select a form to review its submissions and export responses." />
              </div>
            )}
          </div>
        </section>
      )}

      {activeBuilderModal === "aiForm" ? (
        <BuilderToolModal
          eyebrow="AI form draft"
          title="Generate the form instead of building it by hand"
          description="Use the role title, hiring brief, skill requirements, and an optional instruction to create an editable application form draft."
          onClose={() => setActiveBuilderModal(null)}
          maxWidthClassName="max-w-4xl"
          footer={
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => setActiveBuilderModal(null)}
                className="inline-flex items-center justify-center rounded-lg border border-[var(--workspace-form-border)] bg-white px-4 py-3 text-sm font-medium text-[var(--workspace-form-muted)] transition hover:bg-[var(--workspace-form-surface)] dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/5"
              >
                Done
              </button>

              <div className="flex flex-col gap-3 sm:flex-row">
                {aiFormPrompt.trim() || formGenerationNote ? (
                  <button
                    type="button"
                    onClick={clearFormGenerationState}
                    disabled={isGeneratingFormDraft}
                    className="inline-flex items-center justify-center rounded-lg border border-[var(--workspace-form-border)] bg-white px-4 py-3 text-sm font-medium text-[var(--workspace-form-muted)] transition hover:bg-[var(--workspace-form-surface)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/5"
                  >
                    Clear AI draft notes
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleGenerateFormDraft()}
                  disabled={isGeneratingFormDraft || !canGenerateFormDraft}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--workspace-form-accent)] px-4 py-3 text-sm font-medium text-[var(--workspace-form-accent-text)] shadow-theme-xs transition hover:bg-[var(--workspace-form-accent-muted)] disabled:cursor-not-allowed disabled:bg-[var(--workspace-form-border)]"
                >
                  {isGeneratingFormDraft ? <InlineLoader className="h-4 w-4" /> : null}
                  {isGeneratingFormDraft ? "Generating form..." : "Generate form with AI"}
                </button>
              </div>
            </div>
          }
        >
          <div className="space-y-5">
            <textarea
              value={aiFormPrompt}
              onChange={(event) => setAiFormPrompt(event.target.value)}
              placeholder="Optional instruction: Keep this short and technical, focus on project proof, and ask for availability."
              className={`${inputClassName} min-h-40`}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] px-4 py-3 text-sm leading-6 text-[var(--workspace-form-muted)] dark:border-gray-800 dark:bg-gray-950/60 dark:text-gray-300">
                {formFields.length > 0
                  ? `The builder currently has ${formFields.length} editable field${formFields.length === 1 ? "" : "s"}. Generating a new draft will replace them.`
                  : "The generated draft will load directly into the builder so you can review, edit, and publish it."}
              </div>
              <div className="rounded-xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] px-4 py-3 text-sm leading-6 text-[var(--workspace-form-muted)] dark:border-gray-800 dark:bg-gray-950/60 dark:text-gray-300">
                {canGenerateFormDraft
                  ? "AI uses your current role context first, then fills the rest with Gemini, Hugging Face, or the local fallback generator."
                  : "Add a role title, brief, skill list, or a short instruction to unlock AI form generation."}
              </div>
            </div>

            {formGenerationNote ? (
              <div className="rounded-xl border border-[var(--workspace-form-border-soft)] bg-white px-4 py-3 text-sm leading-6 text-[var(--workspace-form-muted)] dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                {formGenerationNote}
              </div>
            ) : null}
          </div>
        </BuilderToolModal>
      ) : null}

      {activeBuilderModal === "jobDescription" ? (
        <BuilderToolModal
          eyebrow="Job description"
          title="Attach a JD or generate one automatically"
          description="Use a real file, or create an editable JD draft from the role brief and screening criteria before you publish this form."
          onClose={() => setActiveBuilderModal(null)}
          maxWidthClassName="max-w-5xl"
          footer={
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setActiveBuilderModal(null)}
                className="inline-flex items-center justify-center rounded-lg border border-[var(--workspace-form-border)] bg-white px-4 py-3 text-sm font-medium text-[var(--workspace-form-muted)] transition hover:bg-[var(--workspace-form-surface)] dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/5"
              >
                Done
              </button>
            </div>
          }
        >
          <div className="space-y-6">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-[var(--workspace-form-title)] dark:text-white">
                      JD content
                    </p>
                    <p className="text-sm leading-6 text-[var(--workspace-form-muted)] dark:text-gray-300">
                      Review the source that will be reused during public applications and CV screening.
                    </p>
                  </div>
                  {jobDescriptionDraftLength > 0 ? (
                    <span className="inline-flex w-fit items-center rounded-full bg-[var(--workspace-form-pill-bg)] px-3 py-1 text-xs font-semibold text-[var(--workspace-form-pill-text)] dark:bg-brand-500/10 dark:text-brand-200">
                      {jobDescriptionDraftLength} characters
                    </span>
                  ) : null}
                </div>

                {jobDescriptionFile ? (
                  <div className="min-h-[22rem] rounded-xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-5 dark:border-gray-800 dark:bg-gray-900/70">
                    <p className="text-sm font-semibold text-[var(--workspace-form-title)] dark:text-white">
                      Uploaded JD ready
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--workspace-form-muted)] dark:text-gray-300">
                      <span className="font-medium text-[var(--workspace-form-title)] dark:text-white">
                        {jobDescriptionFile.name}
                      </span>{" "}
                      will be extracted and used for candidate screening. Clear the upload if you
                      want to switch back to the editable text draft.
                    </p>
                  </div>
                ) : (
                  <textarea
                    value={jobDescriptionDraftText}
                    onChange={(event) => setJobDescriptionDraftText(event.target.value)}
                    placeholder="Generate a JD here or paste your own text. This draft will be saved and reused during CV screening."
                    className={`${inputClassName} min-h-[22rem]`}
                  />
                )}
              </div>

              <div className="space-y-4">
                <label
                  className={`${uploadFieldClassName} ${
                    isGeneratingJd ? "pointer-events-none opacity-60" : ""
                  }`}
                >
                  <span className="min-w-0 truncate text-left">
                    {jobDescriptionFile ? jobDescriptionFile.name : "Upload JD file"}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.xml,.rtf,.log,.png,.jpg,.jpeg,.webp,.gif,.bmp"
                    className="sr-only"
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0] ?? null;
                      setJobDescriptionFile(nextFile);
                      if (nextFile) {
                        setJobDescriptionDraftText("");
                        setJobDescriptionDraftName(nextFile.name);
                        setJdGenerationNote(
                          "Uploaded JD files override the editable draft when you save this form."
                        );
                      }
                    }}
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void handleGenerateJobDescription()}
                  disabled={isGeneratingJd || !canGenerateJobDescription}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--workspace-form-accent)] px-4 py-3 text-sm font-medium text-[var(--workspace-form-accent-text)] shadow-theme-xs transition hover:bg-[var(--workspace-form-accent-muted)] disabled:cursor-not-allowed disabled:bg-[var(--workspace-form-border)]"
                >
                  {isGeneratingJd ? <InlineLoader className="h-4 w-4" /> : null}
                  {isGeneratingJd ? "Generating JD..." : "Generate JD automatically"}
                </button>

                {jobDescriptionFile || jobDescriptionDraftLength > 0 ? (
                  <button
                    type="button"
                    onClick={clearJobDescriptionState}
                    disabled={isGeneratingJd}
                    className="inline-flex w-full items-center justify-center rounded-lg border border-[var(--workspace-form-border)] bg-white px-4 py-3 text-sm font-medium text-[var(--workspace-form-muted)] transition hover:bg-[var(--workspace-form-surface)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/5"
                  >
                    Clear JD
                  </button>
                ) : null}

                <div className="rounded-xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] px-4 py-3 text-sm leading-6 text-[var(--workspace-form-muted)] dark:border-gray-800 dark:bg-gray-950/60 dark:text-gray-300">
                  {jobDescriptionFile
                    ? "The uploaded file will be used as the JD source when this form is published or updated."
                    : jobDescriptionDraftLength > 0
                      ? "This editable draft will be saved as the JD source for public applications and CV screening."
                      : "No JD attached yet. Generate one from the role brief or upload a file from your team."}
                </div>

                {jdGenerationNote ? (
                  <div className="rounded-xl border border-[var(--workspace-form-border-soft)] bg-white px-4 py-3 text-sm leading-6 text-[var(--workspace-form-muted)] dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                    {jdGenerationNote}
                  </div>
                ) : null}

                {!canGenerateJobDescription ? (
                  <p className="text-xs leading-5 text-[var(--workspace-form-muted)] dark:text-gray-400">
                    Add at least a role title, brief, or key skills in the screening settings to
                    unlock automatic JD generation.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </BuilderToolModal>
      ) : null}
    </div>
  );
}

function BuilderToolModal({
  eyebrow,
  title,
  description,
  onClose,
  children,
  footer,
  maxWidthClassName = "max-w-4xl",
}: {
  eyebrow: string;
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidthClassName?: string;
}) {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className={`pointer-events-auto relative flex max-h-[calc(100vh-3rem)] w-full flex-col overflow-hidden rounded-2xl border border-[var(--workspace-form-border)] bg-[var(--workspace-form-page)] shadow-[0_28px_100px_rgba(0,0,0,0.45)] dark:border-gray-800 dark:bg-gray-950 ${maxWidthClassName}`}
      >
        <div className="relative z-20 flex shrink-0 items-start justify-between gap-4 border-b border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-page)]/95 p-5 backdrop-blur-md dark:border-gray-800 dark:bg-gray-950/95 sm:p-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
              {eyebrow}
            </p>
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold tracking-tight text-[var(--workspace-form-title)] dark:text-white">
                {title}
              </h2>
              <p className="max-w-3xl text-sm leading-6 text-[var(--workspace-form-muted)] dark:text-gray-300">
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-[var(--workspace-form-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--workspace-form-muted)] transition hover:bg-[var(--workspace-form-surface)] dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/5"
          >
            Close
          </button>
        </div>

        <div className="relative z-0 min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
          {children}
        </div>

        {footer ? (
          <div className="relative z-20 shrink-0 border-t border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-page)]/95 p-5 backdrop-blur-md dark:border-gray-800 dark:bg-gray-950/95 sm:p-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

function ApplicationReviewCard({
  application,
  filterResult,
  isDeleting,
  onApplicationUpdated,
  onDelete,
  questions,
}: {
  application: HiringApplicationRecord;
  filterResult?: ReturnType<typeof evaluateHiringApplicationFilter>;
  isDeleting: boolean;
  onApplicationUpdated: (application: HiringApplicationRecord) => void;
  onDelete: () => void;
  questions: HiringFormDetail["formFields"];
}) {
  const { settings } = useWorkspace();
  const displayName = getApplicationDisplayName(application);
  const profileHeadline =
    application.analysis.result.candidateProfile.headline ||
    application.analysis.result.recommendation.summary;
  const profileDetails = [
    ["Email", application.applicant.email],
    ["Phone", application.applicant.phone],
    ["Location", application.applicant.location],
    ["LinkedIn", application.applicant.linkedIn],
    ["Portfolio", application.applicant.portfolio],
    ["Experience", application.applicant.yearsExperience],
    ["Notice", application.applicant.noticePeriod],
    ["Salary", application.applicant.salaryExpectation],
    ["Resume", application.resumeFile.fileName],
  ];

  return (
    <article className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-[var(--workspace-form-border-soft)] bg-white p-6 shadow-[var(--workspace-form-shadow-md)] dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-6 2xl:flex-row 2xl:items-start 2xl:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[var(--workspace-form-accent-soft)] text-lg font-semibold text-[var(--workspace-form-accent)] dark:bg-brand-500/15 dark:text-brand-200">
                {getInitials(displayName)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                  Candidate review
                </p>
                <h3 className="mt-2 break-words text-3xl font-semibold tracking-tight text-[var(--workspace-form-title)] dark:text-white">
                  {displayName}
                </h3>
                {profileHeadline ? (
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--workspace-form-muted)] dark:text-gray-300">
                    {profileHeadline}
                  </p>
                ) : null}
                <p className="mt-3 text-sm text-[var(--workspace-form-muted)] dark:text-gray-300">
                  Submitted {formatApplicationDate(application.createdAt)}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4 2xl:w-[480px]">
              <ReviewMetricCard
                label="Decision"
                value={application.analysis.result.recommendation.decision}
              />
              <ReviewMetricCard
                label="Score"
                value={String(application.analysis.result.score.value)}
              />
              <ReviewMetricCard
                label="Stage"
                value={describeHiringApplicationStage(application.workflow.stage)}
              />
              <ReviewMetricCard
                label="Source"
                value={application.analysis.meta.inputKind.toUpperCase()}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <MetaTag label={application.analysis.result.recommendation.confidence} />
            <MetaTag label={describeHiringApplicationStage(application.workflow.stage)} />
            <MetaTag label={application.resumeFile.fileName} />
            {filterResult?.autoFiltered ? (
              <MetaTag label={`Filtered out at ${filterResult.roleMatchScore}/100`} />
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <a
            href={appendWorkspaceQuery(
              `/api/applications/${application.id}`,
              settings.workspaceId
            )}
            className="inline-flex items-center justify-center rounded-lg bg-[var(--workspace-form-accent)] px-4 py-2.5 text-sm font-medium text-[var(--workspace-form-accent-text)] shadow-theme-xs transition hover:bg-[var(--workspace-form-accent-muted)]"
          >
            Download resume
          </a>
          <Link
            href={appendWorkspaceQuery(
              `/candidate-mail?form=${encodeURIComponent(application.formId)}&application=${encodeURIComponent(application.id)}`,
              settings.workspaceId
            )}
            className="inline-flex items-center justify-center rounded-lg border border-[var(--workspace-form-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--workspace-form-title)] transition hover:bg-[var(--workspace-form-page)] dark:border-gray-700 dark:bg-transparent dark:text-white dark:hover:bg-white/5"
          >
            Open mail workspace
          </Link>
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#f1b7b1] px-4 py-2.5 text-sm font-medium text-[#a50e0e] transition hover:bg-[#fce8e6] disabled:cursor-not-allowed dark:border-error-500/30 dark:text-error-200 dark:hover:bg-error-500/10"
          >
            {isDeleting ? <InlineLoader className="h-4 w-4" /> : null}
            {isDeleting ? "Deleting..." : "Delete submission"}
          </button>
        </div>

        {filterResult?.autoFiltered ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
            <span className="font-semibold">Auto-filtered from the main queue.</span>{" "}
            {filterResult.reason}
          </div>
        ) : null}
      </section>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <section className="rounded-2xl border border-[var(--workspace-form-border-soft)] bg-white p-5 shadow-[var(--workspace-form-shadow-sm)] dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
              Applicant details
            </p>
            <span className="text-xs font-medium text-[var(--workspace-form-muted)] dark:text-gray-400">
              {application.applicant.email ? "Primary contact captured" : "Limited contact info"}
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {profileDetails.map(([label, value]) => (
              <ProfileDetailCard key={label} label={label} value={value} />
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--workspace-form-border-soft)] bg-white p-5 shadow-[var(--workspace-form-shadow-sm)] dark:border-gray-800 dark:bg-gray-900">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
              AI summary
            </p>
            <p className="mt-3 rounded-xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-5 text-sm leading-7 text-[var(--workspace-form-muted)] dark:border-gray-800 dark:bg-gray-950/60 dark:text-gray-300">
              {application.analysis.result.summary}
            </p>
          </div>
          <div className="mt-5 rounded-xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-4 dark:border-gray-800 dark:bg-gray-950/60">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
              Recommendation
            </p>
            <p className="mt-2 text-sm leading-7 text-[var(--workspace-form-muted)] dark:text-gray-300">
              {application.analysis.result.recommendation.summary}
            </p>
          </div>
        </section>
      </div>

      <CandidateWorkflowPanel
        application={application}
        onUpdated={onApplicationUpdated}
        workspaceId={settings.workspaceId}
      />

      <CandidateInterviewScorecardPanel
        application={application}
        onUpdated={onApplicationUpdated}
        workspaceId={settings.workspaceId}
      />

      <div className="grid gap-4 2xl:grid-cols-2">
        <SignalPanel
          title="Highlights"
          items={application.analysis.result.keyHighlights}
          tone="positive"
        />
        <SignalPanel
          title="Red flags"
          items={application.analysis.result.redFlags}
          tone="caution"
        />
      </div>

      {Object.keys(application.applicant.customAnswers).length > 0 ? (
        <section className="rounded-2xl border border-[var(--workspace-form-border-soft)] bg-white p-5 shadow-[var(--workspace-form-shadow-sm)] dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
              Screening answers
            </p>
            <span className="text-xs font-medium text-[var(--workspace-form-muted)] dark:text-gray-400">
              {Object.keys(application.applicant.customAnswers).length} responses
            </span>
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {Object.entries(application.applicant.customAnswers).map(([label, answer]) => (
              <div
                key={label}
                className="rounded-xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-4 dark:border-gray-800 dark:bg-gray-950/60"
              >
                <p className="text-sm font-medium leading-7 text-[var(--workspace-form-title)] dark:text-white">
                  {questions.find((item) => item.id === label)?.label || label}
                </p>
                <p className="mt-2 text-sm leading-7 text-[var(--workspace-form-muted)] dark:text-gray-300">
                  {answer || "-"}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}

function CandidateListItem({
  application,
  filterResult,
  isActive,
  onClick,
}: {
  application: HiringApplicationRecord;
  filterResult?: ReturnType<typeof evaluateHiringApplicationFilter>;
  isActive: boolean;
  onClick: () => void;
}) {
  const displayName = getApplicationDisplayName(application);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border p-4 text-left transition ${
        isActive
          ? "border-[var(--workspace-form-accent)] bg-white shadow-[0_18px_36px_rgba(15,23,42,0.12)] dark:bg-gray-900"
          : "border-[var(--workspace-form-border-soft)] bg-white/70 hover:border-[var(--workspace-form-border)] hover:bg-white hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)] dark:border-gray-800 dark:bg-gray-900/60 dark:hover:bg-gray-900"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-semibold ${
            isActive
              ? "bg-[var(--workspace-form-accent-soft)] text-[var(--workspace-form-accent)] dark:bg-brand-500/15 dark:text-brand-200"
              : "bg-[var(--workspace-form-surface)] text-[var(--workspace-form-muted)] dark:bg-gray-950/60 dark:text-gray-300"
          }`}
        >
          {getInitials(displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--workspace-form-title)] dark:text-white">
                {displayName}
              </p>
              <p className="mt-1 truncate text-xs text-[var(--workspace-form-muted)] dark:text-gray-400">
                {application.applicant.email || "No email added"}
              </p>
            </div>
            <span className="shrink-0 rounded-xl bg-[var(--workspace-form-pill-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--workspace-form-pill-text)] dark:bg-brand-500/15 dark:text-brand-200">
              {application.analysis.result.score.value}
            </span>
          </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-[var(--workspace-form-pill-bg)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--workspace-form-pill-text)] dark:bg-brand-500/15 dark:text-brand-200">
                {describeHiringApplicationStage(application.workflow.stage)}
              </span>
              <span className="rounded-full bg-[var(--workspace-form-surface)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--workspace-form-muted)] dark:bg-gray-950/60 dark:text-gray-300">
                {application.analysis.result.recommendation.decision}
              </span>
            <span className="rounded-full bg-[var(--workspace-form-surface)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--workspace-form-muted)] dark:bg-gray-950/60 dark:text-gray-300">
              {application.analysis.meta.inputKind}
            </span>
            {filterResult?.autoFiltered ? (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-amber-800 dark:bg-amber-500/10 dark:text-amber-100">
                Filtered {filterResult.roleMatchScore}
              </span>
            ) : null}
          </div>

          <p className="mt-3 text-xs text-[var(--workspace-form-muted)] dark:text-gray-400">
            {formatApplicationDate(application.createdAt)}
          </p>
        </div>
      </div>
    </button>
  );
}

function TopTabButton({
  isActive,
  onClick,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-1 py-3 text-sm font-medium transition ${
        isActive
          ? "border-[var(--workspace-form-accent)] text-[var(--workspace-form-accent)] dark:text-brand-300"
          : "border-transparent text-[var(--workspace-form-muted)] hover:text-[var(--workspace-form-accent)] dark:text-gray-400 dark:hover:text-brand-300"
      }`}
    >
      {children}
    </button>
  );
}

function ReviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] px-4 py-3 dark:border-gray-800 dark:bg-gray-950/60">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-[var(--workspace-form-title)] dark:text-white">
        {value}
      </p>
    </div>
  );
}

function ReviewMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] px-4 py-3 dark:border-gray-800 dark:bg-gray-950/60">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
        {label}
      </p>
      <p className="mt-2 break-words text-base font-semibold text-[var(--workspace-form-title)] dark:text-white">
        {value}
      </p>
    </div>
  );
}

function ProfileDetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-4 dark:border-gray-800 dark:bg-gray-950/60">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
        {label}
      </p>
      <p className="mt-2 break-all text-sm leading-7 text-[var(--workspace-form-title)] dark:text-white">
        {value || "-"}
      </p>
    </div>
  );
}

function CompactSkillList({ items, title }: { items: string[]; title: string }) {
  return (
    <div className="rounded-lg border border-[var(--workspace-form-border-soft)] bg-white p-4 dark:border-gray-800 dark:bg-gray-950/60">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
        {title}
      </p>
      {items.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.slice(0, 6).map((item) => (
            <span
              key={`${title}:${item}`}
              className="rounded-md bg-[var(--workspace-form-pill-bg)] px-2.5 py-1 text-xs font-medium text-[var(--workspace-form-pill-text)] dark:bg-brand-500/15 dark:text-brand-200"
            >
              {item}
            </span>
          ))}
          {items.length > 6 ? (
            <span className="rounded-md bg-[var(--workspace-form-surface)] px-2.5 py-1 text-xs font-medium text-[var(--workspace-form-muted)] dark:bg-gray-900 dark:text-gray-300">
              +{items.length - 6} more
            </span>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-[var(--workspace-form-muted)] dark:text-gray-300">
          Not added yet.
        </p>
      )}
    </div>
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
      <span className="text-sm font-medium text-[var(--workspace-form-title)] dark:text-gray-200">{label}</span>
      {children}
    </label>
  );
}

function FormFieldBuilderCard({
  field,
  index,
  isActive,
  total,
  onActivate,
  onAddField,
  onUpdate,
  onRemove,
  onDuplicate,
  onMove,
  onDragStart,
  onDragEnter,
  onDragEnd,
}: {
  field: HiringFormField;
  index: number;
  isActive: boolean;
  total: number;
  onActivate: (fieldId: string) => void;
  onAddField: (type?: HiringFormFieldType, targetFieldId?: string) => void;
  onUpdate: (fieldId: string, patch: Partial<HiringFormField>) => void;
  onRemove: (fieldId: string) => void;
  onDuplicate: (fieldId: string) => void;
  onMove: (fieldId: string, direction: -1 | 1) => void;
  onDragStart: (fieldId: string) => void;
  onDragEnter: (fieldId: string) => void;
  onDragEnd: () => void;
}) {
  const isLockedCore =
    field.systemKey === "fullName" ||
    field.systemKey === "email" ||
    field.systemKey === "resumeFile";

  return (
    <article
      draggable
      onClick={() => onActivate(field.id)}
      onFocusCapture={() => onActivate(field.id)}
      onDragStart={() => onDragStart(field.id)}
      onDragEnter={(event) => {
        event.preventDefault();
        onDragEnter(field.id);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragEnd={onDragEnd}
      className={`group relative isolate rounded-xl border bg-white p-4 shadow-[0_2px_8px_rgba(60,64,67,0.15)] transition hover:z-10 hover:shadow-[0_6px_18px_rgba(60,64,67,0.2)] dark:bg-gray-950 ${
        isActive
          ? "z-20 border-[var(--workspace-form-accent)]"
          : "z-0 border-[var(--workspace-form-border)] dark:border-gray-800"
      }`}
    >
      <div
        className={`absolute inset-y-3 left-0 w-1 rounded-r-full bg-[var(--workspace-form-accent)] ${
          isActive ? "block" : "hidden group-hover:block"
        }`}
      />
      <ContextualBuilderToolbar
        isVisible={isActive}
        onAddLongText={() => onAddField("long_text", field.id)}
        onAddQuestion={() => onAddField("short_text", field.id)}
      />
      <div className="mb-3 flex items-center justify-center">
        <span className="cursor-grab px-4 py-1 text-lg leading-none text-gray-400 active:cursor-grabbing">
          ::
        </span>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
          Question {index + 1}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onMove(field.id, -1)}
            disabled={index === 0}
            className="rounded-md border border-[var(--workspace-form-border-soft)] px-2 py-1 text-xs text-[var(--workspace-form-muted)] disabled:opacity-40"
          >
            Up
          </button>
          <button
            type="button"
            onClick={() => onMove(field.id, 1)}
            disabled={index === total - 1}
            className="rounded-md border border-[var(--workspace-form-border-soft)] px-2 py-1 text-xs text-[var(--workspace-form-muted)] disabled:opacity-40"
          >
            Down
          </button>
          {!isLockedCore ? (
            <>
            <button
              type="button"
              onClick={() => onDuplicate(field.id)}
              className="rounded-md border border-[var(--workspace-form-border-soft)] px-2 py-1 text-xs text-[var(--workspace-form-muted)] hover:bg-[var(--workspace-form-surface)]"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => onRemove(field.id)}
              className="rounded-md border border-error-200 px-2 py-1 text-xs text-error-700 hover:bg-error-50 dark:border-error-500/30 dark:text-error-200"
            >
              Remove
            </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_170px]">
        <input
          value={field.label}
          onChange={(event) => onUpdate(field.id, { label: event.target.value })}
          className="w-full border-0 border-b border-[var(--workspace-form-border-soft)] bg-transparent px-0 py-3 text-base text-[var(--workspace-form-title)] outline-hidden transition placeholder:text-gray-400 focus:border-[var(--workspace-form-accent)] dark:text-white"
          placeholder="Question title"
        />
        <FieldTypeSelect
          disabled={field.systemKey === "resumeFile"}
          value={field.type}
          onChange={(nextType) =>
            onUpdate(field.id, {
              type: nextType,
              options: isChoiceFieldType(nextType)
                ? normalizeBuilderOptions(field.options)
                : [],
            })
          }
        />
      </div>

      {isChoiceFieldType(field.type) ? (
        <ChoiceOptionsEditor
          fieldType={field.type}
          options={getEditableBuilderOptions(field.options)}
          onChange={(options) => onUpdate(field.id, { options })}
        />
      ) : null}

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <input
          value={field.placeholder}
          onChange={(event) => onUpdate(field.id, { placeholder: event.target.value })}
          className="w-full border-0 border-b border-[var(--workspace-form-border-soft)] bg-transparent px-0 py-2 text-sm text-[var(--workspace-form-muted)] outline-hidden transition placeholder:text-gray-400 focus:border-[var(--workspace-form-accent)] dark:text-gray-300"
          placeholder="Placeholder"
        />
        <input
          value={field.helper}
          onChange={(event) => onUpdate(field.id, { helper: event.target.value })}
          className="w-full border-0 border-b border-[var(--workspace-form-border-soft)] bg-transparent px-0 py-2 text-sm text-[var(--workspace-form-muted)] outline-hidden transition placeholder:text-gray-400 focus:border-[var(--workspace-form-accent)] dark:text-gray-300"
          placeholder="Helper text"
        />
      </div>

      <label className="mt-4 flex items-center justify-end gap-2 border-t border-[var(--workspace-form-border-soft)] pt-3 text-sm text-[var(--workspace-form-muted)] dark:text-gray-300">
        <input
          type="checkbox"
          checked={field.required}
          onChange={(event) => onUpdate(field.id, { required: event.target.checked })}
          className="h-4 w-4 rounded border-[var(--workspace-form-border)] text-[var(--workspace-form-accent)]"
        />
        Required
      </label>
    </article>
  );
}

function ContextualBuilderToolbar({
  isVisible,
  onAddLongText,
  onAddQuestion,
}: {
  isVisible: boolean;
  onAddLongText: () => void;
  onAddQuestion: () => void;
}) {
  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="pointer-events-auto absolute right-4 top-full z-40 mt-3 flex gap-2 rounded-full border border-[var(--workspace-form-border)] bg-white p-2 shadow-[0_10px_30px_rgba(60,64,67,0.18)] dark:border-gray-800 dark:bg-gray-950 sm:right-0 sm:top-5 sm:mt-0 sm:translate-x-[calc(100%+12px)] sm:flex-col"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onDragStart={(event) => event.preventDefault()}
    >
      <button
        type="button"
        draggable={false}
        onClick={(event) => {
          event.stopPropagation();
          onAddQuestion();
        }}
        className="grid h-12 w-12 place-items-center rounded-full border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] text-xl font-medium text-[var(--workspace-form-accent)] transition hover:bg-[var(--workspace-form-surface-strong)] dark:border-gray-800 dark:bg-gray-900"
        aria-label="Add question"
      >
        +
      </button>
      <button
        type="button"
        draggable={false}
        onClick={(event) => {
          event.stopPropagation();
          onAddLongText();
        }}
        className="grid h-12 w-12 place-items-center rounded-full border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] text-sm font-semibold text-[var(--workspace-form-muted)] transition hover:bg-[var(--workspace-form-surface-strong)] dark:border-gray-800 dark:bg-gray-900"
        aria-label="Add paragraph"
      >
        Tt
      </button>
    </div>
  );
}

function SignalPanel({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "positive" | "caution";
}) {
  const styles = {
    positive: {
      item:
        "border-emerald-100 bg-emerald-50/80 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/[0.10] dark:text-emerald-50",
      dot: "bg-emerald-600/80 dark:bg-emerald-400",
    },
    caution: {
      item:
        "border-amber-100 bg-amber-50/85 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/[0.10] dark:text-amber-50",
      dot: "bg-amber-600/80 dark:bg-amber-400",
    },
  }[tone];

  return (
    <div className="rounded-2xl border border-[var(--workspace-form-border-soft)] bg-white p-5 shadow-[var(--workspace-form-shadow-sm)] dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
          {title}
        </p>
        <span className="text-xs font-medium text-[var(--workspace-form-muted)] dark:text-gray-400">
          {items.length}
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-[var(--workspace-form-muted)] dark:text-gray-300">
            No items surfaced.
          </p>
        ) : (
          items.map((item) => (
            <div
              key={`${title}:${item}`}
              className={`flex gap-3 rounded-xl border px-4 py-3 text-sm leading-7 ${styles.item}`}
            >
              <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${styles.dot}`} />
              <span>{item}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
        {label}
      </p>
      <p className="mt-1 break-words text-sm leading-6 text-[var(--workspace-form-title)] dark:text-white">{value || "-"}</p>
    </div>
  );
}

function InlineLoader({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-700/60 ${className}`} />;
}

function PublishedFormsListSkeleton() {
  return (
    <div aria-busy="true" className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={`published-form-skeleton-${index + 1}`}
          className="rounded-lg border border-[var(--workspace-form-border-soft)] bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-2/3 max-w-[220px]" />
              <SkeletonBlock className="h-3 w-1/3 max-w-[120px]" />
            </div>
            <SkeletonBlock className="h-6 w-20 rounded-full" />
          </div>
          <div className="mt-3 flex gap-2">
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

function FormsGridSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={`forms-grid-skeleton-${index + 1}`}
          className="rounded-xl border border-[var(--workspace-form-border-soft)] bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-3/4" />
              <SkeletonBlock className="h-3 w-1/3" />
            </div>
            <SkeletonBlock className="h-6 w-20 rounded-full" />
          </div>
          <div className="mt-3 flex gap-2">
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ResponsesSectionSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <div className="rounded-2xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-4 shadow-[var(--workspace-form-shadow-sm)] dark:border-gray-800 dark:bg-gray-950/40">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-4 w-full max-w-[320px]" />
          </div>
          <div className="flex gap-2">
            <SkeletonBlock className="h-8 w-28 rounded-full" />
            <SkeletonBlock className="h-8 w-40 rounded-full" />
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={`candidate-list-skeleton-${index + 1}`}
              className="rounded-2xl border border-[var(--workspace-form-border-soft)] bg-white p-4 dark:border-gray-800 dark:bg-gray-900/80"
            >
              <div className="flex items-start gap-3">
                <SkeletonBlock className="h-11 w-11 rounded-2xl" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <SkeletonBlock className="h-4 w-2/3" />
                      <SkeletonBlock className="h-3 w-1/2" />
                    </div>
                    <SkeletonBlock className="h-7 w-12 rounded-xl" />
                  </div>
                  <div className="flex gap-2">
                    <SkeletonBlock className="h-6 w-24 rounded-full" />
                    <SkeletonBlock className="h-6 w-16 rounded-full" />
                  </div>
                  <SkeletonBlock className="h-3 w-28" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <article className="space-y-6">
        <section className="overflow-hidden rounded-2xl border border-[var(--workspace-form-border-soft)] bg-white p-6 shadow-[var(--workspace-form-shadow-md)] dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-6 2xl:flex-row 2xl:items-start 2xl:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <SkeletonBlock className="h-16 w-16 rounded-2xl" />
                <div className="min-w-0 flex-1 space-y-3">
                  <SkeletonBlock className="h-4 w-32" />
                  <SkeletonBlock className="h-9 w-full max-w-[300px]" />
                  <SkeletonBlock className="h-4 w-full max-w-[520px]" />
                  <SkeletonBlock className="h-4 w-40" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 2xl:w-[360px]">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`review-metric-skeleton-${index + 1}`}
                    className="rounded-2xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] px-4 py-3 dark:border-gray-800 dark:bg-gray-950/60"
                  >
                    <SkeletonBlock className="h-3 w-16" />
                    <SkeletonBlock className="mt-3 h-5 w-20" />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <SkeletonBlock className="h-7 w-24 rounded-full" />
              <SkeletonBlock className="h-7 w-28 rounded-full" />
              <SkeletonBlock className="h-7 w-36 rounded-full" />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <SkeletonBlock className="h-11 w-44" />
            <SkeletonBlock className="h-11 w-40" />
          </div>
        </section>

        <div className="grid gap-6 2xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          {Array.from({ length: 2 }).map((_, index) => (
            <section
              key={`detail-section-skeleton-${index + 1}`}
              className="rounded-2xl border border-[var(--workspace-form-border-soft)] bg-white p-5 shadow-[var(--workspace-form-shadow-sm)] dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="space-y-3">
                <SkeletonBlock className="h-4 w-28" />
                <SkeletonBlock className="h-20 w-full" />
                <SkeletonBlock className="h-20 w-full" />
              </div>
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}

function ReviewWorkspaceSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <section className="overflow-hidden rounded-xl border border-[var(--workspace-form-border)] bg-white shadow-[var(--workspace-form-shadow-md)] dark:border-gray-800 dark:bg-gray-900">
        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <SkeletonBlock className="h-6 w-20 rounded-full" />
                <SkeletonBlock className="h-4 w-24" />
              </div>
              <SkeletonBlock className="h-10 w-full max-w-[420px]" />
              <SkeletonBlock className="h-4 w-full max-w-3xl" />
              <SkeletonBlock className="h-4 w-3/4 max-w-2xl" />
            </div>

            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap xl:justify-end">
              {Array.from({ length: 5 }).map((_, index) => (
                <SkeletonBlock
                  key={`review-action-skeleton-${index + 1}`}
                  className="h-11 min-w-[120px]"
                />
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`review-stat-skeleton-${index + 1}`}
                className="rounded-lg border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] px-4 py-3 dark:border-gray-800 dark:bg-gray-950/60"
              >
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="mt-3 h-8 w-16" />
              </div>
            ))}
          </div>
        </div>

        <div className="grid border-t border-[var(--workspace-form-border-soft)] dark:border-gray-800 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4 p-5 sm:p-6">
            <SkeletonBlock className="h-4 w-32" />
            <div className="flex flex-wrap gap-2">
              <SkeletonBlock className="h-7 w-24 rounded-full" />
              <SkeletonBlock className="h-7 w-20 rounded-full" />
              <SkeletonBlock className="h-7 w-24 rounded-full" />
            </div>
            <SkeletonBlock className="h-24 w-full" />
            <div className="grid gap-3 sm:grid-cols-2">
              <SkeletonBlock className="h-24 w-full" />
              <SkeletonBlock className="h-24 w-full" />
            </div>
          </div>

          <aside className="space-y-4 border-t border-[var(--workspace-form-border-soft)] p-5 dark:border-gray-800 lg:border-l lg:border-t-0 sm:p-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`detail-row-skeleton-${index + 1}`} className="space-y-2">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="h-4 w-full" />
              </div>
            ))}
          </aside>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--workspace-form-border)] bg-white shadow-[var(--workspace-form-shadow-md)] dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-[var(--workspace-form-border-soft)] p-5 dark:border-gray-800 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <SkeletonBlock className="h-4 w-32" />
              <SkeletonBlock className="h-8 w-56" />
              <SkeletonBlock className="h-4 w-full max-w-[420px]" />
            </div>
            <SkeletonBlock className="h-8 w-28 rounded-full" />
          </div>
        </div>
        <div className="p-5 sm:p-6">
          <ResponsesSectionSkeleton />
        </div>
      </section>
    </div>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--workspace-form-border)] bg-[var(--workspace-form-surface)] px-4 py-6 text-sm text-[var(--workspace-form-muted)] dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-300">
      {text}
    </div>
  );
}

function StatusBadge({ status }: { status: "active" | "expired" | "unpublished" }) {
  return (
    <span
      className={`rounded-md px-3 py-1 text-xs font-medium ${
        status === "unpublished"
          ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
          : status === "expired"
          ? "bg-[var(--workspace-form-warning-bg)] text-[var(--workspace-form-warning-text)]"
          : "bg-[var(--workspace-form-success-bg)] text-[var(--workspace-form-success-text)]"
      }`}
    >
      {status}
    </span>
  );
}

function MetaTag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-white px-3 py-1 text-xs font-medium text-[var(--workspace-form-pill-text)] shadow-[0_1px_2px_rgba(103,58,183,0.08)] dark:bg-gray-950 dark:text-brand-200 dark:shadow-none">
      {label}
    </span>
  );
}

function getApplicationDisplayName(application: HiringApplicationRecord) {
  return (
    application.analysis.result.candidateProfile.name ||
    application.applicant.fullName ||
    application.resumeFile.fileName
  );
}

function getInitials(value: string) {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "CV";
  }

  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function formatApplicationDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function clampInteger(value: number, min: number, max: number, fallback: number) {
  if (Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

function buildRoleSetup({
  roleTitle,
  roleSeniority,
  roleLocation,
  roleSummary,
  mustHaveSkills,
  niceToHaveSkills,
  interviewFocus,
}: {
  roleTitle: string;
  roleSeniority: string;
  roleLocation: string;
  roleSummary: string;
  mustHaveSkills: string;
  niceToHaveSkills: string;
  interviewFocus: string;
}): RoleSetup {
  return {
    title: roleTitle.trim(),
    seniority: roleSeniority.trim(),
    location: roleLocation.trim(),
    summary: roleSummary.trim(),
    mustHaveSkills: splitList(mustHaveSkills),
    niceToHaveSkills: splitList(niceToHaveSkills),
    interviewFocus: splitList(interviewFocus),
  };
}

const formTemplates: Array<{
  id: FormTemplateId;
  label: string;
  description: string;
}> = [
  { id: "blank", label: "Blank form", description: "Only name, email, and CV." },
  { id: "general", label: "General hiring", description: "Balanced intake for most roles." },
  { id: "technical", label: "Technical role", description: "Skills, links, and experience." },
  { id: "customer", label: "Customer-facing", description: "Service and communication focus." },
];

const fieldTypeOptions: Array<{ label: string; value: HiringFormFieldType }> = [
  { value: "short_text", label: "Short answer" },
  { value: "long_text", label: "Paragraph" },
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "checkboxes", label: "Checkboxes" },
  { value: "dropdown", label: "Dropdown" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "URL" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
];

function FieldTypeIcon({ type }: { type: HiringFormFieldType }) {
  if (type === "checkboxes") {
    return (
      <svg aria-hidden="true" className="h-7 w-7" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="5" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="m8.5 12 2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "dropdown") {
    return (
      <svg aria-hidden="true" className="h-7 w-7" viewBox="0 0 24 24" fill="none">
        <circle cx="7" cy="7" r="1.5" fill="currentColor" />
        <circle cx="7" cy="12" r="1.5" fill="currentColor" />
        <circle cx="7" cy="17" r="1.5" fill="currentColor" />
        <path d="M11 7h7M11 12h7M11 17h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "long_text") {
    return <span className="text-xl font-semibold leading-none">¶</span>;
  }

  if (type === "short_text") {
    return <span className="text-xl font-semibold leading-none">Tt</span>;
  }

  if (type === "multiple_choice") {
    return (
      <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-current">
        <span className="h-3 w-3 rounded-full bg-current" />
      </span>
    );
  }

  return <span className="text-lg font-semibold leading-none">Aa</span>;
}

function buildCustomQuestionsFromFields(fields: HiringFormField[]) {
  return fields
    .filter((field) => !field.systemKey && field.type !== "file")
    .map((field) => ({
      id: field.id,
      label: field.label,
      placeholder: field.placeholder || "Type your answer here",
      required: field.required,
    }));
}

function FieldTypeSelect({
  disabled,
  onChange,
  value,
}: {
  disabled?: boolean;
  onChange: (value: HiringFormFieldType) => void;
  value: HiringFormFieldType;
}) {
  const activeType = fieldTypeOptions.find((option) => option.value === value) ?? fieldTypeOptions[0];

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[var(--workspace-form-muted)]">
        <FieldTypeIcon type={activeType.value} />
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as HiringFormFieldType)}
        disabled={disabled}
        className="h-[58px] w-full appearance-none rounded-lg border border-[var(--workspace-form-border)] bg-white py-3 pl-14 pr-11 text-base text-[var(--workspace-form-title)] outline-hidden transition focus:border-[var(--workspace-form-accent)] focus:ring-4 focus:ring-[var(--workspace-form-accent-soft)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-950 dark:text-white/90"
      >
        {fieldTypeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        {value === "file" ? <option value="file">File upload</option> : null}
      </select>
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--workspace-form-muted)]">
        <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    </div>
  );
}

function ChoiceOptionsEditor({
  fieldType,
  onChange,
  options,
}: {
  fieldType: HiringFormFieldType;
  onChange: (options: string[]) => void;
  options: string[];
}) {
  return (
    <div className="mt-5 space-y-3">
      {options.map((option, index) => (
        <div key={index} className="group flex items-center gap-3">
          <OptionMarker fieldType={fieldType} index={index} />
          <input
            value={option}
            onChange={(event) => {
              const next = [...options];
              next[index] = event.target.value;
              onChange(next);
            }}
            className="w-full border-0 border-b border-[var(--workspace-form-border-soft)] bg-transparent px-0 py-2 text-sm text-[var(--workspace-form-title)] outline-hidden transition placeholder:text-gray-400 focus:border-[var(--workspace-form-accent)] dark:text-white"
            placeholder={`Option ${index + 1}`}
          />
          <button
            type="button"
            onClick={() => onChange(options.filter((_, optionIndex) => optionIndex !== index))}
            disabled={options.length <= 1}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-2xl leading-none text-[var(--workspace-form-muted)] opacity-70 transition hover:bg-[var(--workspace-form-surface)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-20 dark:hover:bg-gray-900"
            aria-label={`Remove option ${index + 1}`}
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex items-center gap-3 pt-1">
        <OptionMarker fieldType={fieldType} index={options.length} />
        <button
          type="button"
          onClick={() => onChange([...options, `Option ${options.length + 1}`])}
          className="border-0 border-b border-transparent px-0 py-2 text-sm text-[var(--workspace-form-muted)] transition hover:border-[var(--workspace-form-border-soft)] hover:text-[var(--workspace-form-title)]"
        >
          Add option
        </button>
        <span className="text-sm text-[var(--workspace-form-muted)]">or</span>
        <button
          type="button"
          onClick={() => onChange([...options, "Other"])}
          className="py-2 text-sm font-medium text-[var(--workspace-form-accent)] hover:text-[var(--workspace-form-accent-muted)]"
        >
          add &quot;Other&quot;
        </button>
      </div>
    </div>
  );
}

function OptionMarker({
  fieldType,
  index,
}: {
  fieldType: HiringFormFieldType;
  index: number;
}) {
  if (fieldType === "dropdown") {
    return (
      <span className="w-6 shrink-0 text-center text-sm text-[var(--workspace-form-muted)]">
        {index + 1}.
      </span>
    );
  }

  return (
    <span
      className={`h-5 w-5 shrink-0 border-2 border-[var(--workspace-form-border)] ${
        fieldType === "checkboxes" ? "rounded" : "rounded-full"
      }`}
    />
  );
}

function prepareFieldsForPublish(fields: HiringFormField[]) {
  const next = [...fields];

  if (!next.some((field) => field.systemKey === "fullName")) {
    next.unshift(createField("system-fullName", "Full name", "short_text", true, "fullName"));
  }

  if (!next.some((field) => field.systemKey === "email")) {
    const insertIndex = next.some((field) => field.systemKey === "fullName") ? 1 : 0;
    next.splice(insertIndex, 0, createField("system-email", "Email address", "email", true, "email"));
  }

  if (!next.some((field) => field.systemKey === "resumeFile")) {
    next.push(
      createField(
        "system-resumeFile",
        "CV or resume",
        "file",
        true,
        "resumeFile",
        "",
        "Accepted formats: PDF, TXT, MD, CSV, JSON, HTML, XML, RTF, PNG, JPG, WEBP, GIF, BMP."
      )
    );
  }

  return next;
}

function buildTemplateFields(templateId: FormTemplateId): HiringFormField[] {
  const base = [
    createField("system-phone", "Phone number", "phone", false, "phone"),
  ];

  if (templateId === "blank") {
    return base;
  }

  const general = [
    createField("system-location", "Location", "short_text", false, "location"),
    createField("system-linkedIn", "LinkedIn profile", "url", false, "linkedIn"),
    createField("system-yearsExperience", "Years of experience", "short_text", false, "yearsExperience"),
    createField("system-noticePeriod", "Notice period", "short_text", false, "noticePeriod"),
    createField("system-salaryExpectation", "Salary expectation", "short_text", false, "salaryExpectation"),
    createField("field-motivation", "Why are you interested in this role?", "long_text", true),
    createField("field-achievement", "Share one relevant achievement.", "long_text", true),
  ];

  if (templateId === "technical") {
    return [
      ...base,
      createField("system-portfolio", "GitHub, portfolio, or website", "url", false, "portfolio"),
      createField("system-yearsExperience", "Years of experience", "short_text", false, "yearsExperience"),
      createField("field-stack", "Which tools, systems, or technologies are you strongest with?", "long_text", true),
      createField("field-project", "Describe a technical project or problem you solved.", "long_text", true),
      createField("field-availability", "When can you start?", "short_text", false, undefined, "Example: Immediately, 2 weeks, 1 month"),
    ];
  }

  if (templateId === "customer") {
    return [
      ...base,
      createField("system-location", "Location", "short_text", false, "location"),
      createField("system-yearsExperience", "Years of customer-facing experience", "short_text", false, "yearsExperience"),
      createField("field-service", "Describe a difficult customer situation you handled well.", "long_text", true),
      createField("field-communication", "What makes your communication style effective?", "long_text", true),
      createField("field-shifts", "Are you available for shifts, weekends, or public holidays?", "short_text", false),
    ];
  }

  return [...base, ...general, createField("system-coverNote", "Short note", "long_text", false, "coverNote")];
}

function createField(
  id: string,
  label: string,
  type: HiringFormFieldType,
  required: boolean,
  systemKey?: HiringFormField["systemKey"],
  placeholder = "",
  helper = ""
): HiringFormField {
  return {
    id,
    label,
    placeholder,
    helper,
    required,
    type,
    options: isChoiceFieldType(type) ? ["Option 1"] : [],
    systemKey,
  };
}

function isChoiceFieldType(type: HiringFormFieldType) {
  return type === "multiple_choice" || type === "checkboxes" || type === "dropdown";
}

function normalizeBuilderOptions(options: unknown) {
  const parsed = Array.isArray(options) ? options : [];
  const normalized = parsed
    .map((option) => (typeof option === "string" ? option.trim() : ""))
    .filter(Boolean)
    .slice(0, 30);

  return normalized.length > 0 ? normalized : ["Option 1"];
}

function getEditableBuilderOptions(options: unknown) {
  if (!Array.isArray(options) || options.length === 0) {
    return ["Option 1"];
  }

  return options
    .map((option) => (typeof option === "string" ? option : ""))
    .slice(0, 30);
}

function splitList(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toDateInputValue(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function hydrateGeneratedFormFields(fields: HiringFormField[]) {
  return fields.map((field, index) => ({
    ...field,
    id:
      typeof field.id === "string" && field.id.trim()
        ? `${field.id.trim()}-${index + 1}`
        : `generated-field-${Date.now()}-${index + 1}`,
    label: field.label?.trim() || `Question ${index + 1}`,
    placeholder: field.placeholder || "",
    helper: field.helper || "",
    required: field.required !== false,
    options: isChoiceFieldType(field.type) ? getEditableBuilderOptions(field.options) : [],
  }));
}

function buildGeneratedJobDescriptionFileName(
  title: string,
  roleTitle: string
) {
  const base = `${roleTitle || title || "job-description"}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${base || "job-description"}-draft.txt`;
}

function describeGeneratedFormDraft(
  provider: "local" | "gemini" | "huggingface",
  providerDetail?: string,
  providerWarnings?: string[]
) {
  const warnings = providerWarnings?.filter(Boolean) ?? [];

  if (provider === "local") {
    return warnings.length > 0
      ? `Generated from the built-in form generator. ${warnings[0]}`
      : "Generated from the built-in form generator using your role brief, skills, and draft notes.";
  }

  const providerLabel = provider === "gemini" ? "Gemini" : "Hugging Face";
  const detailText = providerDetail ? ` (${providerDetail})` : "";
  const warningText = warnings.length > 0 ? ` ${warnings[0]}` : "";

  return `Generated with ${providerLabel}${detailText}. The draft is now loaded into the builder and can be edited before publishing.${warningText}`;
}

function describeGeneratedJobDescription(
  provider: "local" | "gemini" | "huggingface",
  providerDetail?: string,
  providerWarnings?: string[]
) {
  const warnings = providerWarnings?.filter(Boolean) ?? [];

  if (provider === "local") {
    return warnings.length > 0
      ? `Generated from the built-in JD template. ${warnings[0]}`
      : "Generated from the built-in JD template using your role brief and screening notes.";
  }

  const providerLabel = provider === "gemini" ? "Gemini" : "Hugging Face";
  const detailText = providerDetail ? ` (${providerDetail})` : "";
  const warningText = warnings.length > 0 ? ` ${warnings[0]}` : "";

  return `Generated with ${providerLabel}${detailText}. Review and edit the draft before publishing.${warningText}`;
}

const inputClassName =
  "w-full rounded-lg border border-[var(--workspace-form-border)] bg-white px-4 py-3 text-sm text-[var(--workspace-form-title)] outline-hidden transition placeholder:text-gray-400 focus:border-[var(--workspace-form-accent)] focus:ring-4 focus:ring-[var(--workspace-form-accent-soft)] dark:border-gray-700 dark:bg-gray-950 dark:text-white/90 dark:placeholder:text-gray-500";

const uploadFieldClassName =
  "flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-[var(--workspace-form-border)] bg-white px-4 py-3 text-sm text-[var(--workspace-form-muted)] transition hover:bg-[var(--workspace-form-surface)] dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900";
