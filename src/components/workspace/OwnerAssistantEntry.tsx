"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { ChatIcon } from "@/icons";

const OwnerAssistant = dynamic(() => import("@/components/workspace/OwnerAssistant"), {
  ssr: false,
  loading: () => null,
});

type OwnerAssistantEntryProps = {
  session: {
    email: string;
  };
};

export default function OwnerAssistantEntry({ session }: OwnerAssistantEntryProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [shouldOpenOnMount, setShouldOpenOnMount] = useState(false);

  useEffect(() => {
    if (isMounted) {
      return;
    }

    const activate = () => setIsMounted(true);

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const idleCallbackId = window.requestIdleCallback(activate, { timeout: 1800 });

      return () => window.cancelIdleCallback(idleCallbackId);
    }

    const timer = globalThis.setTimeout(activate, 900);
    return () => globalThis.clearTimeout(timer);
  }, [isMounted]);

  if (isMounted) {
    return <OwnerAssistant initialOpen={shouldOpenOnMount} session={session} />;
  }

  return (
    <button
      type="button"
      onClick={() => {
        setShouldOpenOnMount(true);
        setIsMounted(true);
      }}
      className="fixed bottom-6 right-6 z-[70] grid h-16 w-16 place-items-center rounded-[24px] border border-white/14 bg-[linear-gradient(145deg,#365cff,#1f3fb5)] text-white shadow-[0_22px_55px_rgba(15,23,42,0.3)] transition hover:translate-y-[-1px]"
      aria-label="Open owner assistant"
    >
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/12 backdrop-blur-sm">
        <ChatIcon className="h-6 w-6 fill-current" />
      </span>
    </button>
  );
}
