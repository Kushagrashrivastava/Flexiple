"use client";

import type { FitRubric, ObjectiveFilters } from "@/lib/schemas";
import { Card, Chip, EmptyValue, SectionLabel, WeightDots } from "./ui";

/**
 * The filters and rubric are always on screen. The recruiter should never have
 * to wonder what the search currently believes.
 */

function yearsLabel(filters: ObjectiveFilters) {
  const { min_years: min, max_years: max } = filters;
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return `${min}–${max} years`;
  if (min !== null) return `${min}+ years`;
  return `Up to ${max} years`;
}

function Row({
  label,
  values,
  tone = "neutral",
  highlight,
}: {
  label: string;
  values: string[];
  tone?: "neutral" | "accent" | "outline" | "danger";
  highlight?: boolean;
}) {
  return (
    <div className={highlight ? "-mx-2 rounded-lg bg-accent-soft/60 px-2 py-1" : undefined}>
      <div className="text-[11px] uppercase tracking-wider text-ink-faint">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {values.length === 0 ? (
          <EmptyValue />
        ) : (
          values.map((value) => (
            <Chip key={value} tone={tone}>
              {value}
            </Chip>
          ))
        )}
      </div>
    </div>
  );
}

export function FiltersCard({
  filters,
  changedLabels = [],
}: {
  filters: ObjectiveFilters;
  changedLabels?: string[];
}) {
  const years = yearsLabel(filters);
  const changed = (label: string) => changedLabels.includes(label);

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between">
        <SectionLabel>Objective filters</SectionLabel>
        <span className="text-[11px] text-ink-faint">applied in code</span>
      </div>

      <div className="mt-3 space-y-3">
        <Row
          label="Required skills"
          values={filters.required_skills}
          tone="accent"
          highlight={changed("Required skills")}
        />
        <Row
          label="Preferred skills"
          values={filters.preferred_skills}
          tone="outline"
          highlight={changed("Preferred skills")}
        />
        <Row
          label="Experience"
          values={years ? [years] : []}
          highlight={changed("Years of experience")}
        />
        <Row
          label="Location"
          values={filters.locations}
          highlight={changed("Location")}
        />
        <Row
          label={
            filters.company_type_scope === "current"
              ? "Company (currently)"
              : "Company (ever worked at)"
          }
          values={filters.company_types}
          highlight={changed("Company background") || changed("Company match")}
        />
        <Row label="Title" values={filters.title_keywords} highlight={changed("Title")} />
        {filters.exclude_title_keywords.length > 0 && (
          <Row
            label="Excluded titles"
            values={filters.exclude_title_keywords}
            tone="danger"
            highlight={changed("Excluded titles")}
          />
        )}
      </div>
    </Card>
  );
}

export function RubricCard({
  rubric,
  changedLabels = [],
}: {
  rubric: FitRubric;
  changedLabels?: string[];
}) {
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between">
        <SectionLabel>Fit rubric</SectionLabel>
        <span className="text-[11px] text-ink-faint">applied by the model</span>
      </div>

      <p className="mt-2.5 text-[13px] leading-relaxed text-ink-soft">
        {rubric.role_summary}
      </p>

      <ul className="mt-3 space-y-2.5">
        {rubric.criteria.map((criterion) => (
          <li
            key={criterion.name}
            className={
              changedLabels.includes(criterion.name)
                ? "-mx-2 rounded-lg bg-accent-soft/60 px-2 py-1.5"
                : undefined
            }
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-ink">{criterion.name}</span>
              <WeightDots weight={criterion.weight} />
            </div>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft">
              {criterion.description}
            </p>
            {criterion.signals.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {criterion.signals.map((signal) => (
                  <Chip key={signal} tone="outline">
                    {signal}
                  </Chip>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      {rubric.red_flags.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="text-[11px] uppercase tracking-wider text-ink-faint">
            Red flags
          </div>
          <ul className="mt-1 space-y-0.5">
            {rubric.red_flags.map((flag) => (
              <li key={flag} className="text-[12.5px] text-ink-soft">
                · {flag}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
