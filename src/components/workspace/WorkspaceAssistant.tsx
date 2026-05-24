"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import { useWorkspace } from "@/context/WorkspaceContext";
import {
  buildWorkspaceAssistantWelcomeMessage,
  getWorkspaceAssistantOrganizationFirstName,
  getWorkspaceAssistantPageLabel,
  getWorkspaceAssistantQuickPrompts,
  type WorkspaceAssistantMessage,
} from "@/lib/workspace-assistant";
import { buildPublicFormTheme } from "@/lib/workspace-settings";
import { ChatIcon, CloseIcon, CloseLineIcon, FileIcon, PaperPlaneIcon, ShootingStarIcon } from "@/icons";
import type { StoredAnalysisSession } from "@/types/analysis-session";
import { maxUploadSizeBytes } from "@/types/document-intelligence";

type WorkspaceAssistantProps = {
  session: {
    role: "admin" | "member";
  };
  initialOpen?: boolean;
};

type ScreeningIntakeStep = "role" | "criteria" | null;
type AssistantPosition = { x: number; y: number };

const screeningAttachmentAccept =
  ".pdf,.txt,.log,.md,.markdown,.csv,.tsv,.json,.html,.htm,.xml,.rtf,.png,.jpg,.jpeg,.webp,.gif,.bmp";
const maxAssistantBulkScreeningFiles = 25;
const assistantBubbleSizePx = 64;
const assistantEdgePaddingPx = 16;

function getDefaultAssistantPosition(width: number, height: number): AssistantPosition {
  return {
    x: Math.max(assistantEdgePaddingPx, width - assistantBubbleSizePx - 24),
    y: Math.max(assistantEdgePaddingPx, height - assistantBubbleSizePx - 24),
  };
}

function clampAssistantPosition(
  position: AssistantPosition,
  width: number,
  height: number
): AssistantPosition {
  return {
    x: Math.min(
      Math.max(assistantEdgePaddingPx, position.x),
      Math.max(assistantEdgePaddingPx, width - assistantBubbleSizePx - assistantEdgePaddingPx)
    ),
    y: Math.min(
      Math.max(assistantEdgePaddingPx, position.y),
      Math.max(assistantEdgePaddingPx, height - assistantBubbleSizePx - assistantEdgePaddingPx)
    ),
  };
}

