import type { FitRubric, ObjectiveFilters } from "./schemas";

/**
 * "What changed" is computed here, by comparing the plan before and after.
 * Only the *reason* for a change comes from the model. That way the recruiter
 * can trust the change log even if the model narrates itself badly.
 */

export type PlanChange = {
  area: "filters" | "rubric";
  label: string;
  before: string;
  after: string;
  direction: "widened" | "narrowed" | "changed";
  /**
   * Which row to flag in the plan rail, when that differs from the label shown
   * in the thread. "New criterion" reads better in the change log; the rail
   * needs the criterion's actual name to find the row.
   */
  highlight?: string;
};

const listOf = (values: string[]) => (values.length ? values.join(", ") : "any");

const yearsOf = (f: ObjectiveFilters) => {
  if (f.min_years === null && f.max_years === null) return "any";
  if (f.min_years !== null && f.max_years !== null)
    return `${f.min_years}–${f.max_years} yrs`;
  if (f.min_years !== null) return `${f.min_years}+ yrs`;
  return `up to ${f.max_years} yrs`;
};

const span = (f: ObjectiveFilters) =>
  (f.max_years ?? 50) - (f.min_years ?? 0);

export function diffFilters(
  before: ObjectiveFilters,
  after: ObjectiveFilters,
): PlanChange[] {
  const changes: PlanChange[] = [];

  const listFields: {
    key: keyof ObjectiveFilters;
    label: string;
  }[] = [
    { key: "required_skills", label: "Required skills" },
    { key: "preferred_skills", label: "Preferred skills" },
    { key: "locations", label: "Location" },
    { key: "company_types", label: "Company background" },
    { key: "title_keywords", label: "Title" },
    { key: "exclude_title_keywords", label: "Excluded titles" },
  ];

  for (const { key, label } of listFields) {
    const a = before[key] as string[];
    const b = after[key] as string[];
    if (a.join("|") === b.join("|")) continue;
    changes.push({
      area: "filters",
      label,
      before: listOf(a),
      after: listOf(b),
      // Preferred skills feed the rubric and never exclude anyone, so growing
      // that list is not a narrowing — labelling it one would misdescribe the
      // effect on the pool.
      direction:
        key === "preferred_skills" || b.length === a.length
          ? "changed"
          : key === "exclude_title_keywords"
            ? b.length > a.length
              ? "narrowed"
              : "widened"
            : b.length > a.length
              ? "narrowed"
              : "widened",
    });
  }

  if (yearsOf(before) !== yearsOf(after)) {
    changes.push({
      area: "filters",
      label: "Years of experience",
      before: yearsOf(before),
      after: yearsOf(after),
      direction: span(after) > span(before) ? "widened" : "narrowed",
    });
  }

  if (before.company_type_scope !== after.company_type_scope) {
    changes.push({
      area: "filters",
      label: "Company match",
      before: before.company_type_scope === "current" ? "works there now" : "ever worked there",
      after: after.company_type_scope === "current" ? "works there now" : "ever worked there",
      direction: after.company_type_scope === "current" ? "narrowed" : "widened",
    });
  }

  return changes;
}

export function diffRubric(before: FitRubric, after: FitRubric): PlanChange[] {
  const changes: PlanChange[] = [];
  const beforeByName = new Map(before.criteria.map((c) => [c.name, c]));
  const afterByName = new Map(after.criteria.map((c) => [c.name, c]));

  for (const criterion of after.criteria) {
    const previous = beforeByName.get(criterion.name);
    if (!previous) {
      changes.push({
        area: "rubric",
        label: "New criterion",
        before: "—",
        after: `${criterion.name} (weight ${criterion.weight}/5)`,
        direction: "changed",
        highlight: criterion.name,
      });
      continue;
    }
    if (previous.weight !== criterion.weight) {
      changes.push({
        area: "rubric",
        label: criterion.name,
        before: `weight ${previous.weight}/5`,
        after: `weight ${criterion.weight}/5`,
        direction: criterion.weight > previous.weight ? "narrowed" : "widened",
      });
    } else if (previous.description !== criterion.description) {
      changes.push({
        area: "rubric",
        label: criterion.name,
        before: "reworded",
        after: criterion.description,
        direction: "changed",
      });
    }
  }

  for (const criterion of before.criteria) {
    if (!afterByName.has(criterion.name)) {
      changes.push({
        area: "rubric",
        label: "Dropped criterion",
        before: criterion.name,
        after: "—",
        direction: "changed",
      });
    }
  }

  if (before.role_summary !== after.role_summary) {
    changes.push({
      area: "rubric",
      label: "Role summary",
      before: before.role_summary,
      after: after.role_summary,
      direction: "changed",
    });
  }

  return changes;
}
