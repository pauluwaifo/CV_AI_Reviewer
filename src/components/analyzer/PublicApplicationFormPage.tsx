"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useEffectEvent, useMemo, useState } from "react";

import { buildPublicFormTheme, DEFAULT_WORKSPACE_SETTINGS } from "@/lib/workspace-settings";
import type {
  HiringFormField,
  PublicHiringForm,
  WorkspacePublicSnapshot,
} from "@/types/hiring-funnel";

export default function PublicApplicationFormPage({
  formId,
}: {
  formId: string;
}) {
  const [form, setForm] = useState<PublicHiringForm | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready">("loading");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<{
    applicationId: string;
  } | null>(null);

  const workspace = form?.workspace ?? buildFallbackWorkspace();
  const theme = useMemo(
    () => buildPublicFormTheme(workspace.formAccent),
    [workspace.formAccent]
  );

  const loadForm = useEffectEvent(async () => {
    setLoadState("loading");
    setError(null);

    try {
      const response = await fetch(`/api/forms/${formId}?view=public`, { cache: "no-store" });
      const payload = (await response.json()) as { form?: PublicHiringForm; error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "I couldn't load this application form.");
      }

      setForm(payload.form ?? null);
      setLoadState("ready");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "I couldn't load this application form."
      );
      setLoadState("ready");
    }
  });

  useEffect(() => {
    void loadForm();
  }, [formId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form || isSubmitting) {
      return;
    }

    const submittedForm = event.currentTarget;
    setIsSubmitting(true);
    setError(null);

    try {
      const formData = new FormData(submittedForm);
      const response = await fetch(`/api/forms/${form.id}/apply`, {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        applicationId?: string;
        summary?: { decision: string; score: number };
        error?: string;
      };

      if (!response.ok || !payload.applicationId) {
        throw new Error(payload.error || "I couldn't submit your application.");
      }

      setSuccess({
        applicationId: payload.applicationId,
      });
      submittedForm.reset();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "I couldn't submit your application."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loadState === "loading") {
    return (
      <PageShell theme={theme}>
        <AlertPanel theme={theme}>Loading application form...</AlertPanel>
      </PageShell>
    );
  }

  if (error && !form) {
    return (
      <PageShell theme={theme}>
        <DangerPanel theme={theme}>{error}</DangerPanel>
      </PageShell>
    );
  }

  if (!form) {
    return null;
  }

  if (form.status === "expired") {
    return (
      <PageShell theme={theme}>
        <section
          className="mx-auto max-w-4xl overflow-hidden rounded-2xl bg-white"
          style={{ border: `1px solid ${theme.border}`, boxShadow: theme.shadowLg }}
        >
          {workspace.formHeaderImageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={workspace.formHeaderImageDataUrl}
              alt=""
              className="h-40 w-full object-cover sm:h-52"
            />
          ) : null}
          <div style={{ height: 12, backgroundColor: theme.accent }} />
          <div className="space-y-4 p-6 sm:p-8">
            <p
              className="text-xs font-semibold uppercase tracking-[0.18em]"
              style={{ color: theme.accent }}
            >
              Form expired
            </p>
            <h1 className="text-3xl font-semibold tracking-tight" style={{ color: theme.title }}>
              This application form is no longer accepting submissions
            </h1>
            <p className="text-sm leading-7" style={{ color: theme.body }}>
              {workspace.organizationName} closed this intake on{" "}
              {form.expiresAt ? new Date(form.expiresAt).toLocaleDateString() : "an earlier date"}.
            </p>
          </div>
        </section>
      </PageShell>
    );
  }

  if (form.status === "unpublished") {
    return (
      <PageShell theme={theme}>
        <DangerPanel theme={theme}>
          This application form is currently unpublished and not accepting submissions.
        </DangerPanel>
      </PageShell>
    );
  }

  if (success) {
    return (
      <PageShell theme={theme}>
        <div className="mx-auto max-w-4xl space-y-5">
          <section
            className="overflow-hidden rounded-2xl bg-white"
            style={{ border: `1px solid ${theme.border}`, boxShadow: theme.shadowLg }}
          >
            {workspace.formHeaderImageDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={workspace.formHeaderImageDataUrl}
                alt=""
                className="h-40 w-full object-cover sm:h-52"
              />
            ) : null}
            <div style={{ height: 12, backgroundColor: theme.accent }} />
            <div className="space-y-5 p-6 sm:p-8">
              <p
                className="text-xs font-semibold uppercase tracking-[0.18em]"
                style={{ color: theme.accent }}
              >
                Response recorded
              </p>
              <h1 className="text-3xl font-semibold tracking-tight" style={{ color: theme.title }}>
                Your form has been submitted
              </h1>
              <p className="max-w-2xl text-sm leading-7" style={{ color: theme.body }}>
                Your response has been received by {workspace.organizationName}. You can edit your
                response and submit again if you need to correct anything.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSuccess(null);
                  setError(null);
                }}
                className="inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-medium text-white transition"
                style={{ backgroundColor: theme.accent }}
              >
                Edit response
              </button>
            </div>
          </section>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell theme={theme}>
      <div className="mx-auto max-w-4xl space-y-5">
        <section
          className="overflow-hidden rounded-2xl bg-white"
          style={{ border: `1px solid ${theme.border}`, boxShadow: theme.shadowLg }}
        >
          {workspace.formHeaderImageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={workspace.formHeaderImageDataUrl}
              alt=""
              className="h-40 w-full object-cover sm:h-52"
            />
          ) : null}
          <div style={{ height: 12, backgroundColor: theme.accent }} />
          <div className="space-y-5 p-6 sm:p-8">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p
                  className="text-xs font-semibold uppercase tracking-[0.18em]"
                  style={{ color: theme.accent }}
                >
                  {workspace.organizationName} hiring form
                </p>
                <span
                  className="rounded-full px-3 py-1 text-xs font-medium"
                  style={{ backgroundColor: theme.accentSoft, color: theme.accentHover }}
                >
                  Powered by {workspace.appName}
                </span>
              </div>

              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ color: theme.title }}>
                  {form.title}
                </h1>
                <p className="text-base leading-8" style={{ color: theme.body }}>
                  {form.intro ||
                    "Submit your CV and answer the required questions for the hiring team."}
                </p>
                <p className="text-sm leading-7" style={{ color: theme.bodyStrong }}>
                  {workspace.tagline}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {form.team ? <Tag label={form.team} theme={theme} /> : null}
              {form.roleSetup.title ? <Tag label={form.roleSetup.title} theme={theme} /> : null}
              {form.roleSetup.seniority ? (
                <Tag label={form.roleSetup.seniority} theme={theme} />
              ) : null}
              {form.roleSetup.location ? (
                <Tag label={form.roleSetup.location} theme={theme} />
              ) : null}
            </div>

            <div
              className="rounded-2xl px-4 py-4"
              style={{ backgroundColor: theme.surface, border: `1px solid ${theme.borderSoft}` }}
            >
              <p className="font-medium" style={{ color: theme.title }}>
                Before you submit
              </p>
              <p className="mt-2 text-sm leading-7" style={{ color: theme.body }}>
                Questions marked with an asterisk are required. Your application is screened
                automatically first, then reviewed by the hiring team.
              </p>
            </div>
          </div>
        </section>

        {form.roleSetup.summary ? (
          <SectionCard theme={theme} eyebrow="Role context">
            <p className="text-sm leading-7" style={{ color: theme.body }}>
              {form.roleSetup.summary}
            </p>
          </SectionCard>
        ) : null}

        {error ? <DangerPanel theme={theme}>{error}</DangerPanel> : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          {form.formFields.map((field) => (
            <QuestionCard
              key={field.id}
              label={field.label}
              required={field.required}
              helper={field.helper}
              theme={theme}
            >
              <PublicFormFieldInput field={field} theme={theme} />
            </QuestionCard>
          ))}

          <div className="flex flex-col gap-3 px-1 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center rounded-xl px-6 py-3 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              style={{ backgroundColor: theme.accent }}
            >
              {isSubmitting ? "Submitting..." : "Submit application"}
            </button>
            <p className="text-sm leading-6" style={{ color: theme.body }}>
              Your application goes directly into {workspace.organizationName}
              {"'"}s review workspace.
            </p>
          </div>
        </form>
      </div>
    </PageShell>
  );
}

