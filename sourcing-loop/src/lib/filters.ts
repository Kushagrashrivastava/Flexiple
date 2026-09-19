import type { ObjectiveFilters } from "./schemas";
import type { Profile } from "./types";

/**
 * Objective filtering runs here, in plain TypeScript — never in the LLM.
 * The model decides *what* the constraints are; this file decides *who* passes.
 * That keeps the hard cut deterministic, instant, and explainable.
 */

const normalise = (value: string) =>
  value
    .toLowerCase()
    .replace(/[._\-/]+/g, " ")
    .replace(/[^a-z0-9+# ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Every token of the needle must prefix-match a token of the haystack.
 *
 * "RDS" matches "AWS RDS", "Node" matches "Node.js", "Backend" matches
 * "Senior Backend Engineer", "India" matches "Remote - India". Crucially it is
 * one-directional: requiring "AWS RDS" does *not* match someone whose only
 * skill is "AWS", and requiring "PostgreSQL" does not match plain "SQL".
 * Plain substring matching gets both of those wrong, and both appear in this pool.
 *
 * Needles of one or two characters ("Go", "R") must match a whole token, so
 * "Go" never matches "Django".
 */
const looselyMatches = (needle: string, haystack: string) => {
  const n = normalise(needle);
  const h = normalise(haystack);
  if (!n || !h) return false;
  if (n === h) return true;

  const haystackTokens = h.split(" ");
  return n
    .split(" ")
    .every((token) =>
      token.length <= 2
        ? haystackTokens.includes(token)
        : haystackTokens.some((candidate) => candidate.startsWith(token)),
    );
};

const hasSkill = (profile: Profile, skill: string) =>
  profile.skills.some((s) => looselyMatches(skill, s)) ||
  looselyMatches(skill, profile.current_title);

export type FilterKey =
  | "required_skills"
  | "years"
  | "locations"
  | "company_types"
  | "title_keywords"
  | "exclude_title_keywords";

/** Human label used in the "why is this empty" panel and the filter chips. */
export const FILTER_LABELS: Record<FilterKey, string> = {
  required_skills: "Required skills",
  years: "Years of experience",
  locations: "Location",
  company_types: "Company background",
  title_keywords: "Title",
  exclude_title_keywords: "Excluded titles",
};

type Predicate = { key: FilterKey; active: boolean; test: (p: Profile) => boolean };

const buildPredicates = (filters: ObjectiveFilters): Predicate[] => [
  {
    key: "required_skills",
    active: filters.required_skills.length > 0,
    test: (p) => filters.required_skills.every((skill) => hasSkill(p, skill)),
  },
  {
    key: "years",
    active: filters.min_years !== null || filters.max_years !== null,
    test: (p) =>
      (filters.min_years === null || p.years_experience >= filters.min_years) &&
      (filters.max_years === null || p.years_experience <= filters.max_years),
  },
  {
    key: "locations",
    active: filters.locations.length > 0,
    test: (p) => filters.locations.some((loc) => looselyMatches(loc, p.location)),
  },
  {
    key: "company_types",
    active: filters.company_types.length > 0,
    test: (p) => {
      const current = filters.company_types.includes(p.current_company_type);
      if (filters.company_type_scope === "current") return current;
      return (
        current ||
        p.past_companies.some((c) => filters.company_types.includes(c.company_type))
      );
    },
  },
  {
    key: "title_keywords",
    active: filters.title_keywords.length > 0,
    test: (p) => filters.title_keywords.some((kw) => looselyMatches(kw, p.current_title)),
  },
  {
    key: "exclude_title_keywords",
    active: filters.exclude_title_keywords.length > 0,
    test: (p) =>
      !filters.exclude_title_keywords.some((kw) =>
        looselyMatches(kw, p.current_title),
      ),
  },
];

export type FilterDiagnostic = {
  key: FilterKey;
  label: string;
  /** How many of the whole pool this single constraint would keep on its own. */
  passedAlone: number;
  /** How many candidates this constraint is personally responsible for cutting. */
  removed: number;
};

export type FilterOutcome = {
  matched: Profile[];
  total: number;
  diagnostics: FilterDiagnostic[];
  /** The constraint to relax first when nothing matched. */
  tightest: FilterDiagnostic | null;
};

export function applyFilters(
  profiles: Profile[],
  filters: ObjectiveFilters,
): FilterOutcome {
  const predicates = buildPredicates(filters).filter((p) => p.active);

  const matched = profiles.filter((profile) =>
    predicates.every((predicate) => predicate.test(profile)),
  );

  // For each active constraint, how many survive if we drop *only* that one.
  // This is what powers the empty state's "relax this first" suggestion.
  const diagnostics: FilterDiagnostic[] = predicates.map((predicate) => {
    const others = predicates.filter((p) => p.key !== predicate.key);
    const withoutThis = profiles.filter((profile) =>
      others.every((p) => p.test(profile)),
    ).length;
    return {
      key: predicate.key,
      label: FILTER_LABELS[predicate.key],
      passedAlone: profiles.filter((p) => predicate.test(p)).length,
      removed: withoutThis - matched.length,
    };
  });

  const tightest =
    [...diagnostics].sort((a, b) => b.removed - a.removed)[0] ?? null;

  return { matched, total: profiles.length, diagnostics, tightest };
}

/**
 * Verifies that an explanation actually quotes the profile it describes.
 * The LLM is told to cite fields; this is what makes that a guarantee rather
 * than a hope. Anything unverifiable is dropped before it reaches the screen.
 */
export function fieldContains(
  profile: Profile,
  field: string,
  value: string,
): boolean {
  const target = normalise(value);
  if (!target) return false;

  const haystacks: string[] = (() => {
    switch (field) {
      case "skills":
        return profile.skills;
      case "past_companies":
        return profile.past_companies.flatMap((c) => [
          c.company,
          c.company_type,
          c.title,
          String(c.years),
        ]);
      case "years_experience":
        return [String(profile.years_experience)];
      default: {
        const raw = profile[field as keyof Profile];
        return typeof raw === "string" ? [raw] : [];
      }
    }
  })();

  return haystacks.some((h) => {
    const hay = normalise(h);
    if (!hay) return false;
    // Forward: the citation is a phrase lifted out of a longer field.
    if (hay.includes(target)) return true;
    // Reverse: the citation stitches several values together ("AWS RDS, Redis").
    // Guarded by length so a three-letter token like "AWS" cannot wave through
    // a sentence the profile never supports.
    return hay.length >= 4 && target.includes(hay);
  });
}
