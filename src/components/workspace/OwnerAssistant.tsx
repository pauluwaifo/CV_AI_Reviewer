"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { usePathname } from "next/navigation";

import { AssistantMessageBody } from "@/components/workspace/AssistantMessageBody";
import {
  buildOwnerAssistantWelcomeMessage,
  getOwnerAssistantFirstName,
  getOwnerAssistantPageLabel,
  getOwnerAssistantQuickPrompts,
  type OwnerAssistantMessage,
} from "@/lib/owner-assistant";
import { ChatIcon, CloseIcon, PaperPlaneIcon, ShootingStarIcon } from "@/icons";

type OwnerAssistantProps = {
  session: {
    email: string;
  };
  initialOpen?: boolean;
};

type AssistantPosition = { x: number; y: number };

const bubbleSizePx = 64;
const edgePaddingPx = 16;

function getDefaultAssistantPosition(width: number, height: number): AssistantPosition {
  return {
    x: Math.max(edgePaddingPx, width - bubbleSizePx - 24),
    y: Math.max(edgePaddingPx, height - bubbleSizePx - 24),
  };
}

function clampAssistantPosition(
  position: AssistantPosition,
  width: number,
  height: number
): AssistantPosition {
  return {
    x: Math.min(
      Math.max(edgePaddingPx, position.x),
      Math.max(edgePaddingPx, width - bubbleSizePx - edgePaddingPx)
    ),
    y: Math.min(
      Math.max(edgePaddingPx, position.y),
      Math.max(edgePaddingPx, height - bubbleSizePx - edgePaddingPx)
    ),
  };
}

