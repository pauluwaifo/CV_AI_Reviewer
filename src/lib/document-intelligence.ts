import "server-only";

import path from "node:path";
import { pathToFileURL } from "node:url";

import { PDFParse } from "pdf-parse";

import { buildLocalAnalysis } from "@/lib/local-document-analysis";
import {
  buildLocalWorkspaceAssistantReply,
  buildWorkspaceAssistantSystemPrompt,
  type WorkspaceAssistantContext,
  type WorkspaceAssistantMessage,
} from "@/lib/workspace-assistant";
import type {
  HiringFormField,
  HiringFormFieldType,
} from "@/types/hiring-funnel";
import type {
  AnalysisProvider,
  AnalysisResponse,
  AnalysisResult,
  CandidateProfile,
  DocumentType,
  EvidencePoint,
  ExtractedFact,
  HiringRecommendation,
  RemoteProvider,
  RiskSignal,
  RoleCriterionMatch,
  RoleSetup,
  ResolvedProvider,
  ScoreBreakdownItem,
  SkillAssessment,
  UploadSourceKind,
  ProviderFallbackMode,
} from "@/types/document-intelligence";
import { maxUploadSizeBytes } from "@/types/document-intelligence";

const DIRECT_PROMPT_CHAR_LIMIT = 12_000;
const CHUNK_SIZE = 8_000;
const MAX_CHUNKS = 4;
const EXCERPT_CHAR_LIMIT = 1_400;
const GEMINI_TIMEOUT_MS = parsePositiveInteger(process.env.GEMINI_TIMEOUT_MS, 20_000);
const HUGGING_FACE_TIMEOUT_MS = parsePositiveInteger(
  process.env.HF_TIMEOUT_MS,
  15_000
);
const HUGGING_FACE_DIRECT_PROMPT_CHAR_LIMIT = 5_800;
const HUGGING_FACE_CHUNK_SIZE = 3_800;
const HUGGING_FACE_MAX_CHUNKS = 2;
const HUGGING_FACE_MAX_TOKENS = 1_800;
const HUGGING_FACE_SIGNAL_LINE_LIMIT = 18;
const HUGGING_FACE_SOURCE_CHAR_LIMIT = 7_200;
const DEFAULT_PROVIDER_COOLDOWN_MS = parsePositiveInteger(
  process.env.AI_PROVIDER_COOLDOWN_MS,
  45_000
);
const NETWORK_PROVIDER_COOLDOWN_MS = parsePositiveInteger(
  process.env.AI_NETWORK_COOLDOWN_MS,
  60_000
);
const HIGH_DEMAND_COOLDOWN_MS = parsePositiveInteger(
  process.env.AI_HIGH_DEMAND_COOLDOWN_MS,
  45_000
);
const MIN_EXTRACTED_TEXT_LENGTH = 80;
const IMAGE_MIN_EXTRACTED_TEXT_LENGTH = 40;
const SUPPORTED_TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "html",
  "htm",
  "xml",
  "rtf",
  "log",
]);
const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
]);
const SUPPORTED_TEXT_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/tab-separated-values",
  "application/json",
  "text/json",
  "text/html",
  "application/xhtml+xml",
  "application/xml",
  "text/xml",
  "application/rtf",
  "text/rtf",
]);
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/bmp",
]);
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_GEMINI_FALLBACK_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash-lite-001",
  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
] as const;
const DEFAULT_HUGGING_FACE_MODELS = [
  "Qwen/Qwen2.5-72B-Instruct",
  "Qwen/Qwen2.5-32B-Instruct",
  "meta-llama/Llama-3.3-70B-Instruct",
] as const;
let pdfWorkerConfigured = false;
const providerCooldownState: Record<
  RemoteProvider,
  { cooldownUntil: number; lastError: string }
> = {
  gemini: { cooldownUntil: 0, lastError: "" },
  huggingface: { cooldownUntil: 0, lastError: "" },
};

type ChunkOptions = {
  chunkSize?: number;
  maxChunks?: number;
};

type ChunkDigest = {
  chunkSummary: string;
  highlights: string[];
  redFlags: string[];
  facts: ExtractedFact[];
  roleSignals: RoleCriterionMatch[];
  evidencePoints: EvidencePoint[];
};

type ExtractedUploadContent = {
  inputKind: UploadSourceKind;
  mimeType: string;
  pageCount: number;
  text: string;
};

type ProviderAttemptResult<T> = {
  provider: RemoteProvider;
  value: T;
  detail?: string;
  warnings: string[];
};

type ProviderRunState = {
  detail?: string;
};

export class DocumentAnalysisError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "DocumentAnalysisError";
    this.status = status;
  }
}

export async function analyzeUpload({
  file,
  documentType,
  provider,
  providerFallbackMode = "cross-provider",
  analysisGoal,
  roleSetup,
}: {
  file: File;
  documentType: DocumentType;
  provider: AnalysisProvider;
  providerFallbackMode?: ProviderFallbackMode;
  analysisGoal?: string;
  roleSetup?: RoleSetup;
}): Promise<AnalysisResponse> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const uploadKind = validateUpload(file);
  const { text, pageCount, inputKind, mimeType } = await extractUploadContent(
    file,
    buffer,
    uploadKind
  );
  const minimumTextLength =
    inputKind === "image" ? IMAGE_MIN_EXTRACTED_TEXT_LENGTH : MIN_EXTRACTED_TEXT_LENGTH;

  if (text.length < minimumTextLength) {
    throw new DocumentAnalysisError(
      inputKind === "image"
        ? "I couldn't read enough text from that image. Try a clearer scan or use a higher-resolution image."
        : "This file doesn't contain enough readable text to analyze yet. Try a clearer export or a longer text-based file.",
      422
    );
  }

  const localResult = buildLocalAnalysis({
    text,
    documentType,
    analysisGoal,
    pageCount,
    roleSetup,
  });

  let resolvedProvider: ResolvedProvider;
  let result: AnalysisResult;
  let providerDetail = "";
  let providerWarnings: string[] = [];

  try {
    const providerResult = await withProviderFallback(
      provider,
      async (activeProvider) => {
        const providerState: ProviderRunState = {};
        const providerText = buildProviderAnalysisText(text, activeProvider);
        const providerChunks = buildTextChunks(
          providerText,
          activeProvider === "huggingface"
            ? {
                chunkSize: HUGGING_FACE_CHUNK_SIZE,
                maxChunks: HUGGING_FACE_MAX_CHUNKS,
              }
            : undefined
        );
        const directPromptLimit =
          activeProvider === "huggingface"
            ? HUGGING_FACE_DIRECT_PROMPT_CHAR_LIMIT
            : DIRECT_PROMPT_CHAR_LIMIT;

        if (providerText.length <= directPromptLimit) {
          const raw = await generateWithProvider(
            activeProvider,
            providerState,
            buildDirectAnalysisPrompt({
              provider: activeProvider,
              documentType,
              analysisGoal,
              roleSetup,
              content: providerText,
            })
          );

          return {
            detail: providerState.detail,
            value: mergeRemoteWithLocalResult(
              normalizeFinalResult(parseLooseJson(raw), documentType, roleSetup),
              localResult
            ),
          };
        }

        const digests: ChunkDigest[] = [];

        for (let index = 0; index < providerChunks.length; index += 1) {
          const rawDigest = await generateWithProvider(
            activeProvider,
            providerState,
            buildChunkDigestPrompt({
              provider: activeProvider,
              chunk: providerChunks[index] ?? "",
              chunkIndex: index + 1,
              chunkTotal: providerChunks.length,
              documentType,
              analysisGoal,
              roleSetup,
            })
          );

          digests.push(normalizeChunkDigest(parseLooseJson(rawDigest)));
        }

        const raw = await generateWithProvider(
          activeProvider,
          providerState,
          buildAggregatePrompt({
            provider: activeProvider,
            digests,
            documentType,
            analysisGoal,
            roleSetup,
          })
        );

        return {
          detail: providerState.detail,
          value: mergeRemoteWithLocalResult(
            normalizeFinalResult(parseLooseJson(raw), documentType, roleSetup),
            localResult
          ),
        };
      },
      providerFallbackMode
    );

    resolvedProvider = providerResult.provider;
    providerDetail = providerResult.detail || "";
    result = providerResult.value;
    providerWarnings = providerResult.warnings;
  } catch (error) {
    providerWarnings = extractProviderWarnings(error);
    console.warn("[AI provider] Falling back to local analysis.", {
      providerPreference: provider,
      providerFallbackMode,
      fileName: file.name,
      warnings: providerWarnings,
      detail: formatProviderFailure(error),
    });

    if (
      process.env.NODE_ENV !== "production" &&
      process.env.DEBUG_AI_PROVIDERS === "1"
    ) {
      console.info(
        `Enhanced local review used for this run. ${providerWarnings.join(" ")}`
      );
    }

    resolvedProvider = "local";
    result = localResult;
  }

  return {
    result,
    meta: {
      fileName: file.name,
      fileSize: file.size,
      pageCount,
      extractedCharacters: text.length,
      chunkCount: buildTextChunks(text).length,
      provider: resolvedProvider,
      providerDetail: providerDetail || undefined,
      inputKind,
      mimeType,
      providerWarnings,
    },
    excerpt: text.slice(0, EXCERPT_CHAR_LIMIT),
  };
}

export const analyzePdfUpload = analyzeUpload;

export async function generateJobDescriptionDraft({
  title,
  team,
  intro,
  analysisGoal,
  roleSetup,
  provider = "auto",
}: {
  title?: string;
  team?: string;
  intro?: string;
  analysisGoal?: string;
  roleSetup?: RoleSetup;
  provider?: AnalysisProvider;
}): Promise<{
  jobDescription: string;
  provider: ResolvedProvider;
  providerDetail?: string;
  providerWarnings: string[];
}> {
  const localDraft = buildLocalJobDescriptionDraft({
    title,
    team,
    intro,
    analysisGoal,
    roleSetup,
  });

  try {
    const providerResult = await withProviderFallback(
      provider,
      async (activeProvider) => {
        const state: ProviderRunState = {};
        const raw = await generateWithProvider(
          activeProvider,
          state,
          buildJobDescriptionPrompt({
            title,
            team,
            intro,
            analysisGoal,
            roleSetup,
          })
        );
        const parsed = parseLooseJson(raw) as { jobDescription?: unknown };

        return {
          detail: state.detail,
          value: normalizeGeneratedJobDescription(
            parsed.jobDescription,
            localDraft
          ),
        };
      }
    );

    return {
      jobDescription: providerResult.value,
      provider: providerResult.provider,
      providerDetail: providerResult.detail || undefined,
      providerWarnings: providerResult.warnings,
    };
  } catch (error) {
    return {
      jobDescription: localDraft,
      provider: "local",
      providerWarnings: extractProviderWarnings(error),
    };
  }
}

export async function generateHiringFormDraft({
  title,
  team,
  intro,
  analysisGoal,
  roleSetup,
  prompt,
  provider = "auto",
}: {
  title?: string;
  team?: string;
  intro?: string;
  analysisGoal?: string;
  roleSetup?: RoleSetup;
  prompt?: string;
  provider?: AnalysisProvider;
}): Promise<{
  draft: {
    title: string;
    team: string;
    intro: string;
    analysisGoal: string;
    roleSetup: RoleSetup;
    formFields: HiringFormField[];
  };
  provider: ResolvedProvider;
  providerDetail?: string;
  providerWarnings: string[];
}> {
  const localDraft = buildLocalHiringFormDraft({
    title,
    team,
    intro,
    analysisGoal,
    roleSetup,
    prompt,
  });

  try {
    const providerResult = await withProviderFallback(
      provider,
      async (activeProvider) => {
        const state: ProviderRunState = {};
        const raw = await generateWithProvider(
          activeProvider,
          state,
          buildHiringFormDraftPrompt({
            title,
            team,
            intro,
            analysisGoal,
            roleSetup,
            prompt,
          })
        );

        return {
          detail: state.detail,
          value: normalizeGeneratedHiringFormDraft(parseLooseJson(raw), localDraft),
        };
      }
    );

    return {
      draft: providerResult.value,
      provider: providerResult.provider,
      providerDetail: providerResult.detail || undefined,
      providerWarnings: providerResult.warnings,
    };
  } catch (error) {
    return {
      draft: localDraft,
      provider: "local",
      providerWarnings: extractProviderWarnings(error),
    };
  }
}

