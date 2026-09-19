import type { FitRubric, ObjectiveFilters, Reaction } from "../schemas";
import type { Profile } from "../types";

/**
 * Every prompt the product sends, in one readable file.
 *
 * Three calls, each with one job:
 *   1. planPrompt    — free text  ->  objective filters + subjective rubric
 *   2. scoringPrompt — rubric     ->  scores with citations we can verify
 *   3. refinePrompt  — feedback   ->  an adjusted plan plus its reasoning
 *
 * A shared principle runs through all three: the model may only reason about
 * what is in a profile, and must quote the field it reasoned from. Anything it
 * cannot point at gets dropped before the recruiter ever sees it.
 */

/** The dataset's own vocabulary, so filters come back in values that exist. */
export type Vocabulary = {
  locations: string[];
  titles: string[];
  skills: string[];
  companyTypes: string[];
  yearsRange: [number, number];
};

export function buildVocabulary(profiles: Profile[]): Vocabulary {
  const unique = (values: string[]) => [...new Set(values)].sort();
  return {
    locations: unique(profiles.map((p) => p.location)),
    titles: unique(profiles.map((p) => p.current_title)),
    skills: unique(profiles.flatMap((p) => p.skills)),
    companyTypes: unique([
      ...profiles.map((p) => p.current_company_type),
      ...profiles.flatMap((p) => p.past_companies.map((c) => c.company_type)),
    ]),
    yearsRange: [
      Math.min(...profiles.map((p) => p.years_experience)),
      Math.max(...profiles.map((p) => p.years_experience)),
    ],
  };
}

const vocabularyBlock = (v: Vocabulary) =>
  [
    "The talent pool uses exactly these values. Prefer them verbatim:",
    `- location: ${v.locations.join(" | ")}`,
    `- current_title: ${v.titles.join(" | ")}`,
    `- company_type: ${v.companyTypes.join(" | ")}`,
    `- years_experience ranges from ${v.yearsRange[0]} to ${v.yearsRange[1]}`,
    `- skills seen in the pool: ${v.skills.join(", ")}`,
  ].join("\n");

const FILTER_CONTRACT = `
"filters" is applied literally by code, with no model in the loop. Be conservative:
a filter is a hard cut, and a candidate it removes can never be recovered by the rubric.

- required_skills: only skills the brief truly makes non-negotiable. Usually 0-2.
  Everything else that is merely desirable belongs in preferred_skills.
- preferred_skills: nice-to-haves. These never exclude anyone; the rubric weighs them.
- min_years / max_years: numbers or null. "4-7 years" -> min 4, max 7.
  "senior" alone is not a number — express seniority in the rubric, not here,
  unless the brief states a figure.
- locations: only when the brief names a place. "Remote - India" is a location
  in this pool, so include it when the brief allows remote candidates in India.
- company_types: from startup | scaleup | enterprise | agency.
- company_type_scope: "any" when the brief says "has worked at" or describes a
  background; "current" only when it insists on where they work right now.
- title_keywords: broad role words such as "Backend" or "Data", not full titles.
  Leave empty when the skills already carry the role.
- exclude_title_keywords: use sparingly, e.g. "Manager" when the brief is
  explicitly for an individual contributor.
`.trim();

const RUBRIC_CONTRACT = `
"rubric" captures what the filters cannot: what good actually looks like here.
- role_summary: one or two sentences describing the ideal hire.
- criteria: 3-4 entries. Each needs a short name, a description of what a strong
  profile shows, a weight from 1-5, and concrete signals to look for
  (technologies, kinds of company, kinds of past work).
- Criteria must be judgeable from the available fields: current_title,
  years_experience, location, current_company, current_company_type, skills,
  past_companies, education, summary. Do not invent criteria about things the
  data cannot answer, such as communication skills or notice period.
- red_flags: things that should pull a score down, when the brief implies any.
`.trim();

/* -------------------------------------------------------------------------- */
/* 1. Free text -> filters + rubric                                           */
/* -------------------------------------------------------------------------- */