function PageShell({
  theme,
  children,
}: {
  theme: ReturnType<typeof buildPublicFormTheme>;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 sm:py-10" style={{ backgroundColor: theme.page }}>
      {children}
    </div>
  );
}

function SectionCard({
  theme,
  eyebrow,
  children,
}: {
  theme: ReturnType<typeof buildPublicFormTheme>;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-2xl bg-white p-5 sm:p-6"
      style={{ border: `1px solid ${theme.border}`, boxShadow: theme.shadowSm }}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: theme.accent }}>
        {eyebrow}
      </p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function QuestionCard({
  label,
  required,
  helper,
  theme,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  theme: ReturnType<typeof buildPublicFormTheme>;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-2xl bg-white p-5 sm:p-6"
      style={{ border: `1px solid ${theme.border}`, boxShadow: theme.shadowSm }}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1">
          <h2 className="text-base font-medium" style={{ color: theme.title }}>
            {label}
          </h2>
          {required ? <span className="text-base text-[#d93025]">*</span> : null}
        </div>
        {helper ? (
          <p className="text-sm leading-6" style={{ color: theme.body }}>
            {helper}
          </p>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PublicFormFieldInput({
  field,
  theme,
}: {
  field: HiringFormField;
  theme: ReturnType<typeof buildPublicFormTheme>;
}) {
  const name = field.systemKey ?? `field:${field.id}`;
  const placeholder = field.placeholder || "Type your answer";

  if (field.type === "file") {
    return (
      <input
        name={field.systemKey === "resumeFile" ? "resumeFile" : name}
        type="file"
        required={field.required}
        accept=".pdf,.txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.xml,.rtf,.log,.png,.jpg,.jpeg,.webp,.gif,.bmp"
        className={fileInputClassName}
        style={buildFileInputStyle(theme)}
      />
    );
  }

  if (field.type === "long_text" || field.systemKey === "coverNote") {
    return (
      <textarea
        name={name}
        required={field.required}
        placeholder={placeholder}
        className={`${inputClassName} min-h-28`}
        style={buildInputStyle(theme)}
      />
    );
  }

  if (field.type === "multiple_choice") {
    return (
      <div className="space-y-3">
        {normalizeFieldOptions(field.options).map((option) => (
          <label key={option} className="flex items-center gap-3 text-sm" style={{ color: theme.bodyStrong }}>
            <input
              name={name}
              type="radio"
              value={option}
              required={field.required}
              className="h-4 w-4"
              style={{ accentColor: theme.accent }}
            />
            {option}
          </label>
        ))}
      </div>
    );
  }

  if (field.type === "checkboxes") {
    return (
      <div className="space-y-3">
        {normalizeFieldOptions(field.options).map((option) => (
          <label key={option} className="flex items-center gap-3 text-sm" style={{ color: theme.bodyStrong }}>
            <input
              name={name}
              type="checkbox"
              value={option}
              className="h-4 w-4 rounded"
              style={{ accentColor: theme.accent }}
            />
            {option}
          </label>
        ))}
      </div>
    );
  }

  if (field.type === "dropdown") {
    return (
      <select
        name={name}
        required={field.required}
        className={inputClassName}
        style={buildInputStyle(theme)}
        defaultValue=""
      >
        <option value="" disabled>
          Choose an option
        </option>
        {normalizeFieldOptions(field.options).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      name={name}
      type={toHtmlInputType(field.type)}
      required={field.required}
      placeholder={placeholder}
      className={inputClassName}
      style={buildInputStyle(theme)}
    />
  );
}

function normalizeFieldOptions(options: HiringFormField["options"]) {
  const normalized = Array.isArray(options)
    ? options.map((option) => option.trim()).filter(Boolean)
    : [];

  return normalized.length > 0 ? normalized : ["Option 1"];
}

function toHtmlInputType(type: HiringFormField["type"]) {
  if (type === "email" || type === "url" || type === "number" || type === "date") {
    return type;
  }

  if (type === "phone") {
    return "tel";
  }

  return "text";
}

function Tag({
  label,
  theme,
}: {
  label: string;
  theme: ReturnType<typeof buildPublicFormTheme>;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
      style={{ backgroundColor: theme.accentSoft, color: theme.accentHover }}
    >
      {label}
    </span>
  );
}

function AlertPanel({
  theme,
  children,
}: {
  theme: ReturnType<typeof buildPublicFormTheme>;
  children: ReactNode;
}) {
  return (
    <div
      className="mx-auto max-w-3xl rounded-2xl bg-white p-6 text-sm"
      style={{ border: `1px solid ${theme.border}`, color: theme.body, boxShadow: theme.shadowMd }}
    >
      {children}
    </div>
  );
}

function DangerPanel({
  theme,
  children,
}: {
  theme: ReturnType<typeof buildPublicFormTheme>;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-2xl px-4 py-3 text-sm"
      style={{
        border: `1px solid ${theme.dangerBorder}`,
        backgroundColor: theme.dangerBg,
        color: theme.dangerText,
        boxShadow: theme.shadowSm,
      }}
    >
      {children}
    </div>
  );
}

function buildFallbackWorkspace(): WorkspacePublicSnapshot {
  return {
    appName: DEFAULT_WORKSPACE_SETTINGS.appName,
    organizationName: DEFAULT_WORKSPACE_SETTINGS.organizationName,
    tagline: DEFAULT_WORKSPACE_SETTINGS.tagline,
    workspaceId: DEFAULT_WORKSPACE_SETTINGS.workspaceId,
    dashboardAccent: DEFAULT_WORKSPACE_SETTINGS.dashboardAccent,
    formAccent: DEFAULT_WORKSPACE_SETTINGS.formAccent,
    formHeaderImageDataUrl: DEFAULT_WORKSPACE_SETTINGS.formHeaderImageDataUrl,
  };
}

function buildInputStyle(theme: ReturnType<typeof buildPublicFormTheme>) {
  return {
    borderColor: theme.border,
    color: theme.title,
    boxShadow: "none",
  };
}

function buildFileInputStyle(theme: ReturnType<typeof buildPublicFormTheme>) {
  return {
    borderColor: theme.border,
    color: theme.title,
  };
}

const inputClassName =
  "w-full rounded-xl border bg-white px-4 py-3 text-sm outline-hidden transition placeholder:text-gray-400 focus:ring-4";

const fileInputClassName =
  "w-full rounded-xl border bg-white px-4 py-3 text-sm outline-hidden transition file:mr-4 file:rounded-lg file:border-0 file:px-4 file:py-2 file:text-sm file:font-medium";
