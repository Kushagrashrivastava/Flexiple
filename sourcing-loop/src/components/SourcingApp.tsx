"use client";

import { useCallback, useMemo, useState } from "react";
import { streamPost, type RefineOutcome } from "@/lib/client-api";
import type { LlmErrorPayload } from "@/lib/llm/errors";
import type { SearchOutcome } from "@/lib/pipeline";
import { Conversation, type ThreadItem } from "./Conversation";
import { FrozenView } from "./FrozenView";
import { HeroSearch } from "./HeroSearch";
import { FiltersCard, RubricCard } from "./PlanRail";
import { ProfileCard } from "./ProfileCard";
import { ErrorState, NoMatchesState, SetupState } from "./States";
import { ProfileSkeletons, ThinkingPanel } from "./ThinkingPanel";
import { Button, Card, SectionLabel, cx } from "./ui";

const PAGE_SIZE = 5;

type Phase = "idle" | "working" | "results" | "frozen";
type Reactions = Record<string, "yes" | "no">;

/**
 * What "Try again" repeats. Recording the inputs rather than a closure keeps
 * the retry honest — it re-runs the action as it was, against current state.
 */
type LastAction =
  | { kind: "search"; query: string }
  | { kind: "refine"; feedback: string; reactions: Reactions };

/**
 * Thread keys must stay unique across a module re-evaluation (Fast Refresh
 * resets module scope, and a plain counter then collides with items already
 * on screen).
 */
