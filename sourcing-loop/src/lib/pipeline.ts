import { applyFilters, fieldContains, type FilterDiagnostic } from "./filters";
import { activeModel, completeJson, type DemoFault } from "./llm/client";
import { LlmError } from "./llm/errors";
import {
  buildVocabulary,
  planSystemPrompt,
  planUserPrompt,
  refineSystemPrompt,
  refineUserPrompt,
  scoringSystemPrompt,
  scoringUserPrompt,
} from "./llm/prompts";
import { loadProfiles, profilesById } from "./profiles";
import {
  refinementSchema,
  scoreBatchSchema,
  searchPlanSchema,
  type Evidence,
  type FitRubric,
  type ObjectiveFilters,
  type Reaction,
  type Refinement,
  type SearchPlan,
} from "./schemas";
import type { Profile } from "./types";

/**
 * Profiles per scoring call. Most searches land under this, which means one
 * call sees the whole shortlist and can rank it against itself rather than
 * against the rubric in isolation.
 */
const SCORE_BATCH_SIZE = 12;
/**
 * Batches in flight at once. Groq's free tier caps tokens *per minute* (8k on
 * the default key), and `max_tokens` is reserved against that budget when the
 * request is accepted — so two concurrent scoring calls rate-limit themselves.
 * Sequential is the correct answer here, and progress is streamed anyway.
 */
const SCORE_CONCURRENCY = 1;

/** Evidence lines shown per card. More than this is noise on screen. */
const MAX_EVIDENCE = 4;

export type Match = {
  profile: Profile;
  score: number | null;
  verdict: "strong" | "possible" | "weak" | "unscored";
  headline: string;
  evidence: Evidence[];
  concerns: string[];
  /** Citations the model made that do not appear in the profile. */
  droppedCitations: number;
};

export type Warning = { code: string; message: string };

export type SearchOutcome = {
  filters: ObjectiveFilters;
  rubric: FitRubric;
  interpretation: string;
  matches: Match[];
  pool: { total: number; afterFilters: number; scored: number };
  diagnostics: FilterDiagnostic[];
  tightest: FilterDiagnostic | null;
  warnings: Warning[];
  model: string;
};

export type StageEvent = { stage: string; detail?: string };
export type OnStage = (event: StageEvent) => void;

/* -------------------------------------------------------------------------- */
/* Step 1 — free text to a plan                                               */
/* -------------------------------------------------------------------------- */

export const repairWarning = (reason: string): Warning => ({
  code: "repaired",
  message: `The model's first response failed validation (${reason.slice(0, 90)}). It was asked to correct itself and did — these results come from the corrected response.`,
});

export async function generatePlan(
  query: string,
  fault: DemoFault | null,
  onRepair?: (reason: string) => void,
): Promise<SearchPlan> {
  const vocabulary = buildVocabulary(loadProfiles());
  return completeJson({
    label: "plan",
    schema: searchPlanSchema,
    temperature: 0.2,
    messages: [
      { role: "system", content: planSystemPrompt(vocabulary) },
      { role: "user", content: planUserPrompt(query) },
    ],
    fault,
    onRepair,
  });
}

/* -------------------------------------------------------------------------- */
/* Step 2 — score the survivors against the rubric                            */
/* -------------------------------------------------------------------------- */

const chunk = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/**
 * Keeps only the evidence that genuinely occurs in the profile it describes.
 * This is the line between "the model said something plausible" and "the
 * recruiter can trust what is on screen".
 */
function verifyEvidence(profile: Profile, evidence: Evidence[]) {
  const kept = evidence.filter((item) =>
    fieldContains(profile, item.field, item.value),
  );
  return { kept, dropped: evidence.length - kept.length };
}

