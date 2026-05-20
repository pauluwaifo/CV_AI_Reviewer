"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useWorkspace } from "@/context/WorkspaceContext";
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

type FormTemplateId = "blank" | "general" | "technical" | "customer";

export default function PipelineDashboardPage() {
  const { settings } = useWorkspace();
  const [forms, setForms] = useState<HiringFormListItem[]>([]);
  const [selectedFormId, setSelectedFormId] = useState("");
  const [selectedForm, setSelectedForm] = useState<HiringFormDetail | null>(null);
  const [selectedApplicationId, setSelectedApplicationId] = useState("");
  const [pipelineTab, setPipelineTab] = useState<PipelineTab>("create");
  const [builderView, setBuilderView] = useState<BuilderView>("questions");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [detailState, setDetailState] = useState<LoadState>("idle");
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

  const selectedApplication = useMemo(
    () => selectedForm?.applications.find((item) => item.id === selectedApplicationId) ?? null,
    [selectedApplicationId, selectedForm]
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
        nextSelectedFormId || selectedFormId || nextForms[0]?.id || "";

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
  }, [selectedFormId, settings.workspaceId, workspaceHeaders]);

  const loadFormDetail = useCallback(async (formId: string) => {
    setDetailState("loading");
    setError(null);

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
      setSelectedApplicationId("");
      setDetailState("ready");
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "I couldn't load that form."
      );
      setDetailState("ready");
    }
  }, [settings.workspaceId, workspaceHeaders]);

  useEffect(() => {
    void refreshForms();
  }, [refreshForms]);

  useEffect(() => {
    if (!selectedFormId) {
      setSelectedForm(null);
      return;
    }

    void loadFormDetail(selectedFormId);
  }, [loadFormDetail, selectedFormId]);

  async function handleSaveForm() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const roleSetup = buildRoleSetup({
        roleTitle,
        roleSeniority,
        roleLocation,
        roleSummary,
        mustHaveSkills,
        niceToHaveSkills,
        interviewFocus,
      });
      const formData = new FormData();
      formData.set("title", title.trim());
      formData.set("team", team.trim());
      formData.set("intro", intro.trim());
      formData.set("analysisGoal", analysisGoal.trim());
      formData.set("roleSetup", JSON.stringify(roleSetup));
      const publishFields = prepareFieldsForPublish(formFields);
      formData.set("customQuestions", JSON.stringify(buildCustomQuestionsFromFields(publishFields)));
      formData.set("formFields", JSON.stringify(publishFields));

      if (expiresAt) {
        formData.set("expiresAt", expiresAt);
      }

      if (jobDescriptionFile) {
        formData.set("jobDescriptionFile", jobDescriptionFile);
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
    setJobDescriptionFile(null);
  }

  function editSelectedForm(form: HiringFormDetail) {
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
    <div className="mx-auto max-w-7xl space-y-6 py-6 sm:py-8 md:py-10">
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
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <article className="rounded-xl border border-[var(--workspace-form-border)] bg-[var(--workspace-form-page)] p-4 shadow-[0_8px_30px_rgba(103,58,183,0.06)] dark:border-gray-800 dark:bg-gray-900 sm:p-6">
            <div className="mx-auto max-w-3xl space-y-4">
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
                  <div className="grid gap-3 sm:grid-cols-3">
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
                    <label className={uploadFieldClassName}>
                      <span className="min-w-0 truncate text-left">
                        {jobDescriptionFile ? jobDescriptionFile.name : "Attach JD"}
                      </span>
                      <input
                        type="file"
                        accept=".pdf,.txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.xml,.rtf,.log,.png,.jpg,.jpeg,.webp,.gif,.bmp"
                        className="sr-only"
                        onChange={(event) => {
                          const nextFile = event.target.files?.[0] ?? null;
                          setJobDescriptionFile(nextFile);
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-center border-b border-[var(--workspace-form-border-soft)]">
                <button
                  type="button"
                  onClick={() => setBuilderView("questions")}
                  className={`px-5 py-3 text-sm font-medium ${
                    builderView === "questions"
                      ? "border-b-2 border-[var(--workspace-form-accent)] text-[var(--workspace-form-accent)]"
                      : "text-[var(--workspace-form-muted)]"
                  }`}
                >
                  Questions
                </button>
                <button
                  type="button"
                  onClick={() => setBuilderView("templates")}
                  className={`px-5 py-3 text-sm font-medium ${
                    builderView === "templates"
                      ? "border-b-2 border-[var(--workspace-form-accent)] text-[var(--workspace-form-accent)]"
                      : "text-[var(--workspace-form-muted)]"
                  }`}
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
                        className="rounded-xl border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-4 text-left text-sm font-medium text-[var(--workspace-form-title)] transition hover:border-[var(--workspace-form-accent)] hover:bg-[var(--workspace-form-surface-strong)] dark:border-gray-800 dark:bg-gray-900/70 dark:text-white"
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
                      className="relative rounded-xl border border-dashed border-[var(--workspace-form-border)] bg-white p-8 text-center text-sm text-[var(--workspace-form-muted)] shadow-[0_2px_8px_rgba(60,64,67,0.08)] outline-hidden transition focus:border-[var(--workspace-form-accent)] dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
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
                className="inline-flex w-full items-center justify-center rounded-lg border border-[var(--workspace-form-border)] bg-white px-4 py-3 text-sm font-medium text-[var(--workspace-form-muted)] transition hover:bg-[var(--workspace-form-surface)] dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/5 sm:w-auto"
              >
                Reset draft
              </button>
              <button
                type="button"
                onClick={handleSaveForm}
                disabled={!title.trim() || isSubmitting}
                className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--workspace-form-accent)] px-5 py-3 text-sm font-medium text-[var(--workspace-form-accent-text)] shadow-theme-xs transition hover:bg-[var(--workspace-form-accent-muted)] disabled:cursor-not-allowed disabled:bg-[var(--workspace-form-border)] sm:w-auto"
              >
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

          <aside className="space-y-5">
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
                  <EmptyMessage text="Loading forms..." />
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
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--workspace-form-muted)] dark:text-gray-400">
                        <span>{form.applicationCount} responses</span>
                        <span>/</span>
                        <span>{form.topScore ? `Top score ${form.topScore}` : "No scores yet"}</span>
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
        <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <article className="rounded-xl border border-[var(--workspace-form-border)] bg-white p-5 shadow-[var(--workspace-form-shadow-md)] dark:border-gray-800 dark:bg-gray-900 sm:p-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6f63a1] dark:text-gray-400">
                  Submitted forms
                </p>
                <p className="text-sm leading-6 text-[#5f6368] dark:text-gray-300">
                  Choose a form to review its responses, export data, and download applicant CVs.
                </p>
              </div>

              <div className="mt-5 space-y-3">
                {loadState === "loading" ? (
                  <EmptyMessage text="Loading forms..." />
                ) : forms.length === 0 ? (
                  <div className="space-y-4">
                    <EmptyMessage text="No forms yet. Create one first to start receiving submissions." />
                    <button
                      type="button"
                      onClick={() => setPipelineTab("create")}
                      className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--workspace-form-accent)] px-4 py-3 text-sm font-medium text-[var(--workspace-form-accent-text)] shadow-theme-xs transition hover:bg-[var(--workspace-form-accent-muted)]"
                    >
                      Create form
                    </button>
                  </div>
                ) : (
                  forms.map((form) => (
                    <button
                      key={form.id}
                      type="button"
                      onClick={() => {
                        setSelectedFormId(form.id);
                        setSelectedApplicationId("");
                      }}
                      className={`w-full rounded-lg border px-4 py-4 text-left transition ${
                        selectedFormId === form.id
                          ? "border-[var(--workspace-form-border)] bg-[var(--workspace-form-pill-bg)] dark:border-brand-500/30 dark:bg-brand-500/10"
                          : "border-[var(--workspace-form-border-soft)] bg-white hover:border-[var(--workspace-form-border)] hover:bg-[var(--workspace-form-surface)] dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 dark:hover:bg-gray-900/80"
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
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#5f6368] dark:text-gray-400">
                        <span>{form.applicationCount} responses</span>
                        <span>/</span>
                        <span>{form.topScore ? `Top score ${form.topScore}` : "No scores yet"}</span>
                      </div>
                    </button>
                  ))
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
              </div>
            </article>
          </aside>

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
                          className="inline-flex items-center justify-center rounded-lg border border-[var(--workspace-form-border-soft)] bg-white px-4 py-2.5 text-sm font-medium text-[#5f6368] transition hover:bg-[var(--workspace-form-surface)] dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/5"
                        >
                          Edit form
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleSelectedFormPublished(selectedForm)}
                          disabled={isPublishingToggle}
                          className="inline-flex items-center justify-center rounded-lg border border-[var(--workspace-form-border-soft)] bg-white px-4 py-2.5 text-sm font-medium text-[#5f6368] transition hover:bg-[var(--workspace-form-surface)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/5"
                        >
                          {isPublishingToggle
                            ? "Updating..."
                            : selectedForm.status === "unpublished"
                              ? "Publish"
                              : "Unpublish"}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard.writeText(selectedForm.publicUrl);
                          }}
                          className="inline-flex items-center justify-center rounded-lg border border-[var(--workspace-form-border-soft)] bg-white px-4 py-2.5 text-sm font-medium text-[#5f6368] transition hover:bg-[var(--workspace-form-surface)] dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/5"
                        >
                          Copy link
                        </button>
                        <a
                          href={appendWorkspaceQuery(
                            `/api/forms/${selectedForm.id}?export=csv`,
                            settings.workspaceId
                          )}
                          className="inline-flex items-center justify-center rounded-lg border border-[var(--workspace-form-border-soft)] bg-white px-4 py-2.5 text-sm font-medium text-[#5f6368] transition hover:bg-[var(--workspace-form-surface)] dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/5"
                        >
                          Export CSV
                        </a>
                        <button
                          type="button"
                          onClick={() => void handleDeleteForm(selectedForm.id)}
                          disabled={isDeleting === selectedForm.id}
                          className="col-span-2 inline-flex items-center justify-center rounded-lg border border-[#f1b7b1] bg-white px-4 py-2.5 text-sm font-medium text-[#a50e0e] transition hover:bg-[#fce8e6] disabled:cursor-not-allowed dark:border-error-500/30 dark:bg-transparent dark:text-error-200 dark:hover:bg-error-500/10 sm:col-span-1"
                        >
                          {isDeleting === selectedForm.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <ReviewStat label="Responses" value={String(selectedForm.applicationCount)} />
                      <ReviewStat
                        label="Top score"
                        value={selectedForm.topScore ? String(selectedForm.topScore) : "-"}
                      />
                      <ReviewStat label="Questions" value={String(selectedForm.formFields.length)} />
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
                      <EmptyMessage text="Loading responses..." />
                    </div>
                  ) : selectedForm.applications.length === 0 ? (
                    <div className="p-5 sm:p-6">
                      <EmptyMessage text="No applications yet for this form." />
                    </div>
                  ) : (
                    <div className="grid min-h-[560px] lg:grid-cols-[320px_minmax(0,1fr)]">
                      <div className="border-b border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-4 dark:border-gray-800 dark:bg-gray-950/40 lg:border-b-0 lg:border-r">
                        <div className="space-y-3">
                          {selectedForm.applications.map((application) => (
                            <CandidateListItem
                              key={application.id}
                              application={application}
                              isActive={selectedApplicationId === application.id}
                              onClick={() => setSelectedApplicationId(application.id)}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="p-4 sm:p-6">
                      {selectedApplication ? (
                        <ApplicationReviewCard
                          application={selectedApplication}
                          isDeleting={isDeleting === selectedApplication.id}
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
              <EmptyMessage text="Loading selected form..." />
            ) : (
              <div className="rounded-xl border border-[var(--workspace-form-border)] bg-white p-6 shadow-[var(--workspace-form-shadow-md)] dark:border-gray-800 dark:bg-gray-900">
                <EmptyMessage text="Select a form to review its submissions and export responses." />
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function ApplicationReviewCard({
  application,
  isDeleting,
  onDelete,
  questions,
}: {
  application: HiringApplicationRecord;
  isDeleting: boolean;
  onDelete: () => void;
  questions: HiringFormDetail["formFields"];
}) {
  const { settings } = useWorkspace();
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
    <article className="space-y-5">
      <div className="rounded-xl border border-[var(--workspace-form-border-soft)] bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
              Candidate review
            </p>
            <h3 className="mt-2 break-words text-2xl font-semibold text-[var(--workspace-form-title)] dark:text-white">
              {application.analysis.result.candidateProfile.name ||
                application.applicant.fullName ||
                application.resumeFile.fileName}
            </h3>
            <p className="mt-2 text-sm text-[var(--workspace-form-muted)] dark:text-gray-300">
              Submitted {new Date(application.createdAt).toLocaleString()} /{" "}
              {application.analysis.meta.inputKind}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-lg bg-[var(--workspace-form-pill-bg)] px-3 py-2 text-sm font-semibold text-[var(--workspace-form-pill-text)] dark:bg-brand-500/15 dark:text-brand-200">
              {application.analysis.result.recommendation.decision}
            </span>
            <span className="rounded-lg bg-[var(--workspace-form-pill-bg)] px-3 py-2 text-sm font-semibold text-[var(--workspace-form-pill-text)] dark:bg-brand-500/15 dark:text-brand-200">
              Score {application.analysis.result.score.value}
            </span>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <a
            href={appendWorkspaceQuery(
              `/api/applications/${application.id}`,
              settings.workspaceId
            )}
            className="inline-flex items-center justify-center rounded-lg bg-[var(--workspace-form-accent)] px-4 py-2.5 text-sm font-medium text-[var(--workspace-form-accent-text)] shadow-theme-xs transition hover:bg-[var(--workspace-form-accent-muted)]"
          >
            Download CV
          </a>
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            className="inline-flex items-center justify-center rounded-lg border border-[#f1b7b1] px-4 py-2.5 text-sm font-medium text-[#a50e0e] transition hover:bg-[#fce8e6] disabled:cursor-not-allowed dark:border-error-500/30 dark:text-error-200 dark:hover:bg-error-500/10"
          >
            {isDeleting ? "Deleting..." : "Delete response"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)]">
        <section className="rounded-xl border border-[var(--workspace-form-border-soft)] bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
            Applicant details
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
            {profileDetails.map(([label, value]) => (
              <DetailRow key={label} label={label} value={value} />
            ))}
          </div>
        </section>

        <section className="space-y-5 rounded-xl border border-[var(--workspace-form-border-soft)] bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
              AI summary
            </p>
            <p className="mt-3 rounded-lg bg-[var(--workspace-form-surface)] p-4 text-sm leading-7 text-[var(--workspace-form-muted)] dark:bg-gray-950/60 dark:text-gray-300">
              {application.analysis.result.summary}
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
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
            <div className="rounded-lg border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-4 dark:border-gray-800 dark:bg-gray-950/60">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
                Screening answers
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {Object.entries(application.applicant.customAnswers).map(([label, answer]) => (
                  <div key={label} className="rounded-lg bg-white p-4 dark:bg-gray-900">
                    <p className="text-sm font-medium text-[var(--workspace-form-title)] dark:text-white">
                      {questions.find((item) => item.id === label)?.label || label}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--workspace-form-muted)] dark:text-gray-300">
                      {answer || "-"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </article>
  );
}

function CandidateListItem({
  application,
  isActive,
  onClick,
}: {
  application: HiringApplicationRecord;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-4 text-left transition ${
        isActive
          ? "border-[var(--workspace-form-accent)] bg-white shadow-[0_8px_24px_rgba(103,58,183,0.10)] dark:bg-gray-900"
          : "border-[var(--workspace-form-border-soft)] bg-white/70 hover:border-[var(--workspace-form-border)] hover:bg-white dark:border-gray-800 dark:bg-gray-900/60 dark:hover:bg-gray-900"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--workspace-form-title)] dark:text-white">
            {application.applicant.fullName || application.resumeFile.fileName}
          </p>
          <p className="mt-1 truncate text-xs text-[var(--workspace-form-muted)] dark:text-gray-400">
            {application.applicant.email || "No email"}
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-[var(--workspace-form-pill-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--workspace-form-pill-text)] dark:bg-brand-500/15 dark:text-brand-200">
          {application.analysis.result.score.value}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--workspace-form-muted)] dark:text-gray-400">
        <span>{application.analysis.result.recommendation.decision}</span>
        <span>/</span>
        <span>{application.analysis.meta.inputKind}</span>
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
      className={`group relative rounded-xl border bg-white p-4 shadow-[0_2px_8px_rgba(60,64,67,0.15)] transition hover:shadow-[0_6px_18px_rgba(60,64,67,0.2)] dark:bg-gray-950 ${
        isActive
          ? "border-[var(--workspace-form-accent)]"
          : "border-[var(--workspace-form-border)] dark:border-gray-800"
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
    <div className="absolute right-4 top-full z-20 mt-3 flex gap-2 rounded-full border border-[var(--workspace-form-border)] bg-white p-2 shadow-[0_10px_30px_rgba(60,64,67,0.18)] dark:border-gray-800 dark:bg-gray-950 sm:right-0 sm:top-5 sm:mt-0 sm:translate-x-[calc(100%+12px)] sm:flex-col">
      <button
        type="button"
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
  return (
    <div className="rounded-lg border border-[var(--workspace-form-border-soft)] bg-[var(--workspace-form-surface)] p-4 dark:border-gray-800 dark:bg-gray-900/70">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--workspace-form-accent-muted)] dark:text-gray-400">
        {title}
      </p>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-[var(--workspace-form-muted)] dark:text-gray-300">No items surfaced.</p>
        ) : (
          items.map((item) => (
            <div
              key={`${title}:${item}`}
              className={`rounded-md px-3 py-3 text-sm leading-6 ${
                tone === "positive"
                  ? "bg-[var(--workspace-form-success-bg)] text-[var(--workspace-form-success-text)]"
                  : "bg-[var(--workspace-form-warning-bg)] text-[var(--workspace-form-warning-text)]"
              }`}
            >
              {item}
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

const inputClassName =
  "w-full rounded-lg border border-[var(--workspace-form-border)] bg-white px-4 py-3 text-sm text-[var(--workspace-form-title)] outline-hidden transition placeholder:text-gray-400 focus:border-[var(--workspace-form-accent)] focus:ring-4 focus:ring-[var(--workspace-form-accent-soft)] dark:border-gray-700 dark:bg-gray-950 dark:text-white/90 dark:placeholder:text-gray-500";

const uploadFieldClassName =
  "flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-[var(--workspace-form-border)] bg-white px-4 py-3 text-sm text-[var(--workspace-form-muted)] transition hover:bg-[var(--workspace-form-surface)] dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900";
