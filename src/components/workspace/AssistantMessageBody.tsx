"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type AssistantMessageRole = "user" | "assistant";

export function AssistantMessageBody({
  content,
  role,
}: {
  content: string;
  role: AssistantMessageRole;
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
                {renderAssistantInlineContent(orderedMatch[2], linkClassName)}
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
                {renderAssistantInlineContent(bulletMatch[1], linkClassName)}
              </span>
            </div>
          );
        }

        return (
          <p key={`paragraph-${index}`} className="leading-6">
            {renderAssistantInlineContent(trimmed, linkClassName)}
          </p>
        );
      })}
    </div>
  );
}

function renderAssistantInlineContent(text: string, linkClassName: string) {
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