async function scoreProfiles(
  query: string,
  rubric: FitRubric,
  profiles: Profile[],
  fault: DemoFault | null,
  onStage: OnStage,
): Promise<{ matches: Match[]; warnings: Warning[] }> {
  const batches = chunk(profiles, SCORE_BATCH_SIZE);
  const scores = new Map<string, Match>();
  const warnings: Warning[] = [];
  /**
   * The first genuine failure, kept apart from informational notes. Held in an
   * object because it is assigned inside the worker closures.
   */
  const failure: { error: LlmError | null } = { error: null };
  let completed = 0;

  const runBatch = async (batch: Profile[], index: number) => {
    try {
      const result = await completeJson({
        label: `score:batch-${index + 1}`,
        schema: scoreBatchSchema,
        temperature: 0.1,
        maxTokens: 3000,
        messages: [
          { role: "system", content: scoringSystemPrompt },
          { role: "user", content: scoringUserPrompt(query, rubric, batch) },
        ],
        // Inject the fault into the first batch only, so the demo shows a
        // partial failure recovering rather than a blank screen.
        fault: index === 0 ? fault : null,
        onRepair: (reason) => warnings.push(repairWarning(reason)),
      });

      const inBatch = new Map(batch.map((p) => [p.id, p]));
      for (const score of result.scores) {
        const profile = inBatch.get(score.id);
        if (!profile) continue; // hallucinated id — ignore it
        const { kept, dropped } = verifyEvidence(profile, score.evidence);
        scores.set(profile.id, {
          profile,
          score: score.score,
          verdict: score.verdict,
          headline: score.headline,
          evidence: kept.slice(0, MAX_EVIDENCE),
          concerns: score.concerns,
          droppedCitations: dropped,
        });
      }
    } catch (error) {
      // One bad batch must not sink the whole search. Note it, keep going,
      // and tell the recruiter exactly how much of the pool went unscored.
      const llmError =
        error instanceof LlmError
          ? error
          : new LlmError("upstream_error", (error as Error).message);
      failure.error ??= llmError;
      warnings.push({
        code: llmError.code,
        message: `${batch.length} profile${batch.length === 1 ? "" : "s"} could not be scored (${llmError.code}).`,
      });
    } finally {
      completed += 1;
      onStage({
        stage: "scoring",
        detail: `Scored ${Math.min(completed * SCORE_BATCH_SIZE, profiles.length)} of ${profiles.length} profiles`,
      });
    }
  };

  // Simple concurrency window — start the next batch as a slot frees up.
  const queue = batches.map((batch, index) => () => runBatch(batch, index));
  const workers = Array.from({ length: Math.min(SCORE_CONCURRENCY, queue.length) }, async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      await next();
    }
  });
  await Promise.all(workers);

  if (scores.size === 0 && failure.error) {
    // Nothing survived — this is a real failure, not a degraded result, so it
    // is re-thrown with the code of the failure that actually caused it.
    throw new LlmError(failure.error.code, "No profiles could be scored");
  }

  const skipped = profiles.filter((profile) => !scores.has(profile.id)).length;
  if (skipped > 0 && warnings.length === 0) {
    // The batch succeeded but the model returned fewer scores than candidates.
    // Silently dropping those profiles would be the worst possible failure mode
    // for a sourcing tool, so they stay in the list and say why.
    warnings.push({
      code: "incomplete_scoring",
      message: `${skipped} profile${skipped === 1 ? "" : "s"} passed the filters but the model did not return a score. ${
        skipped === 1 ? "It is" : "They are"
      } listed unscored at the bottom rather than dropped.`,
    });
  }

  const matches: Match[] = profiles.map(
    (profile) =>
      scores.get(profile.id) ?? {
        profile,
        score: null,
        verdict: "unscored" as const,
        headline: "This profile passed the filters but could not be scored.",
        evidence: [],
        concerns: [],
        droppedCitations: 0,
      },
  );

  // Ties still happen across batch boundaries. Break them on signals the
  // recruiter can see, so the order is never arbitrary.
  matches.sort(
    (a, b) =>
      (b.score ?? -1) - (a.score ?? -1) ||
      b.evidence.length - a.evidence.length ||
      a.concerns.length - b.concerns.length ||
      b.profile.years_experience - a.profile.years_experience,
  );
  return { matches, warnings };
}

/* -------------------------------------------------------------------------- */
/* Step 3 — the whole loop                                                    */
/* -------------------------------------------------------------------------- */

export async function runSearch({
  query,
  plan,
  fault,
  onStage,
  carriedWarnings = [],
}: {
  query: string;
  plan: SearchPlan;
  fault: DemoFault | null;
  onStage: OnStage;
  /** Notes raised before scoring began, e.g. a repair during planning. */
  carriedWarnings?: Warning[];
}): Promise<SearchOutcome> {
  const profiles = loadProfiles();

  onStage({ stage: "filtering", detail: `Filtering ${profiles.length} profiles` });
  const outcome = applyFilters(profiles, plan.filters);

  const base = {
    filters: plan.filters,
    rubric: plan.rubric,
    interpretation: plan.interpretation,
    diagnostics: outcome.diagnostics,
    tightest: outcome.tightest,
    model: activeModel(),
  };

  if (outcome.matched.length === 0) {
    return {
      ...base,
      matches: [],
      pool: { total: profiles.length, afterFilters: 0, scored: 0 },
      warnings: carriedWarnings,
    };
  }

  onStage({
    stage: "scoring",
    detail: `Scoring ${outcome.matched.length} profiles against the rubric`,
  });

  const { matches, warnings: scoringWarnings } = await scoreProfiles(
    query,
    plan.rubric,
    outcome.matched,
    fault,
    onStage,
  );
  const warnings = [...carriedWarnings, ...scoringWarnings];

  const droppedTotal = matches.reduce((sum, m) => sum + m.droppedCitations, 0);
  if (droppedTotal > 0) {
    warnings.push({
      code: "citation_dropped",
      message: `${droppedTotal} unverifiable citation${
        droppedTotal === 1 ? "" : "s"
      } removed — explanations only show facts found in the profile.`,
    });
  }

  return {
    ...base,
    matches,
    pool: {
      total: profiles.length,
      afterFilters: outcome.matched.length,
      scored: matches.filter((m) => m.score !== null).length,
    },
    warnings,
  };
}

export async function refinePlan({
  query,
  filters,
  rubric,
  feedback,
  reactions,
  shownProfileIds,
  fault,
  onRepair,
}: {
  query: string;
  filters: ObjectiveFilters;
  rubric: FitRubric;
  feedback: string;
  reactions: Reaction[];
  shownProfileIds: string[];
  fault: DemoFault | null;
  onRepair?: (reason: string) => void;
}): Promise<Refinement> {
  const vocabulary = buildVocabulary(loadProfiles());
  return completeJson({
    label: "refine",
    schema: refinementSchema,
    temperature: 0.3,
    messages: [
      { role: "system", content: refineSystemPrompt(vocabulary) },
      {
        role: "user",
        content: refineUserPrompt({
          query,
          filters,
          rubric,
          feedback,
          reactions,
          shownProfiles: profilesById(shownProfileIds),
        }),
      },
    ],
    fault,
    onRepair,
  });
}