export default function OwnerAssistant({
  session,
  initialOpen = false,
}: OwnerAssistantProps) {
  const pathname = usePathname();
  const firstName = getOwnerAssistantFirstName(session.email);
  const currentPageLabel = getOwnerAssistantPageLabel(pathname);
  const welcomeMessage = useMemo(
    () =>
      buildOwnerAssistantWelcomeMessage({
        email: session.email,
        pathname,
      }),
    [pathname, session.email]
  );
  const quickPrompts = useMemo(
    () =>
      getOwnerAssistantQuickPrompts({
        email: session.email,
        pathname,
      }),
    [pathname, session.email]
  );

  const [isOpen, setIsOpen] = useState(initialOpen);
  const [hasDismissedHint, setHasDismissedHint] = useState(initialOpen);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<OwnerAssistantMessage[]>([
    { role: "assistant", content: welcomeMessage },
  ]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [assistantPosition, setAssistantPosition] = useState<AssistantPosition | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [isDraggingAssistant, setIsDraggingAssistant] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const assistantPointerIdRef = useRef<number | null>(null);
  const assistantDragOffsetRef = useRef({ x: 0, y: 0 });
  const assistantDidDragRef = useRef(false);

  const draftSuggestion = useMemo(() => {
    const normalizedDraft = draft.trim().toLowerCase();

    if (!normalizedDraft || isSending) {
      return null;
    }

    return (
      quickPrompts.find(
        (prompt) =>
          prompt.toLowerCase().startsWith(normalizedDraft) &&
          prompt.length > draft.trim().length
      ) || null
    );
  }, [draft, isSending, quickPrompts]);

  const draftSuggestionSuffix =
    draftSuggestion && draftSuggestion.toLowerCase().startsWith(draft.trim().toLowerCase())
      ? draftSuggestion.slice(draft.trim().length)
      : "";

  useEffect(() => {
    setMessages([{ role: "assistant", content: welcomeMessage }]);
    setDraft("");
    setError(null);
    setIsSending(false);
    setIsOpen(initialOpen);
    setHasDismissedHint(initialOpen);
    setIsComposerFocused(false);
  }, [initialOpen, welcomeMessage, session.email]);

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

    const nextMessages: OwnerAssistantMessage[] = [
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
      const response = await fetch("/api/owner/assistant", {
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
        throw new Error(payload?.error || "I couldn't answer that owner question right now.");
      }

      setMessages((current) => [
        ...current,
        { role: "assistant", content: payload.reply as string },
      ]);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "I couldn't answer that owner question right now."
      );
    } finally {
      setIsSending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
            Owner bot
          </p>
          <p className="mt-1.5 leading-6 text-white/84">
            Need owner help, {firstName}?
          </p>
        </button>
      ) : null}

      <div
        className={`pointer-events-auto absolute w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-[26px] border border-gray-200 bg-white/96 shadow-[0_28px_80px_rgba(15,23,42,0.24)] backdrop-blur-xl transition duration-300 dark:border-gray-800 dark:bg-gray-950/96 sm:rounded-[28px] ${
          isOpen
            ? "translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-4 scale-95 opacity-0"
        } ${panelPlacement.anchorClassName} ${panelPlacement.originClassName}`}
      >
        <div className="flex h-[min(33rem,calc(100dvh-7.5rem))] flex-col sm:h-[min(36rem,calc(100dvh-8rem))]">
          <div
            className="relative shrink-0 overflow-hidden border-b border-white/10 bg-[linear-gradient(135deg,#365cff,#1f3fb5)] px-4 py-4 text-white select-none sm:px-5 sm:py-5"
            onPointerDown={handleAssistantPointerDown}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_36%)]" />
            <div className="relative flex items-start justify-between gap-4 cursor-grab active:cursor-grabbing">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/18 bg-white/12 text-white shadow-[0_12px_28px_rgba(4,9,24,0.2)] sm:h-11 sm:w-11">
                    <ChatIcon className="h-5 w-5 fill-current" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold tracking-[0.02em] text-white">
                      Owner bot
                    </p>
                    <p className="mt-0.5 truncate text-xs text-white/72">
                      Billing, rollout, and workspace help
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-white/88">
                  You are on {currentPageLabel}. Ask what to do here or what to release next.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                onPointerDown={(event) => event.stopPropagation()}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/16 bg-white/10 text-white/84 transition hover:bg-white/16 hover:text-white"
                aria-label="Close owner assistant"
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
                      ? "rounded-br-md bg-[linear-gradient(135deg,#365cff,#1f3fb5)] text-white"
                      : "rounded-bl-md border border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200"
                  }`}
                >
                  <AssistantMessageBody content={message.content} role={message.role} />
                </div>
              </div>
            ))}

            {isSending ? (
              <div className="flex justify-start">
                <div className="rounded-[22px] rounded-bl-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                  <span className="inline-flex items-center gap-2">
                    <ShootingStarIcon className="h-4 w-4 fill-current" />
                    Thinking through your owner question...
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

            <form onSubmit={handleSubmit} className="flex items-center gap-3">
              <label className="block min-w-0 flex-1">
                <span className="sr-only">Ask the owner bot a question</span>
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
                        void handleSendMessage();
                      }
                    }}
                    placeholder={`Ask about ${currentPageLabel.toLowerCase()}...`}
                    className="relative h-11 w-full rounded-[18px] border border-gray-200 bg-gray-50 px-4 text-sm leading-5 text-gray-800 outline-hidden transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-gray-500"
                  />
                </div>
              </label>

              <button
                type="submit"
                disabled={isSending || !draft.trim()}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#365cff,#1f3fb5)] text-white shadow-theme-sm transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Send message to owner assistant"
                title="Send message"
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
        className="pointer-events-auto group absolute inset-0 grid h-16 w-16 place-items-center rounded-[24px] border border-white/14 bg-[linear-gradient(145deg,#365cff,#1f3fb5)] text-white shadow-[0_22px_55px_rgba(15,23,42,0.3)] transition hover:translate-y-[-1px] touch-none"
        aria-label={isOpen ? "Close owner assistant" : "Open owner assistant"}
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
