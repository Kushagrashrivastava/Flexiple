"use client";

import { Card, cx } from "./ui";

/**
 * A real progress report, not a timed animation. Each step lights up when the
 * server actually emits it, and the detail line carries the live counts.
 */

const SEARCH_STEPS = [
  { key: "planning", label: "Reading the brief" },
  { key: "planned", label: "Drafting filters and rubric" },
  { key: "filtering", label: "Filtering the talent map" },
  { key: "scoring", label: "Scoring against the rubric" },
];

const REFINE_STEPS = [
  { key: "refining", label: "Weighing your feedback" },
  { key: "planned", label: "Adjusting filters and rubric" },
  { key: "filtering", label: "Re-running the search" },
  { key: "scoring", label: "Re-scoring against the rubric" },
];

export function ThinkingPanel({
  mode,
  stage,
  detail,
}: {
  mode: "search" | "refine";
  stage: string | null;
  detail?: string;
}) {
  const steps = mode === "search" ? SEARCH_STEPS : REFINE_STEPS;
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.key === stage),
  );

  return (
    <Card className="animate-rise p-5">
      <ol className="space-y-3">
        {steps.map((step, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;
          return (
            <li key={step.key} className="flex items-center gap-3">
              <span
                className={cx(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                  done && "border-strong bg-strong text-white",
                  active && "border-accent bg-accent-soft text-accent animate-pulse-soft",
                  !done && !active && "border-line-strong text-ink-faint",
                )}
              >
                {done ? "✓" : index + 1}
              </span>
              <span
                className={cx(
                  "text-[13.5px]",
                  done && "text-ink-faint",
                  active && "font-medium text-ink",
                  !done && !active && "text-ink-faint",
                )}
              >
                {step.label}
              </span>
              {active && detail && (
                <span className="ml-auto text-[12px] tabular-nums text-ink-faint">
                  {detail}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export function ProfileSkeletons({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} className="p-4">
          <div className="flex gap-4">
            <div className="skeleton h-10 w-12 rounded-md" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-3.5 w-40 rounded" />
              <div className="skeleton h-3 w-64 rounded" />
              <div className="skeleton h-3 w-full rounded" />
              <div className="skeleton h-3 w-5/6 rounded" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
