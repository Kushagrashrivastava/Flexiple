"use client";

import type { Match } from "@/lib/pipeline";
import type { FitRubric, ObjectiveFilters } from "@/lib/schemas";
import { FiltersCard, RubricCard } from "./PlanRail";
import { ProfileCard } from "./ProfileCard";
import { Button, Card, SectionLabel } from "./ui";

/**
 * The end of the loop. One page the recruiter can hand to a hiring manager:
 * what was searched for, how it was judged, and who came out of it.
 */
export function FrozenView({
  query,
  filters,
  rubric,
  matches,
  reactions,
  rounds,
  frozenAt,
  onResume,
  onRestart,
}: {
  query: string;
  filters: ObjectiveFilters;
  rubric: FitRubric;
  matches: Match[];
  reactions: Record<string, "yes" | "no">;
  rounds: number;
  frozenAt: Date;
  onResume: () => void;
  onRestart: () => void;
}) {
  const strong = matches.filter((m) => m.verdict === "strong").length;

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="animate-rise flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <SectionLabel>Search frozen</SectionLabel>
          <h1 className="mt-2 font-display text-[34px] leading-tight text-ink">
            {matches.length} candidate{matches.length === 1 ? "" : "s"} on the final
            shortlist
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-soft">
            {strong} rated a strong match · {rounds} refinement round
            {rounds === 1 ? "" : "s"} · frozen at{" "}
            {frozenAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={onResume}>Resume refining</Button>
          <Button variant="primary" onClick={onRestart}>
            New search
          </Button>
        </div>
      </div>

      <Card className="animate-rise mt-6 p-4">
        <SectionLabel>The brief</SectionLabel>
        <p className="mt-2 font-display text-[19px] leading-snug text-ink">
          &ldquo;{query}&rdquo;
        </p>
      </Card>

      <div className="animate-rise mt-4 grid items-start gap-4 md:grid-cols-2">
        <FiltersCard filters={filters} />
        <RubricCard rubric={rubric} />
      </div>

      <div className="mt-8">
        <SectionLabel>Ranked shortlist</SectionLabel>
        <div className="mt-3 space-y-3">
          {matches.map((match, index) => (
            <ProfileCard
              key={match.profile.id}
              match={match}
              rank={index + 1}
              reaction={reactions[match.profile.id]}
              readOnly
            />
          ))}
        </div>
      </div>
    </div>
  );
}