export async function generateWorkspaceAssistantReply({
  context,
  messages,
  provider = "auto",
}: {
  context: WorkspaceAssistantContext;
  messages: WorkspaceAssistantMessage[];
  provider?: AnalysisProvider;
}): Promise<{
  reply: string;
  provider: ResolvedProvider;
  providerDetail?: string;
  providerWarnings: string[];
}> {
  const localReply = buildLocalWorkspaceAssistantReply({
    context,
    messages,
  });

  try {
    const providerResult = await withProviderFallback(
      provider,
      async (activeProvider) => {
        const state: ProviderRunState = {};
        const raw = await generateWithProvider(
          activeProvider,
          state,
          buildWorkspaceAssistantSystemPrompt({
            context,
            messages,
            provider,
          })
        );
        const parsed = parseLooseJson(raw) as { reply?: unknown };

        return {
          detail: state.detail,
          value: normalizeWorkspaceAssistantReply(parsed.reply, localReply),
        };
      }
    );

    return {
      reply: providerResult.value,
      provider: providerResult.provider,
      providerDetail: providerResult.detail || undefined,
      providerWarnings: providerResult.warnings,
    };
  } catch (error) {
    return {
      reply: localReply,
      provider: "local",
      providerWarnings: extractProviderWarnings(error),
    };
  }
}

export async function extractUploadTextFromFile(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const inputKind = validateUpload(file);
  return extractUploadContent(file, buffer, inputKind);
}

function validateUpload(file: File): UploadSourceKind {
  const inputKind = detectUploadKind(file);

  if (!inputKind) {
    throw new DocumentAnalysisError(
      "Upload a supported file: PDF, TXT, MD, CSV, JSON, HTML, XML, RTF, or an image such as PNG or JPG."
    );
  }

  if (file.size > maxUploadSizeBytes) {
    throw new DocumentAnalysisError(
      "That file is too large. Try a file under 15 MB for smoother parsing and faster AI analysis."
    );
  }

  if (inputKind === "image" && !process.env.GEMINI_API_KEY) {
    throw new DocumentAnalysisError(
      "Image uploads currently require a Gemini API key because OCR is handled through Gemini."
    );
  }

  return inputKind;
}

function detectUploadKind(file: File): UploadSourceKind | null {
  const extension = getFileExtension(file.name);
  const mimeType = normalizeMimeType(file.type);

  if (mimeType === "application/pdf" || extension === "pdf") {
    return "pdf";
  }

  if (
    SUPPORTED_IMAGE_MIME_TYPES.has(mimeType) ||
    (mimeType.startsWith("image/") && SUPPORTED_IMAGE_EXTENSIONS.has(extension))
  ) {
    return "image";
  }

  if (SUPPORTED_TEXT_MIME_TYPES.has(mimeType) || SUPPORTED_TEXT_EXTENSIONS.has(extension)) {
    return "text";
  }

  return null;
}

async function extractUploadContent(
  file: File,
  buffer: Buffer,
  inputKind: UploadSourceKind
): Promise<ExtractedUploadContent> {
  if (inputKind === "pdf") {
    const extracted = await extractPdfText(buffer);
    return {
      ...extracted,
      inputKind,
      mimeType: "application/pdf",
    };
  }

  if (inputKind === "text") {
    return {
      inputKind,
      mimeType: normalizeMimeType(file.type) || inferMimeTypeFromExtension(file.name),
      pageCount: 1,
      text: extractTextDocument(file, buffer),
    };
  }

  return {
    inputKind,
    mimeType: normalizeMimeType(file.type) || inferMimeTypeFromExtension(file.name),
    pageCount: 1,
    text: await extractImageText(file, buffer),
  };
}

async function extractPdfText(buffer: Buffer) {
  let lastError: unknown;

  for (const force of [false, true]) {
    try {
      await ensurePdfWorkerConfigured(force);
      return await readPdfText(buffer);
    } catch (error) {
      lastError = error;

      if (!shouldRetryPdfParsing(error) || force) {
        break;
      }

      pdfWorkerConfigured = false;
    }
  }

  console.error("PDF parsing failed:", lastError);
  throw new DocumentAnalysisError(
    "I couldn't read text from that PDF. Try another file or a cleaner text-based export.",
    422
  );
}

async function readPdfText(buffer: Buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  try {
    const textResult = await parser.getText({
      pageJoiner: "\n\n--- Page page_number of total_number ---\n\n",
    });

    return {
      pageCount: textResult.total,
      text: cleanExtractedText(textResult.text),
    };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

function shouldRetryPdfParsing(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("fake worker") ||
    message.includes("invalid url") ||
    message.includes("pdf.worker")
  );
}

async function ensurePdfWorkerConfigured(force = false) {
  if (pdfWorkerConfigured && !force) {
    return;
  }

  // Use pdf-parse's supported worker hook so pdf.js never falls back to
  // Next's chunk-relative fake-worker path, which breaks in dev on Windows.
  const workerPath = path.resolve(
    process.cwd(),
    "node_modules/pdf-parse/dist/worker/pdf.worker.mjs"
  );
  const workerUrl = pathToFileURL(workerPath).href;

  PDFParse.setWorker(workerUrl);

  try {
    if (force) {
      globalThis.pdfjsWorker = undefined;
    }

    const workerModule = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");

    if ("WorkerMessageHandler" in workerModule) {
      globalThis.pdfjsWorker = workerModule;
    }
  } catch (error) {
    console.warn("PDF worker preload failed, continuing with worker URL only:", error);
  }

  pdfWorkerConfigured = true;
}

function extractTextDocument(file: File, buffer: Buffer) {
  const extension = getFileExtension(file.name);
  const mimeType = normalizeMimeType(file.type) || inferMimeTypeFromExtension(file.name);
  const decoded = decodeTextBuffer(buffer);

  if (
    extension === "html" ||
    extension === "htm" ||
    mimeType === "text/html" ||
    mimeType === "application/xhtml+xml" ||
    extension === "xml" ||
    mimeType === "application/xml" ||
    mimeType === "text/xml"
  ) {
    return cleanExtractedText(stripMarkup(decoded));
  }

  if (
    extension === "rtf" ||
    mimeType === "application/rtf" ||
    mimeType === "text/rtf"
  ) {
    return cleanExtractedText(stripRtf(decoded));
  }

  return cleanExtractedText(decoded);
}

async function extractImageText(file: File, buffer: Buffer) {
  const mimeType = normalizeMimeType(file.type) || inferMimeTypeFromExtension(file.name);
  const extracted = await requestGeminiContent({
    parts: [
      {
        text:
          "Extract every readable word from this candidate document image. Return plain text only. Preserve line breaks where they help readability. Do not summarize or explain.",
      },
      {
        inline_data: {
          mime_type: mimeType,
          data: buffer.toString("base64"),
        },
      },
    ],
  });

  return cleanExtractedText(extracted.text);
}

function decodeTextBuffer(buffer: Buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.slice(3).toString("utf8");
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.slice(2).toString("utf16le");
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.slice(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }

  const utf8 = buffer.toString("utf8");

  if (countReplacementCharacters(utf8) > Math.max(3, Math.floor(utf8.length * 0.02))) {
    const utf16 = buffer.toString("utf16le");

    if (countReplacementCharacters(utf16) < countReplacementCharacters(utf8)) {
      return utf16;
    }
  }

  return utf8;
}

function countReplacementCharacters(value: string) {
  return (value.match(/\uFFFD/g) || []).length;
}

function stripMarkup(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|li|tr|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
}

function stripRtf(value: string) {
  return value
    .replace(/\\par[d]?/gi, "\n")
    .replace(/\\tab/gi, "\t")
    .replace(/\\'[0-9a-f]{2}/gi, " ")
    .replace(/\\[a-z]+\d* ?/gi, " ")
    .replace(/[{}]/g, " ");
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function cleanExtractedText(input: string) {
  return input
    .replace(/\r/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeMimeType(value: string) {
  return value.trim().toLowerCase();
}

function getFileExtension(fileName: string) {
  const lastDot = fileName.lastIndexOf(".");

  if (lastDot === -1) {
    return "";
  }

  return fileName.slice(lastDot + 1).trim().toLowerCase();
}

function inferMimeTypeFromExtension(fileName: string) {
  const extension = getFileExtension(fileName);

  if (extension === "pdf") {
    return "application/pdf";
  }

  if (SUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
    if (extension === "jpg") {
      return "image/jpeg";
    }

    return `image/${extension}`;
  }

  if (extension === "json") {
    return "application/json";
  }

  if (extension === "csv") {
    return "text/csv";
  }

  if (extension === "tsv") {
    return "text/tab-separated-values";
  }

  if (extension === "html" || extension === "htm") {
    return "text/html";
  }

  if (extension === "xml") {
    return "application/xml";
  }

  if (extension === "rtf") {
    return "application/rtf";
  }

  if (SUPPORTED_TEXT_EXTENSIONS.has(extension)) {
    return "text/plain";
  }

  return "application/octet-stream";
}

function buildProviderAnalysisText(text: string, provider: RemoteProvider) {
  if (provider !== "huggingface") {
    return text;
  }

  const normalized = cleanExtractedText(text);

  if (normalized.length <= HUGGING_FACE_SOURCE_CHAR_LIMIT) {
    return normalized;
  }

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const signalLines = uniqueStringList(
    lines.filter((line) => isSignalRichLine(line)).slice(0, HUGGING_FACE_SIGNAL_LINE_LIMIT)
  );
  const leadExcerpt = normalized.slice(0, 3_800).trim();
  const closingExcerpt = normalized.slice(-1_200).trim();
  const sections = [
    "Lead excerpt:",
    leadExcerpt,
    signalLines.length > 0 ? "\nSignal lines:\n" : "",
    signalLines.join("\n"),
    closingExcerpt ? "\nClosing excerpt:\n" : "",
    closingExcerpt,
  ]
    .filter(Boolean)
    .join("\n");

  return sections.slice(0, HUGGING_FACE_SOURCE_CHAR_LIMIT).trim();
}

function isSignalRichLine(line: string) {
  const normalized = line.toLowerCase();

  return (
    /\d/.test(line) ||
    normalized.includes("@") ||
    normalized.includes("linkedin") ||
    normalized.includes("github") ||
    [
      "experience",
      "skills",
      "summary",
      "profile",
      "employment",
      "projects",
      "project",
      "achievements",
      "achievement",
      "education",
      "certification",
      "impact",
      "support",
      "engineer",
      "developer",
      "analyst",
      "lead",
      "managed",
      "built",
      "designed",
      "implemented",
      "reduced",
      "improved",
      "resolved",
    ].some((keyword) => normalized.includes(keyword))
  );
}

function buildTextChunks(text: string, options: ChunkOptions = {}) {
  const chunkSize = options.chunkSize ?? CHUNK_SIZE;
  const maxChunks = options.maxChunks ?? MAX_CHUNKS;
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;

    if (next.length <= chunkSize) {
      current = next;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    if (paragraph.length <= chunkSize) {
      current = paragraph;
      continue;
    }

    let start = 0;
    while (start < paragraph.length) {
      chunks.push(paragraph.slice(start, start + chunkSize));
      start += chunkSize;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.slice(0, maxChunks);
}

async function withProviderFallback<T>(
  preferredProvider: AnalysisProvider,
  task: (provider: RemoteProvider) => Promise<{ value: T; detail?: string }>,
  fallbackMode: ProviderFallbackMode = "cross-provider"
): Promise<ProviderAttemptResult<T>> {
  const providers = resolveProviderCandidates(preferredProvider, fallbackMode);
  const errors: string[] = [];

  for (const provider of providers) {
    if (!isProviderConfigured(provider)) {
      console.warn(`[AI provider] Skipping ${provider}: not configured.`);
      errors.push(`${provider} is not configured.`);
      continue;
    }

    const cooldownMessage = getProviderCooldownMessage(provider);

    if (cooldownMessage) {
      console.warn(`[AI provider] Skipping ${provider}: ${cooldownMessage}`);
      errors.push(`${provider}: ${cooldownMessage}`);
      continue;
    }

    try {
      const outcome = await task(provider);
      clearProviderCooldown(provider);
      return {
        provider,
        value: outcome.value,
        detail: outcome.detail,
        warnings: errors,
      };
    } catch (error) {
      const message = formatProviderFailure(error);
      recordProviderFailure(provider, message);
      console.warn(`[AI provider] ${provider} failed: ${message}`);
      errors.push(`${provider}: ${message}`);
    }
  }

  throw new DocumentAnalysisError(
    errors.length > 0
      ? errors.join(" ")
      : "No AI provider is configured. Add at least a Gemini or Hugging Face API key.",
    500
  );
}

function resolveProviderCandidates(
  preferredProvider: AnalysisProvider,
  fallbackMode: ProviderFallbackMode
): RemoteProvider[] {
  if (fallbackMode === "local-only") {
    if (preferredProvider === "auto") {
      return ["gemini"];
    }

    return [preferredProvider];
  }

  if (preferredProvider === "gemini") {
    return ["gemini", "huggingface"];
  }

  if (preferredProvider === "huggingface") {
    return ["huggingface", "gemini"];
  }

  return ["gemini", "huggingface"];
}

function isProviderConfigured(provider: RemoteProvider) {
  if (provider === "gemini") {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  return Boolean(process.env.HF_TOKEN);
}

function getProviderCooldownMessage(provider: RemoteProvider) {
  const state = providerCooldownState[provider];

  if (!state || state.cooldownUntil <= Date.now()) {
    return "";
  }

  const secondsRemaining = Math.max(
    1,
    Math.ceil((state.cooldownUntil - Date.now()) / 1000)
  );
  const reason = state.lastError || "recent provider failure";

  return `temporarily skipped for ${secondsRemaining}s after a recent failure. ${reason}`;
}

function clearProviderCooldown(provider: RemoteProvider) {
  providerCooldownState[provider] = {
    cooldownUntil: 0,
    lastError: "",
  };
}

function recordProviderFailure(provider: RemoteProvider, message: string) {
  providerCooldownState[provider] = {
    cooldownUntil: Date.now() + getProviderCooldownMs(message),
    lastError: message,
  };
}

function getProviderCooldownMs(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("couldn't reach")
  ) {
    return NETWORK_PROVIDER_COOLDOWN_MS;
  }

  if (
    normalized.includes("high demand") ||
    normalized.includes("quota") ||
    normalized.includes("rate limit") ||
    normalized.includes("too many requests")
  ) {
    return HIGH_DEMAND_COOLDOWN_MS;
  }

  return DEFAULT_PROVIDER_COOLDOWN_MS;
}

async function generateWithProvider(
  provider: RemoteProvider,
  state: ProviderRunState,
  prompt: string
) {
  if (provider === "gemini") {
    return generateWithGemini(prompt, state);
  }

  return generateWithHuggingFace(prompt, state);
}

async function generateWithGemini(prompt: string, state: ProviderRunState) {
  const response = await requestGeminiContent({
    parts: [{ text: prompt }],
    responseMimeType: "application/json",
  });

  state.detail = formatGeminiProviderDetail(response.model);

  return response.text;
}

async function requestGeminiContent({
  parts,
  responseMimeType,
}: {
  parts: Array<Record<string, unknown>>;
  responseMimeType?: string;
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  const models = getGeminiModelCandidates();

  if (!apiKey) {
    throw new DocumentAnalysisError(
      "GEMINI_API_KEY is missing. Add it to your environment to use Gemini.",
      500
    );
  }

  const errors: string[] = [];

  for (const model of models) {
    try {
      const text = await requestGeminiContentForModel({
        apiKey,
        model,
        parts,
        responseMimeType,
      });

      return { model, text };
    } catch (error) {
      const message = formatProviderFailure(error);

      errors.push(`${model}: ${message}`);

      if (!shouldRetryGeminiModel(error)) {
        throw error;
      }
    }
  }

  throw new DocumentAnalysisError(
    errors.length > 0
      ? `Gemini could not complete a response. ${errors.join(" ")}`
      : "Gemini did not return usable text for this document.",
    502
  );
}

async function requestGeminiContentForModel({
  apiKey,
  model,
  parts,
  responseMimeType,
}: {
  apiKey: string;
  model: string;
  parts: Array<Record<string, unknown>>;
  responseMimeType?: string;
}) {
  let response: Response;

  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts,
            },
          ],
          generationConfig: {
            temperature: 0.2,
            ...(responseMimeType ? { responseMimeType } : {}),
          },
        }),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      }
    );
  } catch (error) {
    throw providerNetworkError("Gemini", error);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      `Gemini returned ${response.status} ${response.statusText}`;
    throw new DocumentAnalysisError(message, response.status);
  }

  const text = extractGeminiText(payload);

  if (!text) {
    throw new DocumentAnalysisError(
      "Gemini did not return usable text for this document.",
      502
    );
  }

  return text;
}

function extractGeminiText(payload: unknown) {
  const response = payload as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  } | null;

  return (
    response?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim() || ""
  );
}

