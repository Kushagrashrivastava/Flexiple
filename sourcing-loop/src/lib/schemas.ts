import { z } from "zod";
import { CITABLE_FIELDS, COMPANY_TYPES } from "./types";

/**
 * Every structured value that crosses the LLM boundary is defined here once,
 * validated on arrival, and shared with the client as inferred types. If the
 * model returns something that does not parse, we repair or fail loudly — we
 * never render unvalidated model output.
 */

const trimmedString = z.string().trim();

/**
 * Length limits exist so the UI stays readable, not because a long answer is
 * wrong. Rejecting one would cost a whole repair round trip to fix something
 * we were going to trim anyway — so cosmetic limits clip, and only structural
 * violations (unknown enum, missing field, out-of-range score) fail.
 */
const clipped = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .transform((value) =>
      value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`,
    );

const cappedList = (max: number) =>
  z
    .array(trimmedString)
    .default([])
    .transform((values) => values.slice(0, max));

/** Objective, machine-applicable constraints. Applied locally, not by the LLM. */
export const objectiveFiltersSchema = z.object({
  /** Must-have skills. A profile has to match every one of these. */
  required_skills: cappedList(8),
  /** Signals that help but never exclude. Fed to the scorer, not the filter. */
  preferred_skills: cappedList(8),
  min_years: z.number().min(0).max(50).nullable().default(null),
  max_years: z.number().min(0).max(50).nullable().default(null),
  /** Matched against `location`. Empty means "anywhere". */
  locations: cappedList(8),
  /** Matched against company type. Empty means "any kind of company". */
  company_types: z.array(z.enum(COMPANY_TYPES)).default([]),
  /**
   * "current" = works at that kind of company today.
   * "any" = has worked at one at some point (covers "has startup background").
   */
  company_type_scope: z.enum(["current", "any"]).default("any"),
  /** OR-matched against `current_title`. Empty means "any title". */
  title_keywords: cappedList(6),
  /** Hard exclusions on `current_title`, e.g. "Manager" for an IC role. */
  exclude_title_keywords: cappedList(6),
});

export type ObjectiveFilters = z.infer<typeof objectiveFiltersSchema>;

/** Subjective judgement the LLM applies to whatever survives the filters. */
export const fitRubricSchema = z.object({
  role_summary: clipped(400),
  criteria: z
    .array(
      z.object({
        name: clipped(60),
        description: clipped(320),
        weight: z.number().int().min(1).max(5),
        /** Concrete things in a profile that would satisfy this criterion. */
        signals: cappedList(5),
      }),
    )
    .min(2)
    .max(5),
  red_flags: cappedList(6),
});

export type FitRubric = z.infer<typeof fitRubricSchema>;

export const searchPlanSchema = z.object({
  filters: objectiveFiltersSchema,
  rubric: fitRubricSchema,
  /** One line the product shows back to the recruiter: "here's how I read that". */
  interpretation: clipped(320),
});

export type SearchPlan = z.infer<typeof searchPlanSchema>;

/** One checkable claim about a profile. `value` must occur in `field`. */
export const evidenceSchema = z.object({
  field: z.enum(CITABLE_FIELDS),
  value: clipped(160),
  why: clipped(220),
});

export type Evidence = z.infer<typeof evidenceSchema>;

export const profileScoreSchema = z.object({
  id: trimmedString.min(1),
  score: z.number().min(0).max(100),
  verdict: z.enum(["strong", "possible", "weak"]),
  headline: clipped(160),
  /** Trimmed to the display limit after verification, never rejected for length. */
  evidence: z.array(evidenceSchema).min(1),
  concerns: cappedList(3),
});

export type ProfileScore = z.infer<typeof profileScoreSchema>;

export const scoreBatchSchema = z.object({
  scores: z.array(profileScoreSchema),
});

/** What the refinement turn returns: a new plan plus its own rationale. */
export const refinementSchema = z.object({
  filters: objectiveFiltersSchema,
  rubric: fitRubricSchema,
  /** Conversational answer shown in the thread. */
  reply: clipped(600),
  /** Why each change was made. *What* changed is diffed locally, not trusted. */
  rationale: z
    .array(
      z.object({
        change: clipped(160),
        reason: clipped(240),
      }),
    )
    .default([])
    .transform((entries) => entries.slice(0, 6)),
});

export type Refinement = z.infer<typeof refinementSchema>;

/* -------------------------------------------------------------------------- */
/* Request payloads                                                            */
/* -------------------------------------------------------------------------- */

export const reactionSchema = z.object({
  profileId: trimmedString.min(1),
  reaction: z.enum(["yes", "no"]),
});

export type Reaction = z.infer<typeof reactionSchema>;

export const searchRequestSchema = z.object({
  query: z.string().trim().min(3).max(600),
});

export const refineRequestSchema = z.object({
  query: z.string().trim().min(1).max(600),
  filters: objectiveFiltersSchema,
  rubric: fitRubricSchema,
  feedback: z.string().trim().max(600).default(""),
  reactions: z.array(reactionSchema).max(48).default([]),
  /** Ids the recruiter was actually looking at when they gave feedback. */
  shownProfileIds: z.array(trimmedString).max(12).default([]),
});
