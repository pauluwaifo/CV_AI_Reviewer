"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function OwnerSignInForm({
  nextPath = "/owner",
}: {
  nextPath?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/owner/auth/signin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          accessKey,
          next: nextPath,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { nextPath?: string; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "I couldn't sign you into owner mode.");
      }

      router.replace(payload?.nextPath || "/owner");
      router.refresh();
    } catch (signinError) {
      setError(
        signinError instanceof Error
          ? signinError.message
          : "I couldn't sign you into owner mode."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#061229] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-blue-500/25 blur-[130px]" />
        <div className="absolute bottom-0 right-0 h-[360px] w-[360px] rounded-full bg-cyan-400/10 blur-[110px]" />
      </div>

      <section className="relative mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-7">
          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-blue-100 backdrop-blur"
          >
            Hiring Workspace OS
          </Link>
          <div className="max-w-2xl space-y-5">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-blue-200/80">
              Platform owner access
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-6xl">
              Your private command center for every company workspace.
            </h1>
            <p className="max-w-xl text-base leading-8 text-slate-300">
              Review workspace growth, see tenant activity, and keep platform-level visibility
              separate from each company&apos;s recruiting dashboard.
            </p>
          </div>
          <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
            {["Separate owner cookie", "Read-only by default", "Tenant-safe overview"].map(
              (item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-medium text-blue-100"
                >
                  {item}
                </div>
              )
            )}
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-[32px] border border-white/12 bg-white/[0.07] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.35)] backdrop-blur-2xl sm:p-8"
        >
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-200">
              Owner sign in
            </p>
            <h2 className="text-2xl font-semibold text-white">Open owner dashboard</h2>
            <p className="text-sm leading-6 text-slate-300">
              This is not a company login. Use your private owner credentials from Render
              environment variables.
            </p>
          </div>

          {error ? (
            <div className="mt-6 rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-blue-100">Owner email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="owner@yourcompany.com"
                className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none ring-blue-400/30 transition placeholder:text-slate-500 focus:border-blue-300 focus:ring-4"
                required
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-blue-100">Owner access key</span>
              <input
                type="password"
                value={accessKey}
                onChange={(event) => setAccessKey(event.target.value)}
                placeholder="Enter your owner access key"
                className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none ring-blue-400/30 transition placeholder:text-slate-500 focus:border-blue-300 focus:ring-4"
                required
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 h-12 w-full rounded-2xl bg-blue-500 px-5 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(37,99,235,0.32)] transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Opening owner dashboard..." : "Enter owner dashboard"}
          </button>

          <p className="mt-5 text-center text-xs leading-5 text-slate-400">
            Companies should use{" "}
            <Link href="/signin" className="font-semibold text-blue-200 hover:text-white">
              workspace sign in
            </Link>
            . Owner mode is only for the platform administrator.
          </p>
        </form>
      </section>
    </main>
  );
}