function shouldRetryGeminiModel(error: unknown) {
  if (!(error instanceof DocumentAnalysisError)) {
    return true;
  }

  if (error.status === 404 || error.status === 408 || error.status === 429) {
    return true;
  }

  if (error.status >= 500) {
    return true;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("rate limit") ||
    message.includes("quota") ||
    message.includes("high demand") ||
    message.includes("temporarily unavailable") ||
    message.includes("not found") ||
    message.includes("supported for generatecontent") ||
    message.includes("model is not found") ||
    message.includes("could not be reached") ||
    message.includes("timed out")
  );
}

function formatGeminiProviderDetail(model: string) {
  return `Gemini ${model
    .replace(/^gemini-/i, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())}`;
}

async function generateWithHuggingFace(prompt: string, state: ProviderRunState) {
  const token = process.env.HF_TOKEN;

  if (!token) {
    throw new DocumentAnalysisError(
      "HF_TOKEN is missing. Add it to your environment to use Hugging Face.",
      500
    );
  }

  const models = getHuggingFaceModelCandidates();
  const errors: string[] = [];

  for (const model of models) {
    try {
      const text = await requestHuggingFaceChatCompletion({
        token,
        model,
        prompt,
        responseStyle: "json",
      });

      if (containsParseableJson(text)) {
        state.detail = model;
        return text;
      }

      const recoveredText = recoverJsonFromPlainTextResponse(text);

      if (recoveredText) {
        state.detail = model;
        return recoveredText;
      }

      const fallbackText = await requestHuggingFaceChatCompletion({
        token,
        model,
        prompt,
        responseStyle: "plain",
      });

      if (containsParseableJson(fallbackText)) {
        state.detail = model;
        return fallbackText;
      }

      const recoveredFallbackText = recoverJsonFromPlainTextResponse(fallbackText);

      if (recoveredFallbackText) {
        state.detail = model;
        return recoveredFallbackText;
      }

      console.warn(
        `[AI provider] Hugging Face returned non-JSON text for ${model} in both modes. Structured preview: ${formatProviderTextPreview(
          text
        )}. Fallback preview: ${formatProviderTextPreview(fallbackText)}.`
      );
      errors.push(`${model}: returned incomplete plain text in both structured and fallback modes.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Hugging Face error";

      if (!isUnsupportedJsonModeError(message)) {
        errors.push(`${model}: ${message}`);
        continue;
      }

      try {
        const fallbackText = await requestHuggingFaceChatCompletion({
          token,
          model,
          prompt,
          responseStyle: "plain",
        });

        if (containsParseableJson(fallbackText)) {
          state.detail = model;
          return fallbackText;
        }

        const recoveredFallbackText = recoverJsonFromPlainTextResponse(fallbackText);

        if (recoveredFallbackText) {
          state.detail = model;
          return recoveredFallbackText;
        }

        console.warn(
          `[AI provider] Hugging Face returned incomplete fallback text for ${model}. Preview: ${formatProviderTextPreview(
            fallbackText
          )}.`
        );
        errors.push(`${model}: fallback response was still incomplete.`);
      } catch (fallbackError) {
        const fallbackMessage =
          fallbackError instanceof Error
            ? fallbackError.message
            : "Unknown Hugging Face fallback error";
        errors.push(`${model}: ${fallbackMessage}`);
      }
    }
  }

  throw new DocumentAnalysisError(
    errors.length > 0
      ? `Hugging Face could not complete a structured response. ${errors.join(" ")}`
      : "Hugging Face did not return usable text for this document.",
    502
  );
}

async function requestHuggingFaceChatCompletion({
  token,
  model,
  prompt,
  responseStyle,
}: {
  token: string;
  model: string;
  prompt: string;
  responseStyle: "json" | "plain";
}) {
  let response: Response;

  try {
    response = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: HUGGING_FACE_MAX_TOKENS,
        top_p: 0.9,
        ...(responseStyle === "json"
          ? { response_format: { type: "json_object" } }
          : {}),
        messages: [
          {
            role: "system",
            content:
              responseStyle === "json"
                ? "You are a precise HR screening and document analysis assistant. Reply with JSON only and do not use markdown fences."
                : "You are a precise HR screening and document analysis assistant. Reply in compact plain text only. Do not return JSON or markdown fences.",
          },
          {
            role: "user",
            content:
              responseStyle === "json"
                ? prompt
                : buildHuggingFacePlainTextPrompt(prompt),
          },
        ],
      }),
      signal: AbortSignal.timeout(HUGGING_FACE_TIMEOUT_MS),
    });
  } catch (error) {
    throw providerNetworkError("Hugging Face", error);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      `Hugging Face returned ${response.status} ${response.statusText}`;
    throw new DocumentAnalysisError(message, 502);
  }

  const content = payload?.choices?.[0]?.message?.content;
  const text = extractHuggingFaceMessageText(content);

  if (!text) {
    throw new DocumentAnalysisError(
      `Hugging Face model ${model} did not return usable text.`,
      502
    );
  }

  return text;
}

function buildHuggingFacePlainTextPrompt(prompt: string) {
  return `
${prompt}

Ignore any JSON-format instruction above if it conflicts with this fallback request.

Reply in plain text with these exact section labels:
Summary:
Highlights:
- bullet
Concerns:
- bullet
Actions:
- bullet
Questions:
- bullet
Decision:
Score:

Keep every point grounded in the document text and keep it concise.
`.trim();
}

function extractHuggingFaceMessageText(content: unknown) {
  if (typeof content === "string") {
    return stripReasoningBlocks(content).trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return stripReasoningBlocks(
    content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          return typeof record.text === "string"
            ? record.text
            : typeof record.content === "string"
              ? record.content
              : "";
        }

        return "";
      })
      .join("")
  ).trim();
}

function buildDirectAnalysisPrompt({
  provider,
  documentType,
  analysisGoal,
  roleSetup,
  content,
}: {
  provider: RemoteProvider;
  documentType: DocumentType;
  analysisGoal?: string;
  roleSetup?: RoleSetup;
  content: string;
}) {
  return `
${buildReviewerOpening(documentType)}

${buildSharedInstructions(provider, documentType, analysisGoal, roleSetup)}

${documentType === "cv" ? "Candidate CV text:" : "Document text:"}
${content}
`.trim();
}

function buildChunkDigestPrompt({
  provider,
  chunk,
  chunkIndex,
  chunkTotal,
  documentType,
  analysisGoal,
  roleSetup,
}: {
  provider: RemoteProvider;
  chunk: string;
  chunkIndex: number;
  chunkTotal: number;
  documentType: DocumentType;
  analysisGoal?: string;
  roleSetup?: RoleSetup;
}) {
  const isCompactMode = provider === "huggingface";

  return `
${buildChunkOpening(documentType, chunkIndex, chunkTotal)}

Document type hint: ${describeDocumentType(documentType)}
User goal: ${analysisGoal?.trim() || "No extra goal supplied."}
Structured role brief:
${formatRoleSetup(roleSetup)}

Return strict JSON with this shape:
{
  "chunkSummary": "2-3 sentence chunk summary",
  "highlights": ["short bullet", "short bullet"],
  "redFlags": ["short concern"],
  "roleSignals": [
    {
      "criterion": "short requirement or screening lens",
      "status": "matched | partial | missing",
      "evidence": "short grounded reason"
    }
  ],
  "evidencePoints": [
    {
      "title": "short evidence title",
      "excerpt": "short exact quote or snippet from the text",
      "rationale": "why this matters",
      "tone": "strength | concern | neutral"
    }
  ],
  "facts": [
    { "label": "Field or metric", "value": "Exact extracted value" }
  ]
}

Rules:
- Keep highlights to ${isCompactMode ? "2-3" : "2-4"} items.
- Keep redFlags to 0-${isCompactMode ? "2" : "3"} items.
- Keep roleSignals to 2-${isCompactMode ? "4" : "5"} items.
- Keep evidencePoints to 2-${isCompactMode ? "4" : "5"} items.
- Facts must be directly grounded in the text.
- If this is a CV, focus on role fit, credibility, impact evidence, skills depth, and hiring risk.
- Do not include markdown fences.

Chunk text:
${chunk}
`.trim();
}

function buildAggregatePrompt({
  provider,
  digests,
  documentType,
  analysisGoal,
  roleSetup,
}: {
  provider: RemoteProvider;
  digests: ChunkDigest[];
  documentType: DocumentType;
  analysisGoal?: string;
  roleSetup?: RoleSetup;
}) {
  return `
${buildAggregateOpening(documentType)}

${buildSharedInstructions(provider, documentType, analysisGoal, roleSetup)}

Chunk digests:
${JSON.stringify(digests, null, 2)}
`.trim();
}

function buildJobDescriptionPrompt({
  title,
  team,
  intro,
  analysisGoal,
  roleSetup,
}: {
  title?: string;
  team?: string;
  intro?: string;
  analysisGoal?: string;
  roleSetup?: RoleSetup;
}) {
  return `
You are writing a professional, candidate-facing job description for a hiring form.

Form title: ${title?.trim() || "Not provided"}
Team: ${team?.trim() || "Not provided"}
Public intro: ${intro?.trim() || "Not provided"}
Hiring brief: ${analysisGoal?.trim() || "Not provided"}
Structured role brief:
${formatRoleSetup(roleSetup)}

Return strict JSON with this shape:
{
  "jobDescription": "Plain-text job description"
}

Rules:
- Write a polished job description in plain text, not markdown tables.
- Include short section headings in the text.
- Cover: Role overview, Responsibilities, Must-have requirements, Nice-to-have skills, Interview focus, and Location/work arrangement if known.
- Use simple bullet-style lines beginning with "- " where helpful.
- Keep it grounded in the inputs above.
- Do not invent salary, benefits, compliance claims, or tools that were not provided.
- Keep the tone professional and concise.
- Target roughly 300 to 550 words.
- Output valid JSON only with double quotes.
`.trim();
}

function buildHiringFormDraftPrompt({
  title,
  team,
  intro,
  analysisGoal,
  roleSetup,
  prompt,
}: {
  title?: string;
  team?: string;
  intro?: string;
  analysisGoal?: string;
  roleSetup?: RoleSetup;
  prompt?: string;
}) {
  return `
You are designing a professional candidate application form for a hiring workflow.

Current form title: ${title?.trim() || "Not provided"}
Team: ${team?.trim() || "Not provided"}
Current public intro: ${intro?.trim() || "Not provided"}
Current screening brief: ${analysisGoal?.trim() || "Not provided"}
Structured role brief:
${formatRoleSetup(roleSetup)}
Extra instruction:
${prompt?.trim() || "No extra instruction provided."}

Return strict JSON with this shape:
{
  "title": "Candidate-facing form title",
  "team": "Team name or blank",
  "intro": "1-3 sentence public description",
  "analysisGoal": "Short internal screening brief",
  "roleSetup": {
    "title": "Role title",
    "seniority": "Seniority",
    "location": "Location or work arrangement",
    "summary": "Short role summary",
    "mustHaveSkills": ["skill"],
    "niceToHaveSkills": ["skill"],
    "interviewFocus": ["focus area"]
  },
  "formFields": [
    {
      "id": "field-1",
      "label": "Question label",
      "type": "short_text | long_text | phone | url | number | date | multiple_choice | checkboxes | dropdown",
      "required": true,
      "placeholder": "Optional placeholder",
      "helper": "Optional helper text",
      "options": ["Option A", "Option B"],
      "systemKey": "phone | location | linkedIn | portfolio | yearsExperience | noticePeriod | salaryExpectation | coverNote"
    }
  ]
}

Rules:
- Create an editable hiring form draft, not a template explanation.
- Generate 4 to 8 fields beyond the built-in full name, email, and CV upload fields.
- Do not include full name, email, or resume upload fields because the system adds those automatically.
- Reuse standard systemKey values when a field maps cleanly to common candidate profile data.
- Use custom questions for role-specific evidence, project examples, motivation, availability, or scenario responses.
- Keep the form practical, concise, and professional.
- Use only the allowed field types listed above.
- For multiple_choice, checkboxes, or dropdown fields, include 2 to 6 useful options.
- Keep placeholders and helper text short.
- Keep the output grounded in the role context instead of inventing benefits, salary, or unsupported requirements.
- Output valid JSON only with double quotes and no markdown fences.
`.trim();
}

function buildSharedInstructions(
  provider: RemoteProvider,
  documentType: DocumentType,
  analysisGoal?: string,
  roleSetup?: RoleSetup
) {
  if (provider === "huggingface") {
    return `
Document type hint: ${describeDocumentType(documentType)}
User goal: ${analysisGoal?.trim() || "No extra goal supplied."}
Structured role brief:
${formatRoleSetup(roleSetup)}

Task:
- Infer the most likely document type if the hint is "auto".
- Write a concise HR-facing screening summary.
- Surface the strongest strengths, concerns, and next steps.
- Score the candidate from 0 to 100.
- Keep every field grounded in the CV text.
${buildTaskFocus(documentType)}

Return strict JSON with this top-level shape:
{
  "documentType": "cv | contract | invoice | report | other",
  "summary": "2-3 sentence summary",
  "recommendation": {
    "decision": "Shortlist | Interview | Hold | Reject",
    "summary": "1 sentence hiring recommendation",
    "confidence": "High | Medium | Low"
  },
  "candidateProfile": {
    "name": "Candidate name or Unknown candidate",
    "headline": "Short headline",
    "summary": "1 sentence profile"
  },
  "roleMatch": {
    "summary": "Short role-fit view",
    "criteria": [
      {
        "criterion": "Key requirement",
        "status": "matched | partial | missing",
        "evidence": "short grounded reason"
      }
    ]
  },
  "keyHighlights": ["short bullet"],
  "redFlags": ["short concern"],
  "recommendedActions": ["clear next step"],
  "interviewQuestions": ["specific follow-up question"],
  "score": {
    "value": 0,
    "label": "${scoreLabelOptions(documentType)}",
    "rationale": "why this score fits"
  },
  "extractedFacts": [
    { "label": "Field name", "value": "Value from the text" }
  ],
  "tone": "Overall tone or confidence signal"
}

Rules:
- Use only valid JSON with double quotes.
- Do not include markdown fences or any prose outside the JSON.
- Keep strings compact and concrete.
- Keep keyHighlights to 3-4 items.
- Keep redFlags to 0-3 items.
- Keep recommendedActions to 2-3 items.
- Keep interviewQuestions to 2-4 items.
- Keep extractedFacts to 2-4 items.
- If you are unsure, omit weak details instead of inventing them.
- If this is a CV, write for an HR or hiring-team audience deciding whether to move the candidate forward.
`.trim();
  }

  return `
Document type hint: ${describeDocumentType(documentType)}
User goal: ${analysisGoal?.trim() || "No extra goal supplied."}
Structured role brief:
${formatRoleSetup(roleSetup)}

Task:
- Infer the most likely document type if the hint is "auto".
- Produce a concise summary.
- List the strongest key highlights.
- List the most important red flags or risk signals.
- Recommend clear next actions.
- Give a score from 0 to 100 using the rubric below.
- Extract concrete facts, dates, totals, names, clauses, or metrics when present.
${buildTaskFocus(documentType)}

Scoring rubric:
${scoreRubric(documentType)}

Preferred score labels:
${scoreLabelGuidance(documentType)}

Preferred breakdown categories:
${breakdownCategoryGuidance(documentType)}

Return strict JSON with this exact top-level shape:
{
  "documentType": "cv | contract | invoice | report | other",
  "summary": "2-4 sentence summary",
  "recommendation": {
    "decision": "Shortlist | Interview | Hold | Reject",
    "summary": "1-2 sentence hiring recommendation",
    "confidence": "High | Medium | Low"
  },
  "candidateProfile": {
    "name": "Candidate name or Unknown candidate",
    "headline": "Short professional headline",
    "summary": "1-2 sentence candidate profile summary",
    "fields": [
      { "label": "Experience", "value": "4+ years" },
      { "label": "Email", "value": "name@example.com" }
    ]
  },
  "roleMatch": {
    "summary": "Short view of how the CV aligns with the hiring brief",
    "criteria": [
      {
        "criterion": "Relevant experience",
        "status": "matched | partial | missing",
        "evidence": "short grounded reason"
      }
    ]
  },
  "skillAssessments": [
    {
      "skill": "Windows support",
      "category": "must-have | nice-to-have | general",
      "status": "strong | partial | unclear | missing",
      "score": 0,
      "evidence": "short grounded reason"
    }
  ],
  "riskSignals": [
    {
      "category": "Evidence quality",
      "level": "low | medium | high",
      "summary": "short grounded risk summary"
    }
  ],
  "keyHighlights": ["short bullet", "short bullet"],
  "redFlags": ["short concern"],
  "recommendedActions": ["clear next step"],
  "evidencePoints": [
    {
      "title": "short evidence title",
      "excerpt": "short exact quote or snippet from the text",
      "rationale": "why this matters",
      "tone": "strength | concern | neutral"
    }
  ],
  "interviewQuestions": ["specific follow-up question"],
  "score": {
    "value": 0,
    "label": "${scoreLabelOptions(documentType)}",
    "rationale": "why this score fits",
    "breakdown": [
      ${buildBreakdownSchema(documentType)}
    ]
  },
  "extractedFacts": [
    { "label": "Field name", "value": "Value from the text" }
  ],
  "tone": "Overall tone or confidence signal"
}

Rules:
- Use only valid JSON.
- Do not wrap the JSON in markdown.
- Keep keyHighlights to 3-6 items.
- Keep redFlags to 0-5 items.
- Keep recommendedActions to 2-4 items.
- Keep skillAssessments to 3-8 items when this is a CV.
- Keep riskSignals to 2-5 items when this is a CV.
- Keep evidencePoints to 3-6 items.
- Keep interviewQuestions to 3-6 items.
- Keep extractedFacts to 3-8 items.
- Do not invent information that is not supported by the PDF text.
- If the document is a CV, write the review for an HR or hiring-team audience deciding whether the candidate should move forward.
- When possible, include short direct snippets from the CV in evidencePoints.excerpt.
`.trim();
}

function describeDocumentType(documentType: DocumentType) {
  if (documentType === "auto") {
    return "Auto-detect from the document text.";
  }

  return documentType;
}

function scoreRubric(documentType: DocumentType) {
  switch (documentType) {
    case "cv":
      return [
        "- CV: score for role alignment, relevant experience, measurable impact, communication clarity, and hiring risk.",
        "- Reward direct overlap with the hiring brief, credible seniority signals, quantified outcomes, and clear ownership of work.",
        "- Penalize vague achievements, unexplained gaps, inconsistent timelines, keyword stuffing, weak contact details, and missing skills context.",
      ].join("\n");
    case "contract":
      return [
        "- Contract: score for clarity, balance, enforceability signals, obligations, and legal risk.",
        "- Penalize one-sided terms, undefined obligations, missing dates, missing payment language, and liability exposure.",
      ].join("\n");
    case "invoice":
      return [
        "- Invoice: score for completeness, consistency, payment clarity, tax details, and anomaly risk.",
        "- Penalize missing totals, mismatched line items, unclear vendors, missing due dates, and duplicate-looking charges.",
      ].join("\n");
    case "report":
      return [
        "- Report: score for clarity, evidence quality, structure, insight density, and actionability.",
        "- Penalize unsupported claims, unclear ownership, missing conclusions, and weak decision guidance.",
      ].join("\n");
    default:
      return [
        "- General document: score for clarity, completeness, trustworthiness, and operational usefulness.",
        "- Penalize ambiguity, missing essentials, unsupported claims, and unresolved risk signals.",
      ].join("\n");
  }
}

function buildReviewerOpening(documentType: DocumentType) {
  if (documentType === "cv") {
    return "You are an HR screening assistant reviewing a candidate CV for pre-employment consideration.";
  }

  return "You are reviewing a PDF that has already been converted to plain text.";
}

function buildChunkOpening(
  documentType: DocumentType,
  chunkIndex: number,
  chunkTotal: number
) {
  if (documentType === "cv") {
    return `You are reviewing chunk ${chunkIndex} of ${chunkTotal} from a candidate CV for an HR screening workflow. The text may be incomplete, so avoid final hiring decisions and focus on signal extraction.`;
  }

  return `You are analyzing chunk ${chunkIndex} of ${chunkTotal} from a PDF. The text may be incomplete, so avoid final conclusions and focus on signal extraction.`;
}

function buildAggregateOpening(documentType: DocumentType) {
  if (documentType === "cv") {
    return "You are combining chunk-level findings from a candidate CV into one final hiring review.";
  }

  return "You are combining chunk-level findings from a PDF analysis into one final review.";
}

function formatRoleSetup(roleSetup?: RoleSetup) {
  if (!roleSetup) {
    return "No structured role brief supplied.";
  }

  const lines = [
    roleSetup.title ? `- Title: ${roleSetup.title}` : "",
    roleSetup.seniority ? `- Seniority: ${roleSetup.seniority}` : "",
    roleSetup.location ? `- Location: ${roleSetup.location}` : "",
    roleSetup.summary ? `- Role summary: ${roleSetup.summary}` : "",
    roleSetup.mustHaveSkills.length > 0
      ? `- Must-have skills: ${roleSetup.mustHaveSkills.join(", ")}`
      : "",
    roleSetup.niceToHaveSkills.length > 0
      ? `- Nice-to-have skills: ${roleSetup.niceToHaveSkills.join(", ")}`
      : "",
    roleSetup.interviewFocus.length > 0
      ? `- Interview priorities: ${roleSetup.interviewFocus.join(", ")}`
      : "",
  ].filter(Boolean);

  return lines.length > 0 ? lines.join("\n") : "No structured role brief supplied.";
}

function buildTaskFocus(documentType: DocumentType) {
  if (documentType === "cv") {
    return "- Assess whether the candidate appears suitable for shortlist consideration based on skills, experience, impact, clarity, and risk.";
  }

  return "- Keep the review practical and decision-oriented for a human reviewer.";
}

function scoreLabelGuidance(documentType: DocumentType) {
  if (documentType === "cv") {
    return "- Prefer labels such as Strong shortlist, Worth interviewing, Mixed evidence, Hold for review, or High concern.";
  }

  return "- Prefer clear decision labels such as Excellent, Strong, Mixed, Needs review, or Risky.";
}

function scoreLabelOptions(documentType: DocumentType) {
  if (documentType === "cv") {
    return "Strong shortlist | Worth interviewing | Mixed evidence | Hold for review | High concern";
  }

  return "Excellent | Strong | Mixed | Risky | Needs review";
}

function breakdownCategoryGuidance(documentType: DocumentType) {
  if (documentType === "cv") {
    return "- Prefer categories such as Role fit, Experience, Evidence of impact, Communication, and Hiring risk.";
  }

  return "- Prefer categories that explain clarity, completeness, quality, and risk.";
}

function buildBreakdownSchema(documentType: DocumentType) {
  if (documentType === "cv") {
    return [
      '{ "category": "Role fit", "score": 0, "note": "brief note" },',
      '{ "category": "Experience", "score": 0, "note": "brief note" },',
      '{ "category": "Evidence of impact", "score": 0, "note": "brief note" },',
      '{ "category": "Hiring risk", "score": 0, "note": "brief note" }',
    ].join("\n      ");
  }

  return [
    '{ "category": "Clarity", "score": 0, "note": "brief note" },',
    '{ "category": "Completeness", "score": 0, "note": "brief note" },',
    '{ "category": "Risk", "score": 0, "note": "brief note" }',
  ].join("\n      ");
}

function normalizeGeneratedJobDescription(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.replace(/\r/g, "").trim();
  return normalized.length >= 180 ? normalized : fallback;
}

function normalizeWorkspaceAssistantReply(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.replace(/\r/g, "").trim();
  return normalized.length >= 24 ? normalized : fallback;
}

function normalizeGeneratedHiringFormDraft(
  value: unknown,
  fallback: {
    title: string;
    team: string;
    intro: string;
    analysisGoal: string;
    roleSetup: RoleSetup;
    formFields: HiringFormField[];
  }
) {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const parsed = value as Record<string, unknown>;

  return {
    title: firstNonEmpty(asNonEmptyString(parsed.title), fallback.title),
    team: asNonEmptyString(parsed.team) || fallback.team,
    intro: firstNonEmpty(asNonEmptyString(parsed.intro), fallback.intro),
    analysisGoal:
      firstNonEmpty(asNonEmptyString(parsed.analysisGoal), fallback.analysisGoal),
    roleSetup: normalizeGeneratedRoleSetup(parsed.roleSetup, fallback.roleSetup),
    formFields: normalizeGeneratedFormFields(parsed.formFields, fallback.formFields),
  };
}

function buildLocalJobDescriptionDraft({
  title,
  team,
  intro,
  analysisGoal,
  roleSetup,
}: {
  title?: string;
  team?: string;
  intro?: string;
  analysisGoal?: string;
  roleSetup?: RoleSetup;
}) {
  const resolvedTitle =
    roleSetup?.title?.trim() || title?.trim() || "Open role";
  const resolvedLocation = roleSetup?.location?.trim() || "";
  const overview =
    firstNonEmpty(intro, roleSetup?.summary, analysisGoal) ||
    `We are hiring a ${resolvedTitle} to take ownership of meaningful day-to-day work, collaborate well with teammates, and deliver consistently strong execution.`;
  const mustHave =
    roleSetup?.mustHaveSkills?.filter(Boolean) ?? [];
  const niceToHave =
    roleSetup?.niceToHaveSkills?.filter(Boolean) ?? [];
  const interviewFocus =
    roleSetup?.interviewFocus?.filter(Boolean) ?? [];

  const responsibilityBullets = uniqueStringList([
    `Own the core responsibilities of the ${resolvedTitle} role and deliver high-quality work consistently.`,
    firstSentenceAsBullet(roleSetup?.summary),
    firstSentenceAsBullet(analysisGoal),
    `Collaborate effectively with teammates and communicate progress, blockers, and outcomes clearly.`,
    resolvedLocation
      ? `Work successfully within the expected ${resolvedLocation} setup and keep delivery aligned with team expectations.`
      : "",
  ]).slice(0, 4);

  const requirementBullets = mustHave.length > 0
    ? mustHave.map((item) => `Demonstrated strength in ${item}.`)
    : [
        `Relevant experience that supports success as a ${resolvedTitle}.`,
        "Clear communication, ownership, and reliable execution.",
      ];

  const niceToHaveBullets = niceToHave.length > 0
    ? niceToHave.map((item) => `Experience with ${item}.`)
    : ["Additional related tools, domain context, or adjacent experience."];

  const interviewBullets = interviewFocus.length > 0
    ? interviewFocus.map((item) => `We will explore ${item.toLowerCase()} during interviews.`)
    : [
        "We will assess problem-solving, communication, and practical role fit during interviews.",
      ];

  return [
    resolvedTitle,
    team?.trim() ? `Team: ${team.trim()}` : "",
    resolvedLocation ? `Location: ${resolvedLocation}` : "",
    "",
    "Role overview",
    overview,
    "",
    "Responsibilities",
    ...responsibilityBullets.map((item) => `- ${item}`),
    "",
    "Must-have requirements",
    ...requirementBullets.map((item) => `- ${item}`),
    "",
    "Nice-to-have skills",
    ...niceToHaveBullets.map((item) => `- ${item}`),
    "",
    "Interview focus",
    ...interviewBullets.map((item) => `- ${item}`),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildLocalHiringFormDraft({
  title,
  team,
  intro,
  analysisGoal,
  roleSetup,
  prompt,
}: {
  title?: string;
  team?: string;
  intro?: string;
  analysisGoal?: string;
  roleSetup?: RoleSetup;
  prompt?: string;
}) {
  const resolvedRoleTitle =
    firstNonEmpty(roleSetup?.title, title) || "Open role";
  const resolvedTeam = team?.trim() || "";
  const resolvedSummary =
    firstNonEmpty(roleSetup?.summary, analysisGoal, prompt) ||
    `We are hiring a ${resolvedRoleTitle} and want candidates to show relevant experience, strong execution, and clear communication.`;
  const resolvedRoleSetup: RoleSetup = {
    title: resolvedRoleTitle,
    seniority: firstNonEmpty(roleSetup?.seniority, inferSeniorityFromText(prompt, analysisGoal)),
    location: firstNonEmpty(roleSetup?.location, inferLocationFromText(prompt, analysisGoal)),
    summary: resolvedSummary,
    mustHaveSkills:
      roleSetup?.mustHaveSkills?.filter(Boolean) ??
      [],
    niceToHaveSkills:
      roleSetup?.niceToHaveSkills?.filter(Boolean) ??
      [],
    interviewFocus:
      roleSetup?.interviewFocus?.filter(Boolean) ??
      [],
  };
  const formKind = inferGeneratedFormKind({
    title,
    analysisGoal,
    prompt,
    roleSetup: resolvedRoleSetup,
  });

  return {
    title:
      firstNonEmpty(title, resolvedRoleSetup.title) ||
      `${resolvedRoleTitle} application`,
    team: resolvedTeam,
    intro:
      firstNonEmpty(
        intro,
        buildLocalFormIntro(resolvedRoleTitle, resolvedRoleSetup.location, prompt)
      ) || `Apply for the ${resolvedRoleTitle} role.`,
    analysisGoal:
      firstNonEmpty(
        analysisGoal,
        buildLocalAnalysisGoal(resolvedRoleTitle, resolvedRoleSetup)
      ) || `Screen applicants for ${resolvedRoleTitle}.`,
    roleSetup: resolvedRoleSetup,
    formFields: buildLocalGeneratedFormFields(formKind, resolvedRoleTitle, resolvedRoleSetup),
  };
}

function buildLocalGeneratedFormFields(
  kind: "technical" | "customer" | "general",
  roleTitle: string,
  roleSetup: RoleSetup
) {
  const mustHaveSkillLine = roleSetup.mustHaveSkills.slice(0, 4).join(", ");
  const interviewFocusLine = roleSetup.interviewFocus.slice(0, 3).join(", ");

  if (kind === "technical") {
    return [
      createGeneratedFormField("phone", "Phone number", "phone", false, {
        placeholder: "e.g. +234...",
        helper: "Used for recruiter follow-up.",
        systemKey: "phone",
      }),
      createGeneratedFormField("location", "Location", "short_text", false, {
        placeholder: "City / remote base",
        systemKey: "location",
      }),
      createGeneratedFormField("portfolio", "GitHub, portfolio, or website", "url", false, {
        placeholder: "https://",
        systemKey: "portfolio",
      }),
      createGeneratedFormField("experience", "Years of relevant experience", "short_text", false, {
        placeholder: "e.g. 4+ years",
        systemKey: "yearsExperience",
      }),
      createGeneratedFormField("core-skills", `Which core tools or technologies are you strongest with for this ${roleTitle} role?`, "long_text", true, {
        placeholder:
          mustHaveSkillLine || "Share the tools, systems, languages, or platforms you use most confidently.",
        helper: mustHaveSkillLine
          ? `Prioritize examples tied to: ${mustHaveSkillLine}.`
          : "",
      }),
      createGeneratedFormField("project-proof", "Describe one technical project or problem you solved that best proves your fit.", "long_text", true, {
        placeholder: "Explain the challenge, what you owned, and the outcome.",
      }),
      createGeneratedFormField("availability", "When can you start?", "dropdown", false, {
        options: ["Immediately", "2 weeks", "1 month", "2+ months"],
        helper: "Choose the most realistic option.",
      }),
    ];
  }

  if (kind === "customer") {
    return [
      createGeneratedFormField("phone", "Phone number", "phone", false, {
        placeholder: "e.g. +234...",
        helper: "Used for recruiter follow-up.",
        systemKey: "phone",
      }),
      createGeneratedFormField("location", "Location", "short_text", false, {
        placeholder: "City / state",
        systemKey: "location",
      }),
      createGeneratedFormField("experience", "Years of customer-facing experience", "short_text", false, {
        placeholder: "e.g. 3 years",
        systemKey: "yearsExperience",
      }),
      createGeneratedFormField("service-scenario", "Describe a difficult customer situation you handled well.", "long_text", true, {
        placeholder: "Explain what happened, your response, and the result.",
      }),
      createGeneratedFormField("communication-style", "What makes your communication style effective with customers or stakeholders?", "long_text", true, {
        placeholder:
          interviewFocusLine || "Share practical examples of how you communicate clearly and calmly.",
      }),
      createGeneratedFormField("schedule", "Are you available for shifts, weekends, or public holidays if needed?", "multiple_choice", false, {
        options: ["Yes", "No", "Depends on schedule"],
      }),
      createGeneratedFormField("notice", "Notice period", "short_text", false, {
        placeholder: "e.g. Immediate, 2 weeks",
        systemKey: "noticePeriod",
      }),
    ];
  }

  return [
    createGeneratedFormField("phone", "Phone number", "phone", false, {
      placeholder: "e.g. +234...",
      helper: "Used for recruiter follow-up.",
      systemKey: "phone",
    }),
    createGeneratedFormField("location", "Location", "short_text", false, {
      placeholder: "City / state",
      systemKey: "location",
    }),
    createGeneratedFormField("linkedin", "LinkedIn profile", "url", false, {
      placeholder: "https://linkedin.com/in/...",
      systemKey: "linkedIn",
    }),
    createGeneratedFormField("experience", "Years of relevant experience", "short_text", false, {
      placeholder: "e.g. 5 years",
      systemKey: "yearsExperience",
    }),
    createGeneratedFormField("motivation", `Why are you interested in this ${roleTitle} role?`, "long_text", true, {
      placeholder: "Tell us what makes this role a strong fit for you.",
    }),
    createGeneratedFormField("evidence", "Share one achievement, project, or responsibility that best supports your fit.", "long_text", true, {
      placeholder:
        mustHaveSkillLine || "Include measurable outcomes where possible.",
    }),
    createGeneratedFormField("notice", "Notice period", "short_text", false, {
      placeholder: "e.g. Immediate, 2 weeks",
      systemKey: "noticePeriod",
    }),
    createGeneratedFormField("salary", "Salary expectation", "short_text", false, {
      placeholder: "Optional",
      systemKey: "salaryExpectation",
    }),
  ];
}

function createGeneratedFormField(
  id: string,
  label: string,
  type: HiringFormFieldType,
  required: boolean,
  options?: {
    placeholder?: string;
    helper?: string;
    systemKey?: HiringFormField["systemKey"];
    fieldOptions?: string[];
    options?: string[];
  }
): HiringFormField {
  const choiceOptions =
    options?.fieldOptions ?? options?.options ?? [];

  return {
    id: `generated-${id}`,
    label,
    placeholder: options?.placeholder || "",
    helper: options?.helper || "",
    required,
    type,
    options: isGeneratedChoiceFieldType(type) ? normalizeGeneratedFieldOptions(choiceOptions) : [],
    ...(options?.systemKey ? { systemKey: options.systemKey } : {}),
  };
}

function normalizeGeneratedRoleSetup(value: unknown, fallback: RoleSetup): RoleSetup {
  const parsed = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    title: firstNonEmpty(asNonEmptyString(parsed.title), fallback.title),
    seniority: asNonEmptyString(parsed.seniority) || fallback.seniority,
    location: asNonEmptyString(parsed.location) || fallback.location,
    summary: firstNonEmpty(asNonEmptyString(parsed.summary), fallback.summary),
    mustHaveSkills: normalizeGeneratedStringList(parsed.mustHaveSkills, fallback.mustHaveSkills),
    niceToHaveSkills: normalizeGeneratedStringList(
      parsed.niceToHaveSkills,
      fallback.niceToHaveSkills
    ),
    interviewFocus: normalizeGeneratedStringList(
      parsed.interviewFocus,
      fallback.interviewFocus
    ),
  };
}

function normalizeGeneratedFormFields(
  value: unknown,
  fallback: HiringFormField[]
): HiringFormField[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const seenSystemKeys = new Set<string>();
  const normalized = value
    .map((item, index) => normalizeGeneratedFormField(item, index))
    .filter((item): item is HiringFormField => item !== null)
    .filter((item) => {
      if (!item.systemKey) {
        return true;
      }

      if (seenSystemKeys.has(item.systemKey)) {
        return false;
      }

      seenSystemKeys.add(item.systemKey);
      return true;
    })
    .slice(0, 10);

  return normalized.length > 0 ? normalized : fallback;
}

function normalizeGeneratedFormField(
  value: unknown,
  index: number
): HiringFormField | null {
  const parsed = value && typeof value === "object" ? (value as Record<string, unknown>) : null;

  if (!parsed) {
    return null;
  }

  const label = asNonEmptyString(parsed.label);

  if (!label) {
    return null;
  }

  const normalizedLabel = label.toLowerCase();

  if (
    normalizedLabel.includes("full name") ||
    normalizedLabel === "email" ||
    normalizedLabel.includes("email address") ||
    normalizedLabel.includes("resume") ||
    normalizedLabel.includes("cv upload")
  ) {
    return null;
  }

  const type = normalizeGeneratedFieldType(parsed.type);
  const systemKey = normalizeGeneratedSystemKey(parsed.systemKey);

  return {
    id: asNonEmptyString(parsed.id) || `generated-field-${index + 1}`,
    label,
    placeholder: asNonEmptyString(parsed.placeholder) || "",
    helper: asNonEmptyString(parsed.helper) || "",
    required: parsed.required !== false,
    type,
    options: isGeneratedChoiceFieldType(type)
      ? normalizeGeneratedFieldOptions(parsed.options)
      : [],
    ...(systemKey ? { systemKey } : {}),
  } satisfies HiringFormField;
}

function normalizeGeneratedFieldType(value: unknown): HiringFormFieldType {
  const normalized = String(value || "").trim();
  const allowed: HiringFormFieldType[] = [
    "short_text",
    "long_text",
    "email",
    "phone",
    "url",
    "number",
    "date",
    "multiple_choice",
    "checkboxes",
    "dropdown",
  ];

  return allowed.includes(normalized as HiringFormFieldType)
    ? (normalized as HiringFormFieldType)
    : "short_text";
}

function normalizeGeneratedSystemKey(value: unknown): HiringFormField["systemKey"] | undefined {
  const normalized = String(value || "").trim();
  const allowed: Array<HiringFormField["systemKey"]> = [
    "phone",
    "location",
    "linkedIn",
    "portfolio",
    "yearsExperience",
    "noticePeriod",
    "salaryExpectation",
    "coverNote",
  ];

  return allowed.includes(normalized as HiringFormField["systemKey"])
    ? (normalized as HiringFormField["systemKey"])
    : undefined;
}

function normalizeGeneratedFieldOptions(value: unknown) {
  const options = Array.isArray(value) ? value : [];
  const normalized = options
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 8);

  return normalized.length >= 2 ? normalized : ["Option 1", "Option 2"];
}

function normalizeGeneratedStringList(value: unknown, fallback: string[]) {
  const options = Array.isArray(value) ? value : [];
  const normalized = uniqueStringList(
    options
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .slice(0, 8)
  );

  return normalized.length > 0 ? normalized : fallback;
}

function buildLocalFormIntro(
  roleTitle: string,
  location: string,
  prompt?: string
) {
  const roleLine = location
    ? `Apply for the ${roleTitle} role${location ? ` in a ${location} setup` : ""}.`
    : `Apply for the ${roleTitle} role.`;
  const extraLine = firstSentenceAsBullet(prompt);

  return [roleLine, "Share your relevant experience, examples of your work, and practical availability details.", extraLine]
    .filter(Boolean)
    .join(" ");
}

function buildLocalAnalysisGoal(roleTitle: string, roleSetup: RoleSetup) {
  const mustHave = roleSetup.mustHaveSkills.slice(0, 4).join(", ");
  const focus = roleSetup.interviewFocus.slice(0, 3).join(", ");
  const sentences = [
    `Screen applicants for ${roleTitle} using role match, clarity of evidence, and practical readiness.`,
    mustHave ? `Prioritize evidence of ${mustHave}.` : "",
    focus ? `Pay close attention to ${focus}.` : "",
  ].filter(Boolean);

  return sentences.join(" ");
}

function inferGeneratedFormKind({
  title,
  analysisGoal,
  prompt,
  roleSetup,
}: {
  title?: string;
  analysisGoal?: string;
  prompt?: string;
  roleSetup: RoleSetup;
}) {
  const combined = [
    title,
    analysisGoal,
    prompt,
    roleSetup.title,
    roleSetup.summary,
    roleSetup.mustHaveSkills.join(" "),
    roleSetup.niceToHaveSkills.join(" "),
    roleSetup.interviewFocus.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    /(engineer|developer|frontend|backend|full[- ]?stack|software|qa|devops|data|it support|technical|api|next\.?js|react|typescript)/.test(
      combined
    )
  ) {
    return "technical";
  }

  if (
    /(customer|support|service|success|call center|relationship|sales|account manager|client)/.test(
      combined
    )
  ) {
    return "customer";
  }

  return "general";
}

function inferSeniorityFromText(...values: Array<string | undefined>) {
  const combined = values.filter(Boolean).join(" ").toLowerCase();

  if (/\b(senior|lead|principal|staff)\b/.test(combined)) {
    return "Senior";
  }

  if (/\b(junior|entry|graduate|intern)\b/.test(combined)) {
    return "Junior";
  }

  if (/\b(mid|intermediate)\b/.test(combined)) {
    return "Mid-level";
  }

  return "";
}

function inferLocationFromText(...values: Array<string | undefined>) {
  const combined = values.filter(Boolean).join(" ").toLowerCase();

  if (/\bremote\b/.test(combined)) {
    return "Remote";
  }

  if (/\bhybrid\b/.test(combined)) {
    return "Hybrid";
  }

  if (/\bonsite\b/.test(combined) || /\bon-site\b/.test(combined)) {
    return "Onsite";
  }

  return "";
}

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function isGeneratedChoiceFieldType(type: HiringFormFieldType) {
  return type === "multiple_choice" || type === "checkboxes" || type === "dropdown";
}

function firstNonEmpty(...values: Array<string | undefined>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function firstSentenceAsBullet(value: string | undefined) {
  if (!value || !value.trim()) {
    return "";
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  const [sentence] = normalized.split(/(?<=[.!?])\s+/);
  return sentence?.trim() || normalized;
}

function parseLooseJson(raw: string) {
  const trimmed = stripReasoningBlocks(raw).trim();

  for (const candidate of buildJsonCandidates(trimmed)) {
    const parsed = tryParseJson(candidate);

    if (parsed !== undefined) {
      return parsed;
    }
  }

  console.warn(
    `[AI parser] Invalid JSON response preview: ${formatProviderTextPreview(trimmed)}`
  );
  throw new DocumentAnalysisError(
    "The AI response was not valid JSON, so the analysis could not be completed.",
    502
  );
}

function getHuggingFaceModelCandidates() {
  return uniqueStringList([
    ...parseModelList(process.env.HF_MODEL),
    ...parseModelList(process.env.HF_FALLBACK_MODELS),
    ...DEFAULT_HUGGING_FACE_MODELS,
  ]);
}

function getGeminiModelCandidates() {
  return uniqueStringList([
    ...parseModelList(process.env.GEMINI_MODEL).map(normalizeGeminiModelName),
    ...parseModelList(process.env.GEMINI_FALLBACK_MODELS).map(normalizeGeminiModelName),
    DEFAULT_GEMINI_MODEL,
    ...DEFAULT_GEMINI_FALLBACK_MODELS,
  ]);
}

function parseModelList(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeGeminiModelName(value: string) {
  return value.replace(/^models\//i, "").trim();
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatProviderTextPreview(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 220) || "(empty response)";
}

function containsParseableJson(value: string) {
  return buildJsonCandidates(value).some((candidate) => tryParseJson(candidate) !== undefined);
}

function recoverJsonFromPlainTextResponse(value: string) {
  const normalized = stripReasoningBlocks(value).replace(/\r/g, "").trim();

  if (!normalized) {
    return null;
  }

  const lines = uniqueStringList(
    normalized
      .split("\n")
      .map((line) => cleanPlainTextSignalLine(line))
      .filter((line) => line.length >= 4)
  );
  const sentences = normalized
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 12);
  const summary = summarizePlainTextResponse(sentences, lines);
  const interviewQuestions = uniqueStringList(
    lines.filter((line) => /[?]$/.test(line)).slice(0, 4)
  );
  const recommendedActions = uniqueStringList(
    lines
      .filter((line) => isRecommendedActionLine(line))
      .map((line) => stripLeadingVerbPhrase(line))
      .slice(0, 4)
  );
  const redFlags = uniqueStringList(
    lines.filter((line) => isConcernLine(line)).slice(0, 4)
  );
  const keyHighlights = uniqueStringList(
    lines
      .filter(
        (line) =>
          !redFlags.includes(line) &&
          !recommendedActions.includes(line) &&
          !/[?]$/.test(line) &&
          isHighlightLine(line)
      )
      .slice(0, 5)
  );
  const recommendation = inferRecommendationFromPlainText(normalized);

  if (
    !summary &&
    keyHighlights.length === 0 &&
    redFlags.length === 0 &&
    recommendedActions.length === 0 &&
    interviewQuestions.length === 0 &&
    !recommendation
  ) {
    return null;
  }

  const payload: Record<string, unknown> = {};

  if (summary) {
    payload.summary = summary;
  }

  if (recommendation) {
    payload.recommendation = recommendation;
  }

  if (keyHighlights.length > 0) {
    payload.keyHighlights = keyHighlights;
  }

  if (redFlags.length > 0) {
    payload.redFlags = redFlags;
  }

  if (recommendedActions.length > 0) {
    payload.recommendedActions = recommendedActions;
  }

  if (interviewQuestions.length > 0) {
    payload.interviewQuestions = interviewQuestions;
  }

  payload.tone = inferToneFromPlainText(normalized);

  return JSON.stringify(payload);
}

function cleanPlainTextSignalLine(line: string) {
  return line
    .replace(/^[-*•\d.()\s]+/, "")
    .replace(/\*\*/g, "")
    .replace(/^[A-Za-z ]+:\s*(?=[A-Z0-9])/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizePlainTextResponse(sentences: string[], lines: string[]) {
  if (sentences.length > 0) {
    return sentences.slice(0, 2).join(" ").slice(0, 320).trim();
  }

  if (lines.length > 0) {
    return lines.slice(0, 2).join(" ").slice(0, 320).trim();
  }

  return "";
}

function isConcernLine(line: string) {
  const normalized = line.toLowerCase();

  return [
    "concern",
    "risk",
    "missing",
    "gap",
    "weak",
    "unclear",
    "limited",
    "lack",
    "issue",
    "flag",
  ].some((keyword) => normalized.includes(keyword));
}

function isRecommendedActionLine(line: string) {
  const normalized = line.toLowerCase();

  return [
    "interview",
    "follow up",
    "follow-up",
    "review",
    "verify",
    "check",
    "ask",
    "confirm",
    "shortlist",
    "move forward",
    "hold",
  ].some((keyword) => normalized.includes(keyword));
}

function stripLeadingVerbPhrase(line: string) {
  return line
    .replace(/^(recommend(?:ed)?|next steps?|action|actions|interview focus):\s*/i, "")
    .trim();
}

function isHighlightLine(line: string) {
  const normalized = line.toLowerCase();

  return (
    /\d/.test(line) ||
    [
      "experience",
      "impact",
      "achieve",
      "improve",
      "built",
      "managed",
      "led",
      "resolved",
      "implemented",
      "strong",
      "fit",
      "skill",
      "support",
      "project",
    ].some((keyword) => normalized.includes(keyword))
  );
}

function inferRecommendationFromPlainText(value: string) {
  const normalized = value.toLowerCase();

  if (normalized.includes("shortlist")) {
    return {
      decision: "Shortlist",
      summary: "The screening notes support shortlist consideration.",
      confidence: "Medium",
    } satisfies HiringRecommendation;
  }

  if (normalized.includes("interview") || normalized.includes("move forward")) {
    return {
      decision: "Interview",
      summary: "The screening notes support moving this candidate into interview review.",
      confidence: "Medium",
    } satisfies HiringRecommendation;
  }

  if (normalized.includes("reject")) {
    return {
      decision: "Reject",
      summary: "The screening notes point to enough gaps to pause forward movement.",
      confidence: "Medium",
    } satisfies HiringRecommendation;
  }

  if (normalized.includes("hold")) {
    return {
      decision: "Hold",
      summary: "The screening notes suggest holding this profile for closer review.",
      confidence: "Medium",
    } satisfies HiringRecommendation;
  }

  return null;
}

function inferToneFromPlainText(value: string) {
  const normalized = value.toLowerCase();

  if (normalized.includes("strong") || normalized.includes("promising")) {
    return "Confident";
  }

  if (normalized.includes("risk") || normalized.includes("concern")) {
    return "Cautious";
  }

  return "Balanced";
}

function isUnsupportedJsonModeError(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("response_format") ||
    normalized.includes("json_object") ||
    normalized.includes("json mode") ||
    normalized.includes("supported")
  );
}

function buildJsonCandidates(value: string) {
  const candidates: string[] = [];

  pushJsonCandidate(candidates, value);
  pushJsonCandidate(candidates, sanitizeJsonCandidate(value));

  for (const match of value.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const fencedValue = match[1]?.trim();

    if (!fencedValue) {
      continue;
    }

    pushJsonCandidate(candidates, fencedValue);
    pushJsonCandidate(candidates, sanitizeJsonCandidate(fencedValue));
  }

  for (const jsonBlock of extractBalancedJsonBlocks(value)) {
    pushJsonCandidate(candidates, jsonBlock);
    pushJsonCandidate(candidates, sanitizeJsonCandidate(jsonBlock));
  }

  return candidates;
}

function pushJsonCandidate(candidates: string[], value: string) {
  const normalized = value.trim();

  if (!normalized || candidates.includes(normalized)) {
    return;
  }

  candidates.push(normalized);
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function sanitizeJsonCandidate(value: string) {
  return stripReasoningBlocks(value)
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function stripReasoningBlocks(value: string) {
  return value.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function extractBalancedJsonBlocks(value: string) {
  const blocks: string[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (character !== "{" && character !== "[") {
      continue;
    }

    const block = readBalancedJsonBlock(value, index);

    if (block) {
      blocks.push(block);
    }

    if (blocks.length >= 6) {
      break;
    }
  }

  return blocks;
}

function readBalancedJsonBlock(value: string, startIndex: number) {
  const openingCharacter = value[startIndex];
  const closingCharacter = openingCharacter === "{" ? "}" : "]";
  const stack = [closingCharacter];
  let inString = false;
  let isEscaped = false;

  for (let index = startIndex + 1; index < value.length; index += 1) {
    const character = value[index];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (character === "\\") {
      isEscaped = true;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === "{") {
      stack.push("}");
      continue;
    }

    if (character === "[") {
      stack.push("]");
      continue;
    }

    if (character === "}" || character === "]") {
      const expected = stack.pop();

      if (expected !== character) {
        return "";
      }

      if (stack.length === 0) {
        return value.slice(startIndex, index + 1);
      }
    }
  }

  return "";
}

function normalizeChunkDigest(input: unknown): ChunkDigest {
  const candidate = isRecord(input) ? input : {};

  return {
    chunkSummary: toSentence(candidate.chunkSummary, "No chunk summary returned."),
    highlights: toStringArray(candidate.highlights, 4),
    redFlags: toStringArray(candidate.redFlags, 3),
    roleSignals: toRoleCriteria(candidate.roleSignals, 5),
    evidencePoints: toEvidencePoints(candidate.evidencePoints, 5),
    facts: toFacts(candidate.facts, 5),
  };
}

function mergeRemoteWithLocalResult(
  remote: AnalysisResult,
  local: AnalysisResult
): AnalysisResult {
  const useRemoteScore = hasUsefulRemoteScore(remote.score);
  const useRemoteRecommendation =
    useRemoteScore || hasUsefulRemoteRecommendation(remote.recommendation, remote.score);

  return {
    ...local,
    documentType: remote.documentType !== "other" ? remote.documentType : local.documentType,
    summary: preferMeaningfulSentence(
      remote.summary,
      local.summary,
      "No summary was returned"
    ),
    recommendation: useRemoteRecommendation
      ? {
          decision: remote.recommendation.decision,
          summary: preferMeaningfulSentence(
            remote.recommendation.summary,
            local.recommendation.summary,
            "The screening signals support",
            "The profile looks promising",
            "The resume shows partial fit",
            "The current screening view shows too many gaps"
          ),
          confidence: remote.recommendation.confidence,
        }
      : local.recommendation,
    candidateProfile: {
      name:
        remote.candidateProfile.name !== "Unknown candidate"
          ? remote.candidateProfile.name
          : local.candidateProfile.name,
      headline:
        remote.candidateProfile.headline !== "Candidate profile"
          ? remote.candidateProfile.headline
          : local.candidateProfile.headline,
      summary: preferMeaningfulSentence(
        remote.candidateProfile.summary,
        local.candidateProfile.summary,
        "The candidate profile was generated"
      ),
      fields:
        remote.candidateProfile.fields.length > 0
          ? remote.candidateProfile.fields
          : local.candidateProfile.fields,
    },
    roleMatch: {
      summary: preferMeaningfulSentence(
        remote.roleMatch.summary,
        local.roleMatch.summary,
        "The role match view reflects"
      ),
      criteria: hasUsefulRoleCriteria(remote.roleMatch.criteria)
        ? remote.roleMatch.criteria
        : local.roleMatch.criteria,
    },
    skillAssessments: hasUsefulSkillAssessments(remote.skillAssessments)
      ? remote.skillAssessments
      : local.skillAssessments,
    riskSignals: hasUsefulRiskSignals(remote.riskSignals)
      ? remote.riskSignals
      : local.riskSignals,
    keyHighlights:
      remote.keyHighlights.length > 0 ? remote.keyHighlights : local.keyHighlights,
    redFlags: remote.redFlags.length > 0 ? remote.redFlags : local.redFlags,
    recommendedActions:
      remote.recommendedActions.length > 0
        ? remote.recommendedActions
        : local.recommendedActions,
    evidencePoints:
      remote.evidencePoints.length > 0 ? remote.evidencePoints : local.evidencePoints,
    interviewQuestions:
      remote.interviewQuestions.length > 0
        ? remote.interviewQuestions
        : local.interviewQuestions,
    score: useRemoteScore ? remote.score : local.score,
    extractedFacts:
      remote.extractedFacts.length > 0 ? remote.extractedFacts : local.extractedFacts,
    tone: preferMeaningfulSentence(remote.tone, local.tone, "Balanced"),
  };
}

function hasUsefulRemoteRecommendation(
  recommendation: HiringRecommendation,
  score: AnalysisResult["score"]
) {
  const fallbackRecommendation = recommendationFromScore(score.value);

  return (
    recommendation.decision !== fallbackRecommendation.decision ||
    recommendation.summary !== fallbackRecommendation.summary ||
    recommendation.confidence !== fallbackRecommendation.confidence
  );
}

function hasUsefulRemoteScore(score: AnalysisResult["score"]) {
  return score.breakdown.some(
    (item) =>
      item.category !== "Overall quality" ||
      item.note !== "Fallback breakdown generated because the model omitted details."
  );
}

function normalizeFinalResult(
  input: unknown,
  requestedDocumentType: DocumentType,
  roleSetup?: RoleSetup
): AnalysisResult {
  const candidate = isRecord(input) ? input : {};
  const scoreInput = isRecord(candidate.score) ? candidate.score : {};
  const breakdown = toBreakdown(scoreInput.breakdown);
  const fallbackType = requestedDocumentType === "auto" ? "other" : requestedDocumentType;
  const scoreValue = clampNumber(scoreInput.value, 0, 100, 68);
  const keyHighlights = toStringArray(candidate.keyHighlights, 6);
  const redFlags = toStringArray(candidate.redFlags, 5);
  const recommendedActions = toStringArray(candidate.recommendedActions, 4);
  const evidencePoints = toEvidencePoints(candidate.evidencePoints, 6);
  const interviewQuestions = toStringArray(candidate.interviewQuestions, 6);
  const extractedFacts = toFacts(candidate.extractedFacts, 8);
  const roleMatch = toRoleMatch(candidate.roleMatch, roleSetup);
  const skillAssessments = toSkillAssessments(
    candidate.skillAssessments,
    roleSetup,
    roleMatch.criteria,
    keyHighlights,
    redFlags
  );
  const riskSignals = toRiskSignals(candidate.riskSignals, redFlags);

  return {
    documentType: normalizeDocumentType(candidate.documentType, fallbackType),
    summary: toSentence(
      candidate.summary,
      "No summary was returned, but the document was processed successfully."
    ),
    recommendation: toRecommendation(candidate.recommendation, scoreValue),
    candidateProfile: toCandidateProfile(candidate.candidateProfile),
    roleMatch,
    skillAssessments,
    riskSignals,
    keyHighlights,
    redFlags,
    recommendedActions,
    evidencePoints,
    interviewQuestions,
    score: {
      value: scoreValue,
      label: toSentence(scoreInput.label, scoreLabelFromValue(scoreValue)),
      rationale: toSentence(
        scoreInput.rationale,
        "The score reflects the document's overall clarity, completeness, and risk profile."
      ),
      breakdown:
        breakdown.length > 0
          ? breakdown
          : [
              {
                category: "Overall quality",
                score: scoreValue,
                note: "Fallback breakdown generated because the model omitted details.",
              },
            ],
    },
    extractedFacts,
    tone: toSentence(candidate.tone, "Balanced"),
  };
}

function normalizeDocumentType(
  value: unknown,
  fallback: Exclude<DocumentType, "auto"> | "other"
): AnalysisResult["documentType"] {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (
    normalized === "cv" ||
    normalized === "contract" ||
    normalized === "invoice" ||
    normalized === "report" ||
    normalized === "other"
  ) {
    return normalized;
  }

  return fallback;
}

function toRecommendation(
  value: unknown,
  scoreValue: number
): HiringRecommendation {
  const candidate = isRecord(value) ? value : {};
  const fallback = recommendationFromScore(scoreValue);

  return {
    decision: normalizeDecision(candidate.decision, fallback.decision),
    summary: toSentence(candidate.summary, fallback.summary),
    confidence: normalizeConfidence(candidate.confidence, fallback.confidence),
  };
}

function toCandidateProfile(value: unknown): CandidateProfile {
  const candidate = isRecord(value) ? value : {};
  const fields = Array.isArray(candidate.fields)
    ? candidate.fields
        .map((item) => {
          if (!isRecord(item)) {
            return null;
          }

          const label = toSentence(item.label, "");
          const fieldValue = toSentence(item.value, "");

          if (!label || !fieldValue) {
            return null;
          }

          return { label, value: fieldValue };
        })
        .filter((item): item is CandidateProfile["fields"][number] => item !== null)
        .slice(0, 6)
    : [];

  return {
    name: toSentence(candidate.name, "Unknown candidate"),
    headline: toSentence(candidate.headline, "Candidate profile"),
    summary: toSentence(
      candidate.summary,
      "The candidate profile was generated from the parsed resume text."
    ),
    fields,
  };
}

function toRoleMatch(value: unknown, roleSetup?: RoleSetup) {
  const candidate = isRecord(value) ? value : {};
  const criteria = toRoleCriteria(candidate.criteria, 6);

  return {
    summary: toSentence(
      candidate.summary,
      roleSetup && hasRoleSetup(roleSetup)
        ? "The role match view reflects how the resume aligns with the structured hiring brief."
        : "The role match view reflects how the resume aligns with the screening brief."
    ),
    criteria:
      criteria.length > 0
        ? criteria
        : buildFallbackRoleCriteria(roleSetup),
  };
}

function toRoleCriteria(value: unknown, limit: number): RoleCriterionMatch[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const criterion = toSentence(item.criterion, "");
      const evidence = toSentence(item.evidence, "");
      const status = normalizeCriterionStatus(item.status);

      if (!criterion || !evidence) {
        return null;
      }

      return {
        criterion,
        status,
        evidence,
      };
    })
    .filter((item): item is RoleCriterionMatch => item !== null)
    .slice(0, limit);
}

function toSkillAssessments(
  value: unknown,
  roleSetup: RoleSetup | undefined,
  roleCriteria: RoleCriterionMatch[],
  keyHighlights: string[],
  redFlags: string[]
): SkillAssessment[] {
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => {
        if (!isRecord(item)) {
          return null;
        }

        const skill = toSentence(item.skill, "");
        const evidence = toSentence(item.evidence, "");

        if (!skill || !evidence) {
          return null;
        }

        return {
          skill,
          category: normalizeSkillCategory(item.category),
          status: normalizeSkillStatus(item.status),
          score: clampNumber(item.score, 0, 100, fallbackSkillScore(item.status)),
          evidence,
        };
      })
      .filter((item): item is SkillAssessment => item !== null)
      .slice(0, 8);

    if (normalized.length > 0) {
      return normalized;
    }
  }

  return buildFallbackSkillAssessments(roleSetup, roleCriteria, keyHighlights, redFlags);
}

function toRiskSignals(value: unknown, redFlags: string[]): RiskSignal[] {
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => {
        if (!isRecord(item)) {
          return null;
        }

        const category = toSentence(item.category, "");
        const summary = toSentence(item.summary, "");

        if (!category || !summary) {
          return null;
        }

        return {
          category,
          summary,
          level: normalizeRiskLevel(item.level),
        };
      })
      .filter((item): item is RiskSignal => item !== null)
      .slice(0, 5);

    if (normalized.length > 0) {
      return normalized;
    }
  }

  return buildFallbackRiskSignals(redFlags);
}

function toEvidencePoints(value: unknown, limit: number): EvidencePoint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const title = toSentence(item.title, "");
      const excerpt = toSentence(item.excerpt, "");
      const rationale = toSentence(item.rationale, "");
      const tone = normalizeEvidenceTone(item.tone);

      if (!title || !rationale) {
        return null;
      }

      return {
        title,
        excerpt,
        rationale,
        tone,
      };
    })
    .filter((item): item is EvidencePoint => item !== null)
    .slice(0, limit);
}

function buildFallbackRoleCriteria(roleSetup?: RoleSetup): RoleCriterionMatch[] {
  if (!roleSetup || !hasRoleSetup(roleSetup)) {
    return [];
  }

  return [...roleSetup.mustHaveSkills, ...roleSetup.niceToHaveSkills]
    .slice(0, 6)
    .map((skill, index) => {
      const criterion: RoleCriterionMatch = {
        criterion: skill,
        status:
          index < Math.max(1, Math.ceil(roleSetup.mustHaveSkills.length / 2))
            ? "partial"
            : "missing",
        evidence:
          "The model did not return explicit role-match criteria, so this was inferred from the structured role brief.",
      };

      return criterion;
    });
}

function buildFallbackSkillAssessments(
  roleSetup: RoleSetup | undefined,
  roleCriteria: RoleCriterionMatch[],
  keyHighlights: string[],
  redFlags: string[]
): SkillAssessment[] {
  const criteriaSkills = roleCriteria.map((item) => ({
    skill: item.criterion,
    category: roleSetup?.mustHaveSkills.includes(item.criterion)
      ? "must-have"
      : roleSetup?.niceToHaveSkills.includes(item.criterion)
        ? "nice-to-have"
        : "general",
    status:
      item.status === "matched"
        ? "strong"
        : item.status === "partial"
          ? "partial"
          : "missing",
    score:
      item.status === "matched" ? 88 : item.status === "partial" ? 62 : 28,
    evidence: item.evidence,
  })) satisfies SkillAssessment[];

  if (criteriaSkills.length > 0) {
    return criteriaSkills.slice(0, 8);
  }

  const fallbackSummary = keyHighlights[0] || redFlags[0] || "The model did not return a structured skill assessment.";

  return [
    {
      skill: "General role fit",
      category: "general",
      status: "unclear",
      score: 55,
      evidence: fallbackSummary,
    },
  ];
}

function buildFallbackRiskSignals(redFlags: string[]): RiskSignal[] {
  if (redFlags.length === 0) {
    return [
      {
        category: "Screening confidence",
        level: "low",
        summary: "No major risk signals were surfaced in the model response.",
      },
    ];
  }

  return redFlags.slice(0, 4).map((flag, index) => ({
    category: index === 0 ? "Primary concern" : `Concern ${index + 1}`,
    level: index === 0 ? "high" : "medium",
    summary: flag,
  }));
}

function toStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, limit);
}

function toFacts(value: unknown, limit: number): ExtractedFact[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const label = toSentence(item.label, "");
      const factValue = toSentence(item.value, "");

      if (!label || !factValue) {
        return null;
      }

      return { label, value: factValue };
    })
    .filter((item): item is ExtractedFact => item !== null)
    .slice(0, limit);
}

function toBreakdown(value: unknown): ScoreBreakdownItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const category = toSentence(item.category, "");
      const note = toSentence(item.note, "");

      if (!category || !note) {
        return null;
      }

      return {
        category,
        note,
        score: clampNumber(item.score, 0, 100, 65),
      };
    })
    .filter((item): item is ScoreBreakdownItem => item !== null)
    .slice(0, 4);
}

function toSentence(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeDecision(
  value: unknown,
  fallback: HiringRecommendation["decision"]
): HiringRecommendation["decision"] {
  if (
    value === "Shortlist" ||
    value === "Interview" ||
    value === "Hold" ||
    value === "Reject"
  ) {
    return value;
  }

  return fallback;
}

function normalizeConfidence(
  value: unknown,
  fallback: HiringRecommendation["confidence"]
): HiringRecommendation["confidence"] {
  if (value === "High" || value === "Medium" || value === "Low") {
    return value;
  }

  return fallback;
}

function normalizeSkillCategory(
  value: unknown
): SkillAssessment["category"] {
  if (value === "must-have" || value === "nice-to-have" || value === "general") {
    return value;
  }

  return "general";
}

function normalizeSkillStatus(
  value: unknown
): SkillAssessment["status"] {
  if (
    value === "strong" ||
    value === "partial" ||
    value === "unclear" ||
    value === "missing"
  ) {
    return value;
  }

  return "unclear";
}

function normalizeCriterionStatus(
  value: unknown
): RoleCriterionMatch["status"] {
  if (value === "matched" || value === "partial" || value === "missing") {
    return value;
  }

  return "partial";
}

function normalizeRiskLevel(value: unknown): RiskSignal["level"] {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return "medium";
}

function normalizeEvidenceTone(value: unknown): EvidencePoint["tone"] {
  if (value === "strength" || value === "concern" || value === "neutral") {
    return value;
  }

  return "neutral";
}

function fallbackSkillScore(value: unknown) {
  if (value === "strong") {
    return 86;
  }

  if (value === "partial") {
    return 62;
  }

  if (value === "missing") {
    return 28;
  }

  return 50;
}

function recommendationFromScore(value: number): HiringRecommendation {
  if (value >= 84) {
    return {
      decision: "Shortlist",
      summary: "The screening signals support moving this candidate into the shortlist.",
      confidence: "High",
    };
  }

  if (value >= 70) {
    return {
      decision: "Interview",
      summary: "The profile looks promising, with enough evidence to justify an interview.",
      confidence: "Medium",
    };
  }

  if (value >= 52) {
    return {
      decision: "Hold",
      summary: "The resume shows partial fit, but important gaps still need closer review.",
      confidence: "Medium",
    };
  }

  return {
    decision: "Reject",
    summary: "The current screening view shows too many gaps to recommend moving forward.",
    confidence: "High",
  };
}

function hasRoleSetup(roleSetup: RoleSetup) {
  return Boolean(
    roleSetup.title ||
      roleSetup.seniority ||
      roleSetup.location ||
      roleSetup.summary ||
      roleSetup.mustHaveSkills.length > 0 ||
      roleSetup.niceToHaveSkills.length > 0 ||
      roleSetup.interviewFocus.length > 0
  );
}

function scoreLabelFromValue(value: number) {
  if (value >= 85) {
    return "Excellent";
  }

  if (value >= 72) {
    return "Strong";
  }

  if (value >= 55) {
    return "Mixed";
  }

  if (value >= 35) {
    return "Needs review";
  }

  return "Risky";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function preferMeaningfulSentence(
  candidate: string,
  fallback: string,
  ...placeholderStarts: string[]
) {
  const normalizedCandidate = candidate.trim();
  const normalizedFallback = fallback.trim();

  if (!normalizedCandidate) {
    return normalizedFallback;
  }

  const lowerCandidate = normalizedCandidate.toLowerCase();

  if (
    placeholderStarts.some((value) => lowerCandidate.startsWith(value.toLowerCase()))
  ) {
    return normalizedFallback;
  }

  return normalizedCandidate;
}

function hasUsefulRoleCriteria(criteria: RoleCriterionMatch[]) {
  return (
    criteria.length > 0 &&
    criteria.some(
      (item) =>
        item.status !== "partial" ||
        !item.evidence
          .toLowerCase()
          .includes("the model did not return explicit role-match criteria")
    )
  );
}

function hasUsefulSkillAssessments(assessments: SkillAssessment[]) {
  return (
    assessments.length > 0 &&
    assessments.some(
      (item) =>
        item.category !== "general" ||
        item.status === "strong" ||
        item.status === "missing"
    )
  );
}

function hasUsefulRiskSignals(signals: RiskSignal[]) {
  return (
    signals.length > 0 &&
    signals.some(
      (item) =>
        item.category !== "Screening confidence" &&
        item.summary !== "No major risk signals were surfaced in the model response."
    )
  );
}

function formatProviderFailure(error: unknown) {
  if (error instanceof Error) {
    return error.message.replace(/\s+/g, " ").trim();
  }

  return "Unknown provider failure";
}

function extractProviderWarnings(error: unknown) {
  const message = formatProviderFailure(error);

  if (!message) {
    return ["Enhanced local review was used for this run."];
  }

  const warnings = message
    .split(/(?=gemini:|huggingface:)/i)
    .map((item) => summarizeProviderWarning(item))
    .filter(Boolean);

  return warnings.length > 0
    ? uniqueStringList(warnings).slice(0, 2)
    : ["Enhanced local review was used because remote AI was unavailable."];
}

function summarizeProviderWarning(warning: string) {
  const trimmed = warning.trim();

  if (!trimmed) {
    return "";
  }

  const normalized = trimmed.toLowerCase();
  const providerName = normalized.startsWith("huggingface:")
    ? "Hugging Face"
    : normalized.startsWith("gemini:")
      ? "Gemini"
      : normalized.includes("hugging face")
        ? "Hugging Face"
        : normalized.includes("gemini")
          ? "Gemini"
          : "Remote AI";

  if (normalized.includes("high demand")) {
    return `${providerName} was busy for this run.`;
  }

  if (normalized.includes("quota") || normalized.includes("too many requests")) {
    return `${providerName} hit a free-tier limit for this run.`;
  }

  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("couldn't reach")
  ) {
    return `${providerName} timed out for this run.`;
  }

  if (normalized.includes("temporarily skipped")) {
    return `${providerName} was skipped briefly after a recent failure.`;
  }

  if (
    normalized.includes("structured response") ||
    normalized.includes("valid json") ||
    normalized.includes("non-json") ||
    normalized.includes("incomplete")
  ) {
    return `${providerName} returned an incomplete response for this run.`;
  }

  if (normalized.includes("not configured")) {
    return `${providerName} is not configured.`;
  }

  return `${providerName} was unavailable for this run.`;
}

function providerNetworkError(providerName: string, error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("timeout") || message.includes("timed out")) {
    return new DocumentAnalysisError(`${providerName} timed out before responding.`, 502);
  }

  if (
    message.includes("fetch failed") ||
    message.includes("connect") ||
    message.includes("network")
  ) {
    return new DocumentAnalysisError(`${providerName} could not be reached for this run.`, 502);
  }

  return new DocumentAnalysisError(
    `${providerName} was unavailable for this run.`,
    502
  );
}

function uniqueStringList(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