export const planSystemPrompt = (vocabulary: Vocabulary) =>
  `
You are the sourcing engine behind Flexiple's AI recruiter. A recruiter types
what they are looking for in free text. You turn that into two things:

1. Objective filters, applied deterministically by code against a talent pool.
2. A subjective fit rubric, used afterwards to judge whoever survives the filters.

${vocabularyBlock(vocabulary)}

${FILTER_CONTRACT}

${RUBRIC_CONTRACT}

Also return "interpretation": one sentence, addressed to the recruiter, saying
how you read the brief. Name any assumption you made, e.g. "I read 'RDS' as AWS
RDS and did not require it of everyone." It must describe the filters you
actually produced — if you left company_types empty and put startup background
in the rubric instead, say that, because the recruiter can see both.

Return a single JSON object with exactly these keys:
{
  "filters": {
    "required_skills": string[], "preferred_skills": string[],
    "min_years": number|null, "max_years": number|null,
    "locations": string[], "company_types": string[],
    "company_type_scope": "current"|"any",
    "title_keywords": string[], "exclude_title_keywords": string[]
  },
  "rubric": {
    "role_summary": string,
    "criteria": [{ "name": string, "description": string, "weight": 1-5, "signals": string[] }],
    "red_flags": string[]
  },
  "interpretation": string
}
No prose outside the JSON.
`.trim();

export const planUserPrompt = (query: string) =>
  `Recruiter's brief:\n"""\n${query}\n"""`;

/* -------------------------------------------------------------------------- */
/* 2. Rubric -> scored profiles with verifiable citations                      */
/* -------------------------------------------------------------------------- */

/** Compact serialisation — the model sees every field it is allowed to cite. */
export const serialiseProfile = (profile: Profile) =>
  [
    `id: ${profile.id}`,
    `current_title: ${profile.current_title}`,
    `years_experience: ${profile.years_experience}`,
    `location: ${profile.location}`,
    `current_company: ${profile.current_company} (current_company_type: ${profile.current_company_type})`,
    `skills: ${profile.skills.join(", ")}`,
    `past_companies: ${
      profile.past_companies
        .map((c) => `${c.company} [${c.company_type}] ${c.title}, ${c.years}y`)
        .join(" | ") || "none listed"
    }`,
    `education: ${profile.education}`,
    `summary: ${profile.summary}`,
  ].join("\n");

export const scoringSystemPrompt = `
You are scoring pre-filtered candidates against a recruiter's fit rubric.
Every candidate you are shown already satisfies the objective filters, so judge
only the subjective fit.

Work in two steps. First put the candidates in order, best to worst, by asking
which one you would send to the hiring manager first. Then assign scores that
match that order.

- 85-100 "strong": clearly meets the highest-weighted criteria with evidence.
- 60-84  "possible": real overlap, but something material is missing or thin.
- 0-59   "weak": survived the filters on a technicality; the substance is not there.

Two candidates must never receive the same score. When they look equally good,
find the difference that would actually decide it — depth in the top-weighted
criterion, relevance of past companies, how much of the profile is on-target
rather than adjacent — and separate them by at least two points. A flat list of
identical scores tells the recruiter nothing and is a failed answer.

Give each candidate two to four pieces of evidence — the strongest ones, not
every true fact. Evidence has one hard rule:
- "field" must be one of: current_title, years_experience, location,
  current_company, current_company_type, skills, past_companies, education, summary.
- "value" must be copied verbatim from that field of that exact candidate.
  Not paraphrased, not inferred, not borrowed from another candidate. A citation
  that does not appear in the profile is discarded by the validator, so a
  fabricated one simply costs the candidate their explanation.
- "why" says what that fact proves about fit, in the recruiter's terms.

"headline" is one specific sentence about this person — not praise, not a
restatement of the rubric. "concerns" names what is genuinely missing, if anything.

Return a single JSON object: { "scores": [ { "id": string, "score": number,
"verdict": "strong"|"possible"|"weak", "headline": string,
"evidence": [{ "field": string, "value": string, "why": string }],
"concerns": string[] } ] }
Score every candidate given, once each, and return nothing outside the JSON.
`.trim();

