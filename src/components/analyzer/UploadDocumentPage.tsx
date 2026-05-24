"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDropzone } from "react-dropzone";

import type {
  AnalysisProvider,
  DocumentType,
  RoleSetup,
} from "@/types/document-intelligence";
import type { StoredAnalysisSession } from "@/types/analysis-session";
import { maxUploadSizeBytes } from "@/types/document-intelligence";

const maxBulkScreeningFiles = 25;
const providerOptions: Array<{ value: AnalysisProvider; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "gemini", label: "Gemini" },
  { value: "huggingface", label: "Hugging Face" },
];
const uploadAccept = {
  "application/pdf": [".pdf"],
  "text/plain": [".txt", ".log"],
  "text/markdown": [".md", ".markdown"],
  "text/csv": [".csv"],
  "text/tab-separated-values": [".tsv"],
  "application/json": [".json"],
  "text/html": [".html", ".htm"],
  "application/xml": [".xml"],
  "application/rtf": [".rtf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "image/bmp": [".bmp"],
} as const;
const roleBriefPlaceholder =
  "Example: Screen this for an IT support role. Prioritize hands-on troubleshooting, customer communication, Windows or network support, and measurable impact.";

export default function UploadDocumentPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [jobDescriptionFile, setJobDescriptionFile] = useState<File | null>(null);
  const [provider, setProvider] = useState<AnalysisProvider>("auto");
  const [analysisGoal, setAnalysisGoal] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [roleSeniority, setRoleSeniority] = useState("");
  const [roleLocation, setRoleLocation] = useState("");
  const [roleSummary, setRoleSummary] = useState("");
  const [mustHaveSkills, setMustHaveSkills] = useState("");
  const [niceToHaveSkills, setNiceToHaveSkills] = useState("");
  const [interviewFocus, setInterviewFocus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
  } | null>(null);
  const documentType: DocumentType = "cv";

  const dropzone = useDropzone({
    accept: uploadAccept,
    maxFiles: maxBulkScreeningFiles,
    multiple: true,
    maxSize: maxUploadSizeBytes,
    noClick: true,
    noKeyboard: true,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length === 0) {
        return;
      }

      setFiles((current) => {
        const merged = mergeSelectedFiles(current, acceptedFiles);
        const nextFiles = merged.slice(0, maxBulkScreeningFiles);

        if (merged.length > maxBulkScreeningFiles) {
          setError(`You can screen up to ${maxBulkScreeningFiles} CVs at once.`);
        } else {
          setError(null);
        }

        return nextFiles;
      });
    },
    onDropRejected: (rejections) => {
      const firstError = rejections[0]?.errors[0];

      if (firstError?.code === "too-many-files") {
        setError(`You can screen up to ${maxBulkScreeningFiles} CVs at once.`);
        return;
      }

      if (firstError?.code === "file-too-large") {
        setError("One of those files is larger than 15 MB. Try a smaller export.");
        return;
      }

      setError("Upload PDF, text export, or image files for screening.");
    },
  });

  async function handleAnalyze() {
    if (files.length === 0 || isAnalyzing) {
      return;
    }

    setIsAnalyzing(true);
    setBatchProgress({
      current: 0,
      total: files.length,
      fileName: "",
    });
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
      const completedScreenings: StoredAnalysisSession[] = [];
      const failedFiles: string[] = [];

      for (const [index, file] of files.entries()) {
        setBatchProgress({
          current: index + 1,
          total: files.length,
          fileName: file.name,
        });

        try {
          const formData = new FormData();
          formData.set("file", file);
          formData.set("documentType", documentType);
          formData.set("provider", provider);
          formData.set("roleSetup", JSON.stringify(roleSetup));
          if (jobDescriptionFile) {
            formData.set("jobDescriptionFile", jobDescriptionFile);
          }

          if (analysisGoal.trim()) {
            formData.set("analysisGoal", analysisGoal.trim());
          }

          const result = await fetch("/api/analyze", {
            method: "POST",
            body: formData,
          });

          const payload = (await result.json().catch(() => null)) as
            | { screening?: StoredAnalysisSession; error?: string }
            | null;

          if (!result.ok) {
            throw new Error(
              payload && "error" in payload && payload.error
                ? payload.error
                : "The analysis request failed."
            );
          }

          if (!payload?.screening?.id) {
            throw new Error("The analysis completed, but the screening record could not be saved.");
          }

          completedScreenings.push(payload.screening);
        } catch (submissionError) {
          failedFiles.push(
            submissionError instanceof Error
              ? `${file.name}: ${submissionError.message}`
              : `${file.name}: The analysis request failed.`
          );
        }
      }

      if (completedScreenings.length === 0) {
        throw new Error(
          failedFiles.length > 1
            ? `All ${files.length} screenings failed. First issue: ${failedFiles[0]}`
            : failedFiles[0] || "The analysis request failed."
        );
      }

      const screeningIds = completedScreenings.map((item) => item.id);
      const batchHref = buildResultsHref({
        screeningId: completedScreenings[0].id,
        batchIds: screeningIds.length > 1 ? screeningIds : [],
        batchTotal: files.length,
        batchFailed: failedFiles.length,
      });

      router.push(batchHref);
      return;
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "The analysis request failed."
      );
    } finally {
      setIsAnalyzing(false);
      setBatchProgress(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6 sm:space-y-8 sm:py-8 md:py-12">
      <section className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
          Upload
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
          Upload one CV or screen a full shortlist in bulk
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300">
          Use this flow for first-pass pre-employment vetting. Upload one or more CVs, add the
          role brief once, and each saved review will get its own score, role match, evidence, and
          follow-up points for the same opening.
        </p>
        <div className="flex flex-wrap gap-2">
          <Tag label="CV screening mode" />
          <Tag label="Bulk shortlist screening" />
          <Tag label="Role matching" />
          <Tag label="Workspace screening history" />
          <Tag label="PDF, text, image" />
          <Tag label="15 MB max" />
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div
          {...dropzone.getRootProps()}
          className={`rounded-3xl border border-dashed p-5 transition sm:p-6 ${
            dropzone.isDragActive
              ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10"
              : "border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/70"
          }`}
        >
          <input {...dropzone.getInputProps()} />

          <div className="space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-theme-xs dark:bg-white/5">
              <UploadGlyph />
            </div>

            <div>
              <p className="break-words text-base font-semibold text-gray-900 dark:text-white">
                {files.length > 0
                  ? `${files.length} CV${files.length === 1 ? "" : "s"} ready for screening`
                  : "Drop candidate CVs here or choose them manually"}
              </p>
              <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                {files.length > 0
                  ? `${describeSelectedFiles(files)} selected`
                  : `Supported: PDF, TXT, MD, CSV, JSON, HTML, XML, RTF, PNG, JPG, WEBP, GIF, BMP. Up to ${maxBulkScreeningFiles} files per batch.`}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  dropzone.open();
                }}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 sm:w-auto"
              >
                Choose CVs
              </button>

              {files.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setFiles([]);
                    setError(null);
                  }}
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/5 sm:w-auto"
                >
                  Clear batch
                </button>
              ) : null}
            </div>

            {files.length > 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white/80 p-3 dark:border-gray-800 dark:bg-gray-950/70">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                    Selected CVs
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {files.length} of {maxBulkScreeningFiles} max
                  </p>
                </div>
                <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                  {files.map((selectedFile) => (
                    <div
                      key={buildSelectedFileKey(selectedFile)}
                      className="flex items-start justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-3 dark:border-gray-800 dark:bg-gray-900"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                          {selectedFile.name}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {formatFileSize(selectedFile.size)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setFiles((current) =>
                            current.filter(
                              (fileItem) =>
                                buildSelectedFileKey(fileItem) !==
                                buildSelectedFileKey(selectedFile)
                            )
                          );
                        }}
                        className="inline-flex shrink-0 items-center justify-center rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <Field label="Review mode">
            <div className="flex h-[50px] items-center rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
              Candidate CV screening
            </div>
          </Field>

          <Field label="AI provider">
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value as AnalysisProvider)}
              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-hidden transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
            >
              {providerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-6 rounded-3xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/70">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                Job description attachment
              </p>
              <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
                Optional. Attach the actual JD file and the screening engine will fold it into the
                role benchmark automatically.
              </p>
              <p className="break-words text-sm font-medium text-gray-900 dark:text-white">
                {jobDescriptionFile ? jobDescriptionFile.name : "No JD file attached"}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <label className="inline-flex w-full cursor-pointer items-center justify-center rounded-2xl border border-gray-300 bg-white px-4 py-3 text-center text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/5 sm:w-auto">
                Attach JD file
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
              {jobDescriptionFile ? (
                <button
                  type="button"
                  onClick={() => setJobDescriptionFile(null)}
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/5 sm:w-auto"
                >
                  Remove JD
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-4 rounded-3xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/70">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
              Role setup
            </p>
            <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
              Define the hiring benchmark so the report can score role fit, skills, risks, and
              interview focus more precisely.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Job title">
              <input
                value={roleTitle}
                onChange={(event) => setRoleTitle(event.target.value)}
                placeholder="IT Support Specialist"
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-hidden transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90 dark:placeholder:text-gray-500"
              />
            </Field>

            <Field label="Seniority">
              <input
                value={roleSeniority}
                onChange={(event) => setRoleSeniority(event.target.value)}
                placeholder="Mid-level"
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-hidden transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90 dark:placeholder:text-gray-500"
              />
            </Field>

            <Field label="Location">
              <input
                value={roleLocation}
                onChange={(event) => setRoleLocation(event.target.value)}
                placeholder="Lagos or remote"
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-hidden transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90 dark:placeholder:text-gray-500"
              />
            </Field>
          </div>

          <Field label="Role summary">
            <textarea
              value={roleSummary}
              onChange={(event) => setRoleSummary(event.target.value)}
              placeholder="Summarize the role, success profile, and what a strong candidate should have done before."
              className="min-h-24 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-hidden transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90 dark:placeholder:text-gray-500"
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Must-have skills">
              <textarea
                value={mustHaveSkills}
                onChange={(event) => setMustHaveSkills(event.target.value)}
                placeholder="Windows support, networking, troubleshooting, ticketing"
                className="min-h-24 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-hidden transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90 dark:placeholder:text-gray-500"
              />
            </Field>

            <Field label="Nice-to-have skills">
              <textarea
                value={niceToHaveSkills}
                onChange={(event) => setNiceToHaveSkills(event.target.value)}
                placeholder="Azure, scripting, asset management, SLA reporting"
                className="min-h-24 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-hidden transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90 dark:placeholder:text-gray-500"
              />
            </Field>
          </div>

          <Field label="Interview focus areas">
            <textarea
              value={interviewFocus}
              onChange={(event) => setInterviewFocus(event.target.value)}
              placeholder="Customer communication, escalation handling, ownership, measurable outcomes"
              className="min-h-24 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-hidden transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90 dark:placeholder:text-gray-500"
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Job description / hiring brief">
            <textarea
              value={analysisGoal}
              onChange={(event) => setAnalysisGoal(event.target.value)}
              placeholder={roleBriefPlaceholder}
              className="min-h-28 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-hidden transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-gray-500"
            />
          </Field>
          <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
            Paste the job description, must-have skills, or hiring notes here to improve fit
            scoring and interview questions.
          </p>
          <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
            Image uploads use Gemini OCR first, and Gemini analysis now auto-tries multiple
            free-tier Flash models before falling back to Hugging Face.
          </p>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-200">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
              {files.length > 1
                ? "Each CV is screened one after another, saved to workspace history, and grouped for review in Results."
                : "The saved candidate review opens on its own page after screening completes."}
            </p>
            {batchProgress ? (
              <p className="text-sm font-medium text-brand-600 dark:text-brand-300">
                Screening {batchProgress.current} of {batchProgress.total}
                {batchProgress.fileName ? `: ${batchProgress.fileName}` : ""}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={files.length === 0 || isAnalyzing}
            className="inline-flex w-full items-center justify-center rounded-2xl bg-brand-500 px-5 py-3 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300 dark:disabled:bg-brand-500/50 sm:w-auto"
          >
            {isAnalyzing
              ? files.length > 1
                ? "Screening batch..."
                : "Screening..."
              : files.length > 1
                ? `Screen ${files.length} candidates`
                : "Screen candidate"}
          </button>
        </div>
      </section>
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
      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
      {children}
    </label>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-900 dark:text-gray-300">
      {label}
    </span>
  );
}

function UploadGlyph() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-brand-500"
    >
      <path
        d="M12 15V5M12 5L8.5 8.5M12 5L15.5 8.5M5.5 16.5C4.11929 16.5 3 15.3807 3 14C3 12.7037 3.98826 11.6382 5.25235 11.5155C5.92198 9.11084 8.1233 7.5 10.75 7.5C13.9587 7.5 16.5822 9.90423 16.929 13.0195C18.6239 13.0717 20 14.4801 20 16.1875C20 17.9279 18.5899 19.338 16.8495 19.338H7.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function buildSelectedFileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function mergeSelectedFiles(currentFiles: File[], nextFiles: File[]) {
  const merged = [...currentFiles];
  const seenKeys = new Set(currentFiles.map((file) => buildSelectedFileKey(file)));

  nextFiles.forEach((file) => {
    const key = buildSelectedFileKey(file);

    if (seenKeys.has(key)) {
      return;
    }

    seenKeys.add(key);
    merged.push(file);
  });

  return merged;
}

function describeSelectedFiles(files: File[]) {
  if (files.length === 1) {
    return `${formatFileSize(files[0].size)} ready`;
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  return `${formatFileSize(totalBytes)} across ${files.length} files`;
}

function buildResultsHref({
  screeningId,
  batchIds,
  batchTotal,
  batchFailed,
}: {
  screeningId: string;
  batchIds: string[];
  batchTotal: number;
  batchFailed: number;
}) {
  const searchParams = new URLSearchParams({
    screening: screeningId,
  });

  if (batchIds.length > 1) {
    searchParams.set("batch", batchIds.join(","));
    searchParams.set("batchTotal", String(batchTotal));

    if (batchFailed > 0) {
      searchParams.set("batchFailed", String(batchFailed));
    }
  }

  return `/results?${searchParams.toString()}`;
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
    mustHaveSkills: splitRoleList(mustHaveSkills),
    niceToHaveSkills: splitRoleList(niceToHaveSkills),
    interviewFocus: splitRoleList(interviewFocus),
  };
}

function splitRoleList(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