export default function WorkspaceAssistant({
  session,
  initialOpen = false,
}: WorkspaceAssistantProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { settings } = useWorkspace();
  const theme = buildPublicFormTheme(settings.dashboardAccent);
  const workspaceScope = `${settings.workspaceId}:${session.role}:${settings.appName}:${settings.organizationName}`;
  const firstName = getWorkspaceAssistantOrganizationFirstName(settings.organizationName);
  const currentPageLabel = getWorkspaceAssistantPageLabel(pathname);
  const welcomeMessage = useMemo(
    () =>
      buildWorkspaceAssistantWelcomeMessage({
        appName: settings.appName,
        organizationName: settings.organizationName,
        role: session.role,
        pathname,
      }),
    [pathname, session.role, settings.appName, settings.organizationName]
  );
  const quickPrompts = useMemo(
    () =>
      getWorkspaceAssistantQuickPrompts({
        appName: settings.appName,
        organizationName: settings.organizationName,
        role: session.role,
        pathname,
      }),
    [pathname, session.role, settings.appName, settings.organizationName]
  );
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [hasDismissedHint, setHasDismissedHint] = useState(initialOpen);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<WorkspaceAssistantMessage[]>([
    { role: "assistant", content: welcomeMessage },
  ]);
  const [isSending, setIsSending] = useState(false);
  const [isScreeningAttachment, setIsScreeningAttachment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [attachedScreeningFiles, setAttachedScreeningFiles] = useState<File[]>([]);
  const [screeningIntakeStep, setScreeningIntakeStep] = useState<ScreeningIntakeStep>(null);
  const [screeningRoleTarget, setScreeningRoleTarget] = useState("");
  const [screeningCriteria, setScreeningCriteria] = useState("");
  const [screeningBatchProgress, setScreeningBatchProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
  } | null>(null);
  const [assistantPosition, setAssistantPosition] = useState<AssistantPosition | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [isDraggingAssistant, setIsDraggingAssistant] = useState(false);
  const draftSuggestion = useMemo(() => {
    const normalizedDraft = draft.trim().toLowerCase();

    if (!normalizedDraft || isSending || attachedScreeningFiles.length > 0) {
      return null;
    }

    return (
      quickPrompts.find(
        (prompt) =>
          prompt.toLowerCase().startsWith(normalizedDraft) &&
          prompt.length > draft.trim().length
      ) || null
    );
  }, [attachedScreeningFiles.length, draft, isSending, quickPrompts]);
  const draftSuggestionSuffix =
    draftSuggestion && draftSuggestion.toLowerCase().startsWith(draft.trim().toLowerCase())
      ? draftSuggestion.slice(draft.trim().length)
      : "";
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const assistantPointerIdRef = useRef<number | null>(null);
  const assistantDragOffsetRef = useRef({ x: 0, y: 0 });
  const assistantDidDragRef = useRef(false);

  useEffect(() => {
    setMessages([{ role: "assistant", content: welcomeMessage }]);
    setDraft("");
    setError(null);
    setIsSending(false);
    setIsScreeningAttachment(false);
    setIsOpen(initialOpen);
    setHasDismissedHint(initialOpen);
    setIsComposerFocused(false);
    setAttachedScreeningFiles([]);
    setScreeningIntakeStep(null);
    setScreeningRoleTarget("");
    setScreeningCriteria("");
    setScreeningBatchProgress(null);
  }, [initialOpen, welcomeMessage, workspaceScope]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncViewportSize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    syncViewportSize();
    window.addEventListener("resize", syncViewportSize);

    return () => window.removeEventListener("resize", syncViewportSize);
  }, []);

  useEffect(() => {
    if (!viewportSize.width || !viewportSize.height) {
      return;
    }

    setAssistantPosition((current) =>
      clampAssistantPosition(
        current ?? getDefaultAssistantPosition(viewportSize.width, viewportSize.height),
        viewportSize.width,
        viewportSize.height
      )
    );
  }, [viewportSize]);

  useEffect(() => {
    if (!isDraggingAssistant || !viewportSize.width || !viewportSize.height) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (
        assistantPointerIdRef.current !== null &&
        event.pointerId !== assistantPointerIdRef.current
      ) {
        return;
      }

      assistantDidDragRef.current = true;
      setAssistantPosition(
        clampAssistantPosition(
          {
            x: event.clientX - assistantDragOffsetRef.current.x,
            y: event.clientY - assistantDragOffsetRef.current.y,
          },
          viewportSize.width,
          viewportSize.height
        )
      );
    };

    const stopDraggingAssistant = (event?: PointerEvent) => {
      if (
        event &&
        assistantPointerIdRef.current !== null &&
        event.pointerId !== assistantPointerIdRef.current
      ) {
        return;
      }

      assistantPointerIdRef.current = null;
      setIsDraggingAssistant(false);
      window.setTimeout(() => {
        assistantDidDragRef.current = false;
      }, 0);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDraggingAssistant);
    window.addEventListener("pointercancel", stopDraggingAssistant);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDraggingAssistant);
      window.removeEventListener("pointercancel", stopDraggingAssistant);
    };
  }, [isDraggingAssistant, viewportSize]);

  useEffect(() => {
    const container = scrollContainerRef.current;

    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [isOpen, messages, isSending]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 120);

    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const handleAssistantPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || !assistantPosition) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      assistantPointerIdRef.current = event.pointerId;
      assistantDragOffsetRef.current = {
        x: event.clientX - assistantPosition.x,
        y: event.clientY - assistantPosition.y,
      };
      assistantDidDragRef.current = false;
      setIsDraggingAssistant(true);
    },
    [assistantPosition]
  );

  const panelPlacement = useMemo(() => {
    const horizontal =
      assistantPosition && viewportSize.width
        ? assistantPosition.x > viewportSize.width / 2
          ? "right"
          : "left"
        : "right";
    const vertical =
      assistantPosition && viewportSize.height
        ? assistantPosition.y > viewportSize.height / 2
          ? "above"
          : "below"
        : "above";

    return {
      horizontal,
      vertical,
      anchorClassName: `${vertical === "above" ? "bottom-[calc(100%+1rem)]" : "top-[calc(100%+1rem)]"} ${
        horizontal === "right" ? "right-0" : "left-0"
      }`,
      originClassName:
        vertical === "above"
          ? horizontal === "right"
            ? "origin-bottom-right"
            : "origin-bottom-left"
          : horizontal === "right"
            ? "origin-top-right"
            : "origin-top-left",
    };
  }, [assistantPosition, viewportSize]);

  async function handleSendMessage(rawQuestion?: string) {
    const content = (rawQuestion ?? draft).trim();

    if (!content || isSending) {
      return;
    }

    const nextMessages: WorkspaceAssistantMessage[] = [
      ...messages,
      { role: "user", content },
    ];

    setMessages(nextMessages);
    setDraft("");
    setError(null);
    setIsSending(true);
    setIsOpen(true);
    setHasDismissedHint(true);

    try {
      const response = await fetch("/api/workspace/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages,
          pathname,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            reply?: string;
          }
        | null;

      if (!response.ok || !payload?.reply) {
        throw new Error(payload?.error || "I couldn't answer that workspace question right now.");
      }

      setMessages((current) => [
        ...current,
        { role: "assistant", content: payload.reply as string },
      ]);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "I couldn't answer that workspace question right now."
      );
    } finally {
      setIsSending(false);
    }
  }

  async function handleScreenAttachment(roleTargetOverride?: string, criteriaOverride?: string) {
    if (attachedScreeningFiles.length === 0 || isSending) {
      return;
    }

    const screeningFiles = [...attachedScreeningFiles];
    const resolvedRoleTarget = (roleTargetOverride ?? screeningRoleTarget).trim();
    const resolvedCriteria = (criteriaOverride ?? screeningCriteria).trim();
    const roleBrief = buildAssistantScreeningGoal(resolvedRoleTarget, resolvedCriteria);
    setError(null);
    setIsSending(true);
    setIsScreeningAttachment(true);
    setScreeningBatchProgress({
      current: 0,
      total: screeningFiles.length,
      fileName: "",
    });
    setIsOpen(true);
    setHasDismissedHint(true);

    try {
      const completedScreenings: StoredAnalysisSession[] = [];
      const failedFiles: string[] = [];
      let localFallbackCount = 0;

      for (const [index, file] of screeningFiles.entries()) {
        setScreeningBatchProgress({
          current: index + 1,
          total: screeningFiles.length,
          fileName: file.name,
        });

        try {
          const formData = new FormData();
          formData.set("file", file);
          formData.set("documentType", "cv");
          formData.set("provider", "gemini");
          formData.set("providerFallbackMode", "local-only");
          formData.set(
            "roleSetup",
            JSON.stringify(buildAssistantRoleSetup(resolvedRoleTarget, resolvedCriteria))
          );

          if (roleBrief) {
            formData.set("analysisGoal", roleBrief);
          }

          const response = await fetch("/api/analyze", {
            method: "POST",
            body: formData,
          });
          const payload = (await response.json().catch(() => null)) as
            | { screening?: StoredAnalysisSession; error?: string }
            | null;

          if (!response.ok) {
            throw new Error(payload?.error || "I couldn't screen that attachment right now.");
          }

          if (!payload?.screening?.id) {
            throw new Error("The screening completed, but I couldn't open the saved result.");
          }

          if (payload.screening.response.meta.provider === "local") {
            localFallbackCount += 1;
          }

          completedScreenings.push(payload.screening);
        } catch (screeningError) {
          failedFiles.push(
            screeningError instanceof Error
              ? `${file.name}: ${screeningError.message}`
              : `${file.name}: I couldn't screen that attachment right now.`
          );
        }
      }

      if (completedScreenings.length === 0) {
        throw new Error(
          failedFiles.length > 1
            ? `I couldn't finish any of those CV screenings. First issue: ${failedFiles[0]}`
            : failedFiles[0] || "I couldn't screen that attachment right now."
        );
      }

      const screeningIds = completedScreenings.map((item) => item.id);
      const resultsHref = buildAssistantResultsHref({
        screeningId: completedScreenings[0].id,
        batchIds: screeningIds.length > 1 ? screeningIds : [],
        batchTotal: screeningFiles.length,
        batchFailed: failedFiles.length,
      });
      const completionSummary =
        completedScreenings.length === 1
          ? `Done screening ${completedScreenings[0].response.meta.fileName}.`
          : `Done screening ${completedScreenings.length} CVs: ${summarizeAssistantFileNames(
              completedScreenings.map((item) => item.response.meta.fileName)
            )}.`;
      const fallbackSummary =
        localFallbackCount > 0
          ? ` ${localFallbackCount} run${localFallbackCount === 1 ? "" : "s"} used the fallback screening engine.`
          : "";
      const failureSummary =
        failedFiles.length > 0
          ? ` ${failedFiles.length} file${failedFiles.length === 1 ? "" : "s"} did not finish in this batch.`
          : "";

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `${completionSummary}${fallbackSummary}${failureSummary} Opening [Results](${resultsHref}) now.`,
        },
      ]);
      setAttachedScreeningFiles([]);
      setScreeningIntakeStep(null);
      setScreeningRoleTarget("");
      setScreeningCriteria("");
      window.setTimeout(() => {
        router.push(resultsHref, { scroll: false });
      }, 950);
    } catch (screeningError) {
      setError(
        screeningError instanceof Error
          ? screeningError.message
          : "I couldn't screen that attachment right now."
      );
    } finally {
      setIsSending(false);
      setIsScreeningAttachment(false);
      setScreeningBatchProgress(null);
    }
  }

  function handleScreeningAttachmentSelected(nextFiles: File[]) {
    const mergedFiles = mergeAssistantScreeningFiles(attachedScreeningFiles, nextFiles).slice(
      0,
      maxAssistantBulkScreeningFiles
    );

    setAttachedScreeningFiles(mergedFiles);
    setScreeningIntakeStep("role");
    setScreeningRoleTarget("");
    setScreeningCriteria("");
    setDraft("");
    setError(null);
    setIsOpen(true);
    setHasDismissedHint(true);
    setMessages((current) => [
      ...current,
      {
        role: "assistant",
        content:
          mergedFiles.length === 1
            ? `I have ${mergedFiles[0].name}. What role are you screening this CV for? You can reply with the job title, team, or a short hiring goal.`
            : `I have ${mergedFiles.length} CVs ready: ${summarizeAssistantFileNames(
                mergedFiles.map((file) => file.name)
              )}. What role are you screening this batch for? You can reply with the job title, team, or a short hiring goal.`,
      },
    ]);
  }

  function clearScreeningAttachment() {
    setAttachedScreeningFiles([]);
    setScreeningIntakeStep(null);
    setScreeningRoleTarget("");
    setScreeningCriteria("");
    setScreeningBatchProgress(null);
    setDraft("");
  }

  async function handleScreeningIntakeSubmit() {
    if (attachedScreeningFiles.length === 0 || !screeningIntakeStep || isSending) {
      return;
    }

    const responseText = draft.trim();

    if (!responseText) {
      return;
    }

    setError(null);

    if (screeningIntakeStep === "role") {
      setMessages((current) => [
        ...current,
        { role: "user", content: responseText },
        {
          role: "assistant",
          content: `Got it. What should I prioritize while screening for ${responseText}? You can list must-have skills, seniority, location, or paste a short job brief. If you want a general review, type "skip".`,
        },
      ]);
      setScreeningRoleTarget(responseText);
      setScreeningIntakeStep("criteria");
      setDraft("");
      return;
    }

    const normalizedCriteria = normalizeAssistantScreeningCriteria(responseText);
    const currentRoleTarget = screeningRoleTarget.trim();
    const screeningSubject =
      attachedScreeningFiles.length === 1
        ? attachedScreeningFiles[0].name
        : `${attachedScreeningFiles.length} CVs`;
    const progressMessage = normalizedCriteria
      ? `Perfect. I'm screening ${screeningSubject} for ${currentRoleTarget} with your criteria in mind now.`
      : `Perfect. I'm screening ${screeningSubject} for ${currentRoleTarget} now.`;

    setMessages((current) => [
      ...current,
      { role: "user", content: responseText },
      { role: "assistant", content: progressMessage },
    ]);
    setScreeningCriteria(normalizedCriteria);
    setScreeningIntakeStep(null);
    setDraft("");
    await handleScreenAttachment(currentRoleTarget, normalizedCriteria);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (attachedScreeningFiles.length > 0 && screeningIntakeStep) {
      void handleScreeningIntakeSubmit();
      return;
    }

    if (attachedScreeningFiles.length > 0) {
      void handleScreenAttachment();
      return;
    }

    void handleSendMessage();
  }

  if (!assistantPosition) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed z-[70] h-16 w-16"
      style={{
        left: `${assistantPosition.x}px`,
        top: `${assistantPosition.y}px`,
      }}
    >
      {!isOpen && !hasDismissedHint ? (
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setHasDismissedHint(true);
          }}
          className={`pointer-events-auto absolute z-[65] max-w-[240px] rounded-2xl border border-white/10 bg-[#0d1738]/92 px-4 py-3 text-left text-sm text-white shadow-[0_18px_50px_rgba(4,9,24,0.42)] backdrop-blur-xl transition hover:translate-y-[-1px] ${panelPlacement.anchorClassName}`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/48">
            Workspace bot
          </p>
          <p className="mt-1.5 leading-6 text-white/84">
            Need a quick walkthrough, {firstName}?
          </p>
        </button>
      ) : null}

        <div
          className={`pointer-events-auto absolute w-[min(25rem,calc(100vw-2rem))] overflow-hidden rounded-[26px] border border-gray-200 bg-white/96 shadow-[0_28px_80px_rgba(15,23,42,0.24)] backdrop-blur-xl transition duration-300 dark:border-gray-800 dark:bg-gray-950/96 sm:rounded-[28px] ${
            isOpen
              ? "translate-y-0 scale-100 opacity-100"
              : "pointer-events-none translate-y-4 scale-95 opacity-0"
          } ${panelPlacement.anchorClassName} ${panelPlacement.originClassName}`}
        >
          <div className="flex h-[min(34rem,calc(100dvh-7.5rem))] flex-col sm:h-[min(38rem,calc(100dvh-8rem))]">
            <div
              className="relative shrink-0 overflow-hidden border-b border-white/10 px-4 py-4 text-white select-none sm:px-5 sm:py-5"
              style={{
                background: `linear-gradient(135deg, ${settings.dashboardAccent}, ${theme.accentHover})`,
              }}
              onPointerDown={handleAssistantPointerDown}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.24),transparent_36%)]" />
              <div className="relative flex items-start justify-between gap-4 cursor-grab active:cursor-grabbing">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/18 bg-white/12 text-white shadow-[0_12px_28px_rgba(4,9,24,0.2)] sm:h-11 sm:w-11">
                      <ChatIcon className="h-5 w-5 fill-current" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold tracking-[0.02em] text-white">
                        {firstName} workspace bot
                      </p>
                      <p className="mt-0.5 truncate text-xs text-white/72">
                        Guidance, walkthroughs, and product help
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/88">
                    You are on {currentPageLabel}. Ask what to do here or how to use the next step.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/16 bg-white/10 text-white/84 transition hover:bg-white/16 hover:text-white"
                  aria-label="Close workspace assistant"
                >
                  <CloseIcon className="h-4 w-4 fill-current" />
                </button>
              </div>
            </div>

            <div
              ref={scrollContainerRef}
              className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
            >
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[88%] rounded-[22px] px-4 py-3 text-sm leading-6 shadow-sm ${
                      message.role === "user"
                        ? "rounded-br-md text-white"
                        : "rounded-bl-md border border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200"
                    }`}
                    style={
                      message.role === "user"
                        ? {
                            background: `linear-gradient(135deg, ${settings.dashboardAccent}, ${theme.accentHover})`,
                          }
                        : undefined
                    }
                  >
                    <WorkspaceAssistantMessageBody
                      content={message.content}
                      role={message.role}
                    />
                  </div>
                </div>
              ))}

              {isSending ? (
                <div className="flex justify-start">
                  <div className="rounded-[22px] rounded-bl-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                    <span className="inline-flex items-center gap-2">
                      <ShootingStarIcon className="h-4 w-4 fill-current" />
                      {isScreeningAttachment
                        ? screeningBatchProgress
                          ? `Screening ${screeningBatchProgress.current} of ${screeningBatchProgress.total}: ${screeningBatchProgress.fileName}`
                          : "Screening the attached CVs and opening Results..."
                        : "Thinking through your workspace question..."}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="relative shrink-0 border-t border-gray-200 px-4 py-4 dark:border-gray-800">
              {error ? (
                <div className="mb-3 rounded-2xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-200">
                  {error}
                </div>
              ) : null}

              {attachedScreeningFiles.length > 0 ? (
                <div className="mb-3 flex items-start justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-900/70">
                  <div className="min-w-0 flex items-start gap-3">
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-gray-500 shadow-theme-xs dark:bg-white/5 dark:text-gray-300">
                      <FileIcon className="h-4 w-4 fill-current" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                        {attachedScreeningFiles.length === 1
                          ? attachedScreeningFiles[0].name
                          : `${attachedScreeningFiles.length} CVs attached`}
                      </p>
                      {attachedScreeningFiles.length > 1 ? (
                        <p className="mt-1 truncate text-xs leading-5 text-gray-500 dark:text-gray-400">
                          {summarizeAssistantFileNames(
                            attachedScreeningFiles.map((file) => file.name)
                          )}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                        {screeningIntakeStep === "role"
                          ? attachedScreeningFiles.length === 1
                            ? "Next: tell the bot what role or hiring goal this CV should be screened for."
                            : "Next: tell the bot what role or hiring goal this batch should be screened for."
                          : screeningIntakeStep === "criteria"
                            ? `Next: add must-have skills or priorities for ${screeningRoleTarget}, or type "skip" for a general review.`
                            : "The bot has the role context already. Send now to run the screening and open the saved result page."}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={clearScreeningAttachment}
                    disabled={isSending}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-white/5"
                    aria-label="Remove screening attachments"
                  >
                    <CloseLineIcon className="h-4 w-4 fill-current" />
                  </button>
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="flex items-center gap-3">
                <input
                  ref={attachmentInputRef}
                  type="file"
                  accept={screeningAttachmentAccept}
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    const nextFiles = Array.from(event.target.files ?? []);
                    event.currentTarget.value = "";

                    if (nextFiles.length === 0) {
                      return;
                    }

                    const oversizedFile = nextFiles.find((file) => file.size > maxUploadSizeBytes);
                    const validFiles = nextFiles.filter((file) => file.size <= maxUploadSizeBytes);

                    if (oversizedFile) {
                      setError(`"${oversizedFile.name}" is larger than 15 MB. Try a smaller export.`);
                    }

                    if (validFiles.length === 0) {
                      return;
                    }

                    if (
                      attachedScreeningFiles.length + validFiles.length >
                      maxAssistantBulkScreeningFiles
                    ) {
                      setError(
                        `You can attach up to ${maxAssistantBulkScreeningFiles} CVs for one screening batch.`
                      );
                    }

                    handleScreeningAttachmentSelected(validFiles);
                  }}
                />

                <button
                  type="button"
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={isSending}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-gray-200 bg-gray-50 text-gray-500 transition hover:border-brand-200 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-brand-500/30 dark:hover:text-brand-200"
                  aria-label="Attach CVs for assistant screening"
                  title="Attach CVs for assistant screening"
                >
                  <FileIcon className="h-4 w-4 fill-current" />
                </button>

                <label className="block min-w-0 flex-1">
                  <span className="sr-only">Ask the workspace bot a question</span>
                  <div className="relative">
                    {isComposerFocused && draftSuggestionSuffix ? (
                      <div className="pointer-events-none absolute inset-0 flex items-center overflow-hidden rounded-[18px] px-4 text-sm leading-5">
                        <span className="invisible shrink-0 whitespace-pre">{draft.trim()}</span>
                        <span className="truncate text-gray-400 dark:text-gray-500">
                          {draftSuggestionSuffix}
                        </span>
                      </div>
                    ) : null}

                    <input
                      ref={inputRef}
                      type="text"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onFocus={() => setIsComposerFocused(true)}
                      onBlur={() => setIsComposerFocused(false)}
                      onKeyDown={(event) => {
                        if ((event.key === "Tab" || event.key === "ArrowRight") && draftSuggestion) {
                          event.preventDefault();
                          setDraft(draftSuggestion);
                          return;
                        }

                        if (event.key === "Enter") {
                          event.preventDefault();
                          if (attachedScreeningFiles.length > 0 && screeningIntakeStep) {
                            void handleScreeningIntakeSubmit();
                            return;
                          }

                          if (attachedScreeningFiles.length > 0) {
                            void handleScreenAttachment();
                            return;
                          }

                          void handleSendMessage();
                        }
                      }}
                      placeholder={
                        screeningIntakeStep === "role"
                          ? attachedScreeningFiles.length > 1
                            ? "What role are you screening this batch for?"
                            : "What role are you screening this CV for?"
                          : screeningIntakeStep === "criteria"
                            ? `What should I prioritize for ${screeningRoleTarget}?`
                            : attachedScreeningFiles.length > 0
                              ? "Add anything else before I run the screening..."
                          : `Ask about ${currentPageLabel.toLowerCase()}...`
                      }
                      className="relative h-12 w-full rounded-[18px] border border-gray-200 bg-gray-50 px-4 text-sm leading-5 text-gray-800 outline-hidden transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-gray-500"
                    />
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={isSending || !draft.trim()}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white shadow-theme-sm transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    background: `linear-gradient(135deg, ${settings.dashboardAccent}, ${theme.accentHover})`,
                  }}
                  aria-label={
                    attachedScreeningFiles.length > 0 && screeningIntakeStep
                      ? "Continue screening intake"
                      : attachedScreeningFiles.length > 0
                      ? "Run assistant screening with these attachments"
                      : "Send message to workspace assistant"
                  }
                  title={
                    attachedScreeningFiles.length > 0 && screeningIntakeStep
                      ? "Continue screening intake"
                      : attachedScreeningFiles.length > 0
                        ? "Run assistant screening"
                        : "Send message"
                  }
                >
                  <PaperPlaneIcon className="h-[15px] w-[15px] translate-x-[1px] fill-current" />
                </button>
              </form>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (assistantDidDragRef.current) {
              return;
            }

            setIsOpen((current) => !current);
            setHasDismissedHint(true);
          }}
          onPointerDown={handleAssistantPointerDown}
          className="pointer-events-auto group absolute inset-0 grid h-16 w-16 place-items-center rounded-[24px] border border-white/14 text-white shadow-[0_22px_55px_rgba(15,23,42,0.3)] transition hover:translate-y-[-1px] touch-none"
          style={{
            background: `linear-gradient(145deg, ${settings.dashboardAccent}, ${theme.accentHover})`,
          }}
          aria-label={isOpen ? "Close workspace assistant" : "Open workspace assistant"}
          aria-expanded={isOpen}
          >
            <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.18)]" />
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/12 backdrop-blur-sm transition group-hover:bg-white/16">
              <ChatIcon className="h-6 w-6 fill-current" />
            </span>
        </button>
    </div>
  );
}

function buildAssistantScreeningGoal(roleTarget: string, criteria: string) {
  const normalizedRoleTarget = roleTarget.trim();
  const normalizedCriteria = criteria.trim();

  if (!normalizedRoleTarget && !normalizedCriteria) {
    return "";
  }

  const sections = [`Screen this CV for the role or hiring goal: ${normalizedRoleTarget}.`];

  if (normalizedCriteria) {
    sections.push(`Prioritize these criteria:\n${normalizedCriteria}`);
  }

  return sections.join("\n\n").trim();
}

function buildAssistantResultsHref({
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

function mergeAssistantScreeningFiles(currentFiles: File[], nextFiles: File[]) {
  const merged = [...currentFiles];
  const seenKeys = new Set(currentFiles.map((file) => buildAssistantScreeningFileKey(file)));

  nextFiles.forEach((file) => {
    const key = buildAssistantScreeningFileKey(file);

    if (seenKeys.has(key)) {
      return;
    }

    seenKeys.add(key);
    merged.push(file);
  });

  return merged;
}

function buildAssistantScreeningFileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function summarizeAssistantFileNames(fileNames: string[]) {
  if (fileNames.length === 0) {
    return "";
  }

  if (fileNames.length === 1) {
    return fileNames[0];
  }

  if (fileNames.length === 2) {
    return `${fileNames[0]} and ${fileNames[1]}`;
  }

  return `${fileNames[0]}, ${fileNames[1]}, and ${fileNames.length - 2} more`;
}

function buildAssistantRoleSetup(roleTarget: string, criteria: string) {
  const normalizedRoleTarget = roleTarget.trim();
  const normalizedCriteria = criteria.trim();

  return {
    title: normalizedRoleTarget,
    seniority: "",
    location: "",
    summary: normalizedCriteria || `Screen this candidate for ${normalizedRoleTarget}.`,
    mustHaveSkills: splitAssistantScreeningCriteria(normalizedCriteria),
    niceToHaveSkills: [],
    interviewFocus: [],
  };
}

function normalizeAssistantScreeningCriteria(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return "";
  }

  if (["skip", "general", "general review", "none", "no"].includes(normalized.toLowerCase())) {
    return "";
  }

  return normalized;
}

function splitAssistantScreeningCriteria(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function WorkspaceAssistantMessageBody({
  content,
  role,
}: {
  content: string;
  role: WorkspaceAssistantMessage["role"];
}) {
  const lines = content.split("\n");
  const linkClassName =
    role === "user"
      ? "font-semibold text-white underline underline-offset-4"
      : "font-semibold text-brand-700 underline underline-offset-4 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200";
  const metaClassName = role === "user" ? "text-white/88" : "text-gray-500 dark:text-gray-400";

  return (
    <div className="space-y-2 break-words">
      {lines.map((line, index) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={`space-${index}`} className="h-1.5" />;
        }

        const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);

        if (orderedMatch) {
          return (
            <div key={`ordered-${index}`} className="flex gap-2">
              <span className={`shrink-0 font-semibold ${metaClassName}`}>{orderedMatch[1]}.</span>
              <span className="min-w-0">
                {renderWorkspaceAssistantInlineContent(orderedMatch[2], linkClassName)}
              </span>
            </div>
          );
        }

        const bulletMatch = trimmed.match(/^-\s+(.*)$/);

        if (bulletMatch) {
          return (
            <div key={`bullet-${index}`} className="flex gap-2">
              <span className={`shrink-0 ${metaClassName}`}>&bull;</span>
              <span className="min-w-0">
                {renderWorkspaceAssistantInlineContent(bulletMatch[1], linkClassName)}
              </span>
            </div>
          );
        }

        return (
          <p key={`paragraph-${index}`} className="leading-6">
            {renderWorkspaceAssistantInlineContent(trimmed, linkClassName)}
          </p>
        );
      })}
    </div>
  );
}

function renderWorkspaceAssistantInlineContent(text: string, linkClassName: string) {
  const parts: ReactNode[] = [];
  const linkPattern = /\[([^\]]+)\]\((\/[^)\s]*|https?:\/\/[^)\s]+)\)/g;
  let lastIndex = 0;
  let match = linkPattern.exec(text);

  while (match) {
    const [fullMatch, label, href] = match;
    const matchIndex = match.index;

    if (matchIndex > lastIndex) {
      parts.push(text.slice(lastIndex, matchIndex));
    }

    parts.push(
      href.startsWith("/") ? (
        <Link key={`${href}-${matchIndex}`} href={href} className={linkClassName}>
          {label}
        </Link>
      ) : (
        <a
          key={`${href}-${matchIndex}`}
          href={href}
          target="_blank"
          rel="noreferrer"
          className={linkClassName}
        >
          {label}
        </a>
      )
    );

    lastIndex = matchIndex + fullMatch.length;
    match = linkPattern.exec(text);
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}