export const scoringUserPrompt = (
  query: string,
  rubric: FitRubric,
  profiles: Profile[],
) =>
  [
    `Recruiter's brief: "${query}"`,
    "",
    "Fit rubric:",
    rubric.role_summary,
    ...rubric.criteria.map(
      (c) =>
        `- ${c.name} (weight ${c.weight}/5): ${c.description}${
          c.signals.length ? ` Signals: ${c.signals.join(", ")}.` : ""
        }`,
    ),
    rubric.red_flags.length ? `Red flags: ${rubric.red_flags.join("; ")}` : "",
    "",
    `Candidates (${profiles.length}):`,
    ...profiles.map((p) => `---\n${serialiseProfile(p)}`),
  ]
    .filter(Boolean)
    .join("\n");

/* -------------------------------------------------------------------------- */
/* 3. Recruiter feedback -> adjusted plan                                      */
/* -------------------------------------------------------------------------- */

export const refineSystemPrompt = (vocabulary: Vocabulary) =>
  `
You are adjusting a live sourcing search based on what a recruiter just told you.
You will be given the original brief, the filters and rubric currently in force,
the candidates the recruiter was looking at, and their feedback.

Your job is to make the smallest change that honours the feedback.

- Change a filter only when the feedback is objective ("too junior", "must be in
  Berlin", "no agency backgrounds"). Prefer widening a range over adding a new
  hard cut, and remember every filter permanently removes people.
- Change the rubric when the feedback is about taste ("I want more payments
  depth", "this one is too infrastructure-heavy"): adjust weights, sharpen a
  description, add or drop a criterion.
- A thumbs-up or thumbs-down is a data point about that specific profile. Read
  across them: find what the approved profiles share that the rejected ones lack,
  and encode that difference. Do not hard-code individual candidates into filters.
- Carry forward everything the feedback did not touch. Do not quietly reset
  filters or rewrite criteria the recruiter never mentioned.
- If feedback conflicts with the original brief, the newer feedback wins.

${vocabularyBlock(vocabulary)}

${FILTER_CONTRACT}

${RUBRIC_CONTRACT}

Return a single JSON object:
{
  "filters": { ...the complete updated filters, same shape as before... },
  "rubric": { ...the complete updated rubric, same shape as before... },
  "reply": "A short, direct answer to the recruiter in the first person. Say what you changed and why, in plain language. No bullet lists, no restating their words back at them.",
  "rationale": [{ "change": "one specific change", "reason": "why the feedback implies it" }]
}
Return the full filters and rubric objects even for parts you did not change.
No prose outside the JSON.
`.trim();

export const refineUserPrompt = ({
  query,
  filters,
  rubric,
  feedback,
  reactions,
  shownProfiles,
}: {
  query: string;
  filters: ObjectiveFilters;
  rubric: FitRubric;
  feedback: string;
  reactions: Reaction[];
  shownProfiles: Profile[];
}) => {
  const reactionFor = (id: string) =>
    reactions.find((r) => r.profileId === id)?.reaction;

  const reacted = shownProfiles.filter((p) => reactionFor(p.id));

  return [
    `Original brief: "${query}"`,
    "",
    "Filters currently in force:",
    JSON.stringify(filters, null, 2),
    "",
    "Rubric currently in force:",
    JSON.stringify(rubric, null, 2),
    "",
    reacted.length
      ? [
          "Per-candidate reactions:",
          ...reacted.map(
            (p) =>
              `[${reactionFor(p.id) === "yes" ? "APPROVED" : "REJECTED"}] ${p.name}\n${serialiseProfile(p)}`,
          ),
        ].join("\n")
      : "Per-candidate reactions: none this round.",
    "",
    shownProfiles.length
      ? `Candidates on screen when they gave this feedback, in rank order: ${shownProfiles
          .map((p, i) => `${i + 1}. ${p.name} (${p.id})`)
          .join(", ")}`
      : "",
    "",
    feedback
      ? `What the recruiter said:\n"""\n${feedback}\n"""`
      : "The recruiter gave no written feedback — work from the reactions alone.",
  ]
    .filter(Boolean)
    .join("\n");
};
