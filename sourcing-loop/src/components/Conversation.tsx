"use client";

import { useEffect, useRef } from "react";
import type { PlanChange } from "@/lib/diff";
import { Button, Chip, SectionLabel, cx } from "./ui";

export type ThreadItem =
  | { id: string; role: "recruiter"; text: string; reactionSummary?: string }
  | {
      id: string;
      role: "app";
      text: string;
      changes?: PlanChange[];
      rationale?: { change: string; reason: string }[];
      resultLine?: string;
    }
  | { id: string; role: "note"; text: string };

const QUICK_FEEDBACK = [
  "Too junior overall",
  "Widen the location",
  "More depth in the core skill",
  "Less infrastructure, more product",
];

function ChangeList({ changes }: { changes: PlanChange[] }) {
  if (changes.length === 0) {
    return (
      <p className="mt-2 text-[12.5px] text-ink-faint">
        Nothing in the plan needed to change.
      </p>
    );
  }

  return (
    <ul className="mt-2.5 space-y-1.5">
      {changes.map((change, index) => (
        <li key={index} className="rounded-lg bg-sunken px-2.5 py-1.5 text-[12.5px]">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-ink">{change.label}</span>
            <Chip
              tone={
                change.direction === "widened"
                  ? "strong"
                  : change.direction === "narrowed"
                    ? "possible"
                    : "neutral"
              }
            >
              {change.direction}
            </Chip>
          </div>
          <div className="mt-0.5 text-ink-soft">
            <span className="text-ink-faint line-through">{change.before}</span>
            <span className="mx-1.5 text-ink-faint">→</span>
            <span>{change.after}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Conversation({
  thread,
  feedback,
  onFeedbackChange,
  onSubmit,
  busy,
  /** True only while a refinement turn is running, not the first search. */
  refining,
  pendingReactions,
  onClearReactions,
  disabled,
}: {
  thread: ThreadItem[];
  feedback: string;
  onFeedbackChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  refining: boolean;
  pendingReactions: { yes: number; no: number };
  onClearReactions: () => void;
  disabled?: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread.length, busy]);

  const totalReactions = pendingReactions.yes + pendingReactions.no;
  const canSubmit = !busy && !disabled && (feedback.trim().length > 0 || totalReactions > 0);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-3">
        <SectionLabel>Refinement</SectionLabel>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-faint">
          React to profiles, or just say what is wrong. The plan updates, and the
          search re-runs.
        </p>
      </div>

      <div className="scroll-rail flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {thread.map((item) => {
          if (item.role === "recruiter") {
            return (
              <div key={item.id} className="animate-rise flex justify-end">
                <div className="max-w-[92%] rounded-xl rounded-br-sm bg-ink px-3 py-2 text-[13px] leading-relaxed text-canvas">
                  {item.text}
                  {item.reactionSummary && (
                    <div className="mt-1 text-[11.5px] text-canvas/60">
                      {item.reactionSummary}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          if (item.role === "note") {
            return (
              <div
                key={item.id}
                className="animate-rise rounded-lg border border-dashed border-line-strong px-2.5 py-1.5 text-[12px] leading-relaxed text-ink-faint"
              >
                {item.text}
              </div>
            );
          }

          return (
            <div key={item.id} className="animate-rise">
              <div className="rounded-xl rounded-bl-sm border border-line bg-surface px-3 py-2.5">
                <p className="text-[13px] leading-relaxed text-ink">{item.text}</p>
                {item.changes && <ChangeList changes={item.changes} />}
                {item.rationale && item.rationale.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-line pt-2">
                    {item.rationale.map((entry, index) => (
                      <li key={index} className="text-[12.5px] leading-relaxed text-ink-soft">
                        <span className="font-medium text-ink">{entry.change}</span>
                        <span className="text-ink-faint"> — {entry.reason}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {item.resultLine && (
                  <p className="mt-2 text-[12px] tabular-nums text-ink-faint">
                    {item.resultLine}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {busy && (
          <div className="flex items-center gap-2 px-1 text-[12.5px] text-ink-faint">
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" />
            {refining ? "Reworking the search…" : "Searching…"}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-line bg-sunken/40 p-3">
        {totalReactions > 0 && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-accent-line bg-accent-soft px-2.5 py-1.5 text-[12.5px] text-accent">
            <span className="flex-1">
              {pendingReactions.yes} approved · {pendingReactions.no} rejected, ready to
              send
            </span>
            <button
              type="button"
              onClick={onClearReactions}
              className="text-[12px] underline underline-offset-2 hover:opacity-80"
            >
              Clear
            </button>
          </div>
        )}

        <div className="mb-2 flex flex-wrap gap-1.5">
          {QUICK_FEEDBACK.map((phrase) => (
            <button
              key={phrase}
              type="button"
              disabled={busy || disabled}
              onClick={() => onFeedbackChange(feedback ? `${feedback} ${phrase}.` : `${phrase}.`)}
              className={cx(
                "rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink-soft transition-colors",
                "hover:border-ink-faint hover:text-ink disabled:opacity-50",
              )}
            >
              {phrase}
            </button>
          ))}
        </div>

        <textarea
          value={feedback}
          disabled={busy || disabled}
          onChange={(event) => onFeedbackChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && canSubmit) {
              event.preventDefault();
              onSubmit();
            }
          }}
          rows={3}
          placeholder="e.g. 1 is too junior, 2 and 4 are right — I want more payments depth."
          className={cx(
            "w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-[13px] leading-relaxed",
            "placeholder:text-ink-faint focus:border-accent focus:outline-none disabled:opacity-60",
          )}
        />

        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11.5px] text-ink-faint">⌘↵ to send</span>
          <Button variant="primary" size="sm" onClick={onSubmit} disabled={!canSubmit}>
            {refining ? "Refining…" : "Refine search"}
          </Button>
        </div>
      </div>
    </div>
  );
}
