"use client";

import type { FilterDiagnostic } from "@/lib/filters";
import type { LlmErrorPayload } from "@/lib/llm/errors";
import { Button, Card, SectionLabel } from "./ui";

/**
 * The states that are not "here are your results". They get the same design
 * attention as the happy path, because this is where a recruiter decides
 * whether the tool is trustworthy.
 */

export function ErrorState({
  error,
  onRetry,
  retrying,
}: {
  error: LlmErrorPayload;
  onRetry: () => void;
  retrying?: boolean;
}) {
  const isSetup = error.code === "missing_key";

  return (
    <Card className="animate-rise border-danger/30 p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger-soft text-[13px] text-danger">
          !
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-ink">{error.title}</h3>
          <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft">{error.hint}</p>

          {error.retryAfter && (
            <p className="mt-1 text-[13px] text-ink-faint">
              The provider asked us to wait about {error.retryAfter}s.
            </p>
          )}

          {error.detail && (
            <details className="mt-2.5">
              <summary className="cursor-pointer text-[12.5px] text-ink-faint hover:text-ink-soft">
                Technical detail
              </summary>
              <pre className="mt-1.5 overflow-x-auto rounded-lg bg-sunken p-2.5 font-mono text-[11.5px] leading-relaxed text-ink-soft">
                {error.code}: {error.detail}
              </pre>
            </details>
          )}

          {!isSetup && (
            <div className="mt-3.5">
              <Button variant="primary" size="sm" onClick={onRetry} disabled={retrying}>
                {retrying ? "Retrying…" : "Try again"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export function NoMatchesState({
  diagnostics,
  tightest,
  total,
  onRelax,
  disabled,
}: {
  diagnostics: FilterDiagnostic[];
  tightest: FilterDiagnostic | null;
  total: number;
  onRelax: (label: string) => void;
  disabled?: boolean;
}) {
  return (
    <Card className="animate-rise p-5">
      <SectionLabel>No matches</SectionLabel>
      <h3 className="mt-2 font-display text-[22px] leading-tight text-ink">
        Nobody in the pool clears every filter.
      </h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
        The filters are hard cuts, so this is a real answer rather than a failure.
        Here is how each one performs on its own against all {total} profiles.
      </p>

      <ul className="mt-4 space-y-2">
        {diagnostics.map((diagnostic) => (
          <li
            key={diagnostic.key}
            className="flex items-center gap-3 rounded-lg border border-line px-3 py-2"
          >
            <span className="flex-1 text-[13px] text-ink">{diagnostic.label}</span>
            <span className="font-mono text-[12px] tabular-nums text-ink-faint">
              {diagnostic.passedAlone}/{total} pass
            </span>
            <Button
              size="sm"
              variant={diagnostic.key === tightest?.key ? "primary" : "secondary"}
              disabled={disabled}
              onClick={() => onRelax(diagnostic.label)}
            >
              Relax this
            </Button>
          </li>
        ))}
      </ul>

      {tightest && (
        <p className="mt-3 text-[12.5px] text-ink-faint">
          {tightest.label} is doing the most damage — relaxing it first is usually
          the fastest way back to a shortlist.
        </p>
      )}
    </Card>
  );
}

export function SetupState({ model }: { model: string }) {
  return (
    <Card className="mx-auto max-w-xl p-6">
      <SectionLabel>Setup needed</SectionLabel>
      <h2 className="mt-2 font-display text-[26px] leading-tight text-ink">
        Add your Groq API key to get started.
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
        This app makes real server-side model calls — there is nothing canned to
        fall back on. Create <code className="font-mono text-[13px]">.env.local</code> in
        the project root:
      </p>
      <pre className="mt-3 overflow-x-auto rounded-lg bg-sunken p-3 font-mono text-[12.5px] text-ink-soft">
        GROQ_API_KEY=your_key_here
      </pre>
      <p className="mt-3 text-[13.5px] text-ink-soft">
        Get a free key at{" "}
        <a
          className="text-accent underline underline-offset-2"
          href="https://console.groq.com/keys"
          target="_blank"
          rel="noreferrer"
        >
          console.groq.com/keys
        </a>
        , then restart the dev server. Current model:{" "}
        <span className="font-mono text-[12.5px]">{model}</span>.
      </p>
    </Card>
  );
}