const nextId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function SourcingApp({
  hasApiKey,
  model,
  poolSize,
  faultsEnabled,
}: {
  hasApiKey: boolean;
  model: string;
  poolSize: number;
  faultsEnabled: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<"search" | "refine">("search");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState<Reactions>({});
  const [applied, setApplied] = useState<Reactions>({});
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [stage, setStage] = useState<{ stage: string; detail?: string } | null>(null);
  const [error, setError] = useState<LlmErrorPayload | null>(null);
  const [lastChanges, setLastChanges] = useState<string[]>([]);
  const [rounds, setRounds] = useState(0);
  const [frozenAt, setFrozenAt] = useState<Date | null>(null);
  const [fault, setFault] = useState<string>("");

  const [lastAction, setLastAction] = useState<LastAction | null>(null);

  const busy = phase === "working";

  const push = useCallback((item: ThreadItem) => {
    setThread((current) => [...current, item]);
  }, []);

  const resultLine = (result: SearchOutcome) =>
    `${result.pool.afterFilters} of ${result.pool.total} profiles passed the filters · ${result.pool.scored} scored`;

  const noteWarnings = useCallback(
    (result: SearchOutcome) => {
      for (const warning of result.warnings) {
        push({ id: nextId(), role: "note", text: warning.message });
      }
    },
    [push],
  );

  /* ---------------------------------------------------------------- search */

  const runSearch = useCallback(
    (searchQuery: string) => {
      const trimmed = searchQuery.trim();
      if (trimmed.length < 3) return;

      setPhase("working");
      setMode("search");
      setError(null);
      setStage({ stage: "planning" });
      setQuery(trimmed);
      setOutcome(null);
      setPending({});
      setApplied({});
      setLastChanges([]);
      setRounds(0);
      setVisible(PAGE_SIZE);
      setThread([{ id: nextId(), role: "recruiter", text: trimmed }]);

      setLastAction({ kind: "search", query: trimmed });

      void streamPost<SearchOutcome>(
        "/api/search",
        { query: trimmed },
        {
          onStage: (stageKey, detail) => setStage({ stage: stageKey, detail }),
          onResult: (result) => {
            setOutcome(result);
            setPhase("results");
            setStage(null);
            push({
              id: nextId(),
              role: "app",
              text: result.interpretation,
              resultLine: resultLine(result),
            });
            noteWarnings(result);
          },
          onError: (payload) => {
            // A failed first search has no results to fall back to, so this
            // lands on the brief with the error rather than an empty shell.
            setError(payload);
            setPhase("idle");
            setStage(null);
          },
        },
        { fault: fault || null },
      );
    },
    [fault, noteWarnings, push],
  );

  /* ---------------------------------------------------------------- refine */

  const runRefine = useCallback(
    (feedbackText: string, reactions: Reactions) => {
      if (!outcome) return;

      const reactionEntries = Object.entries(reactions);
      const yes = reactionEntries.filter(([, value]) => value === "yes").length;
      const no = reactionEntries.length - yes;

      const shownProfileIds = outcome.matches.slice(0, visible).map((m) => m.profile.id);

      setPhase("working");
      setMode("refine");
      setError(null);
      setStage({ stage: "refining" });

      push({
        id: nextId(),
        role: "recruiter",
        text: feedbackText.trim() || "Use my reactions to adjust the search.",
        reactionSummary: reactionEntries.length
          ? `${yes} approved · ${no} rejected`
          : undefined,
      });

      setFeedback("");
      setApplied((current) => ({ ...current, ...reactions }));
      setPending({});

      const payload = {
        query,
        filters: outcome.filters,
        rubric: outcome.rubric,
        feedback: feedbackText.trim(),
        reactions: reactionEntries.map(([profileId, reaction]) => ({
          profileId,
          reaction,
        })),
        shownProfileIds,
      };

      setLastAction({ kind: "refine", feedback: feedbackText, reactions });

      void streamPost<RefineOutcome>(
        "/api/refine",
        payload,
        {
          onStage: (stageKey, detail) => setStage({ stage: stageKey, detail }),
          onResult: (result) => {
            setOutcome(result);
            setPhase("results");
            setStage(null);
            setVisible(PAGE_SIZE);
            setRounds((n) => n + 1);
            setLastChanges(
              result.changes.map((change) => change.highlight ?? change.label),
            );
            push({
              id: nextId(),
              role: "app",
              text: result.reply,
              changes: result.changes,
              rationale: result.rationale,
              resultLine: resultLine(result),
            });
            noteWarnings(result);
          },
          onError: (payload_) => {
            setError(payload_);
            setPhase("results");
            setStage(null);
          },
        },
        { fault: fault || null },
      );
    },
    [fault, noteWarnings, outcome, push, query, visible],
  );

  /* ------------------------------------------------------------- handlers */

  const retry = () => {
    if (!lastAction) return;
    if (lastAction.kind === "search") runSearch(lastAction.query);
    else runRefine(lastAction.feedback, lastAction.reactions);
  };

  const react = (profileId: string, reaction: "yes" | "no") => {
    setPending((current) => {
      const next = { ...current };
      if (next[profileId] === reaction) delete next[profileId];
      else next[profileId] = reaction;
      return next;
    });
  };

  const restart = () => {
    setPhase("idle");
    setDraft("");
    setQuery("");
    setOutcome(null);
    setThread([]);
    setPending({});
    setApplied({});
    setError(null);
    setRounds(0);
    setFrozenAt(null);
    setLastAction(null);
  };

  const pendingCounts = useMemo(() => {
    const values = Object.values(pending);
    return {
      yes: values.filter((v) => v === "yes").length,
      no: values.filter((v) => v === "no").length,
    };
  }, [pending]);

  const reactionFor = (id: string) => pending[id] ?? applied[id];

  /* ----------------------------------------------------------------- views */

  if (!hasApiKey) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <SetupState model={model} />
      </main>
    );
  }

  if (phase === "frozen" && outcome && frozenAt) {
    return (
      <>
        <Header
          model={model}
          status="Frozen"
          faultsEnabled={faultsEnabled}
          fault={fault}
          onFaultChange={setFault}
        />
        <main className="flex-1">
          <FrozenView
            query={query}
            filters={outcome.filters}
            rubric={outcome.rubric}
            matches={outcome.matches}
            reactions={applied}
            rounds={rounds}
            frozenAt={frozenAt}
            onResume={() => setPhase("results")}
            onRestart={restart}
          />
        </main>
      </>
    );
  }

  if (phase === "idle" && !error) {
    return (
      <>
        <Header
          model={model}
          status="New search"
          faultsEnabled={faultsEnabled}
          fault={fault}
          onFaultChange={setFault}
        />
        <main className="flex flex-1 flex-col">
          <HeroSearch
            query={draft}
            onQueryChange={setDraft}
            onSubmit={() => runSearch(draft)}
            poolSize={poolSize}
            model={model}
            busy={busy}
          />
        </main>
      </>
    );
  }

  if (phase === "idle" && error) {
    return (
      <>
        <Header
          model={model}
          status="New search"
          faultsEnabled={faultsEnabled}
          fault={fault}
          onFaultChange={setFault}
        />
        <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
          <ErrorState
            error={error}
            retrying={busy}
            onRetry={retry}
          />
          <div className="mt-4">
            <Button onClick={restart}>Edit the brief</Button>
          </div>
        </main>
      </>
    );
  }

  const shown = outcome?.matches.slice(0, visible) ?? [];
  const remaining = (outcome?.matches.length ?? 0) - shown.length;

  return (
    <>
      <Header
        model={model}
        status={busy ? "Working" : `Round ${rounds + 1}`}
        faultsEnabled={faultsEnabled}
        fault={fault}
        onFaultChange={setFault}
        action={
          outcome && outcome.matches.length > 0 ? (
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() => {
                setFrozenAt(new Date());
                setPhase("frozen");
              }}
            >
              Freeze search
            </Button>
          ) : null
        }
      />

      <main className="mx-auto grid w-full max-w-[1600px] flex-1 gap-4 px-4 py-4 lg:grid-cols-[320px_minmax(0,1fr)_380px] lg:items-start">
        {/* Plan rail */}
        <aside className="scroll-rail space-y-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
          <div className="px-1">
            <SectionLabel>The brief</SectionLabel>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
              &ldquo;{query}&rdquo;
            </p>
          </div>

          {outcome ? (
            <>
              <FiltersCard filters={outcome.filters} changedLabels={lastChanges} />
              <RubricCard rubric={outcome.rubric} changedLabels={lastChanges} />
            </>
          ) : (
            <>
              <Card className="space-y-2 p-4">
                <div className="skeleton h-3 w-24 rounded" />
                <div className="skeleton h-3 w-full rounded" />
                <div className="skeleton h-3 w-2/3 rounded" />
                <div className="skeleton h-3 w-1/2 rounded" />
              </Card>
              <Card className="space-y-2 p-4">
                <div className="skeleton h-3 w-20 rounded" />
                <div className="skeleton h-3 w-full rounded" />
                <div className="skeleton h-3 w-4/5 rounded" />
              </Card>
            </>
          )}
        </aside>

        {/* Shortlist */}
        <section className="min-w-0 space-y-3">
          {busy && (
            <>
              <ThinkingPanel mode={mode} stage={stage?.stage ?? null} detail={stage?.detail} />
              {!outcome && <ProfileSkeletons />}
            </>
          )}

          {error && !busy && (
            <ErrorState error={error} onRetry={retry} />
          )}

          {outcome && !busy && outcome.matches.length === 0 && (
            <NoMatchesState
              diagnostics={outcome.diagnostics}
              tightest={outcome.tightest}
              total={outcome.pool.total}
              disabled={busy}
              onRelax={(label) =>
                runRefine(
                  `No profiles matched. Relax the ${label.toLowerCase()} constraint so we get candidates to look at.`,
                  {},
                )
              }
            />
          )}

          {outcome && outcome.matches.length > 0 && (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
                <SectionLabel>Shortlist</SectionLabel>
                <span className="text-[12px] tabular-nums text-ink-faint">
                  showing {shown.length} of {outcome.matches.length} ·{" "}
                  {outcome.pool.afterFilters} of {outcome.pool.total} passed the filters
                </span>
              </div>

              <div className={cx("space-y-3", busy && "pointer-events-none opacity-50")}>
                {shown.map((match, index) => (
                  <ProfileCard
                    key={match.profile.id}
                    match={match}
                    rank={index + 1}
                    reaction={reactionFor(match.profile.id)}
                    onReact={(reaction) => react(match.profile.id, reaction)}
                  />
                ))}
              </div>

              {remaining > 0 && (
                <div className="flex justify-center pt-1">
                  <Button onClick={() => setVisible((v) => v + PAGE_SIZE)} disabled={busy}>
                    Show {Math.min(PAGE_SIZE, remaining)} more
                  </Button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Conversation */}
        <aside className="lg:sticky lg:top-4">
          <Card className="h-[520px] overflow-hidden lg:h-[calc(100vh-6rem)]">
            <Conversation
              thread={thread}
              feedback={feedback}
              onFeedbackChange={setFeedback}
              onSubmit={() => runRefine(feedback, pending)}
              busy={busy}
              refining={busy && mode === "refine"}
              pendingReactions={pendingCounts}
              onClearReactions={() => setPending({})}
              disabled={!outcome}
            />
          </Card>
        </aside>
      </main>
    </>
  );
}

function Header({
  model,
  status,
  action,
  faultsEnabled,
  fault,
  onFaultChange,
}: {
  model: string;
  status: string;
  action?: React.ReactNode;
  faultsEnabled: boolean;
  fault: string;
  onFaultChange: (value: string) => void;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3 px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[19px] leading-none text-ink">Flexiple</span>
          <span className="text-[13px] text-ink-faint">Sourcing</span>
        </div>

        <span className="ml-1 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11.5px] text-ink-soft">
          {status}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {faultsEnabled && (
            <label className="hidden items-center gap-1.5 text-[11.5px] text-ink-faint sm:flex">
              Inject fault
              <select
                value={fault}
                onChange={(event) => onFaultChange(event.target.value)}
                className="rounded-md border border-line bg-surface px-1.5 py-1 text-[11.5px] text-ink-soft"
              >
                <option value="">none</option>
                <option value="rate_limited">rate limit</option>
                <option value="timeout">timeout</option>
                <option value="malformed">malformed JSON</option>
                <option value="missing_key">missing key</option>
              </select>
            </label>
          )}
          <span className="hidden font-mono text-[11px] text-ink-faint sm:inline">
            {model}
          </span>
          {action}
        </div>
      </div>
    </header>
  );
}
