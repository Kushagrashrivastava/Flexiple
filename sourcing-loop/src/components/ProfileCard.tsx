"use client";

import { useState } from "react";
import type { Match } from "@/lib/pipeline";
import { Button, Card, Chip, cx } from "./ui";

const VERDICT = {
  strong: { label: "Strong match", tone: "strong", bar: "bg-strong" },
  possible: { label: "Possible", tone: "possible", bar: "bg-possible" },
  weak: { label: "Weak", tone: "weak", bar: "bg-weak" },
  unscored: { label: "Not scored", tone: "danger", bar: "bg-line-strong" },
} as const;

const FIELD_LABELS: Record<string, string> = {
  current_title: "title",
  years_experience: "experience",
  location: "location",
  current_company: "company",
  current_company_type: "company type",
  skills: "skills",
  past_companies: "past roles",
  education: "education",
  summary: "summary",
};

export function ProfileCard({
  match,
  rank,
  reaction,
  onReact,
  readOnly = false,
}: {
  match: Match;
  rank: number;
  reaction?: "yes" | "no";
  onReact?: (reaction: "yes" | "no") => void;
  readOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { profile } = match;
  const verdict = VERDICT[match.verdict];

  return (
    <Card
      className={cx(
        "animate-rise overflow-hidden transition-colors",
        reaction === "yes" && "border-strong/40 bg-strong-soft/30",
        reaction === "no" && "border-line bg-sunken/60 opacity-70",
      )}
    >
      <div className="flex gap-4 p-4">
        {/* Score column */}
        <div className="flex w-12 shrink-0 flex-col items-center gap-1.5 pt-0.5">
          <div className="font-mono text-[19px] leading-none tabular-nums text-ink">
            {match.score ?? "—"}
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-sunken">
            <div
              className={cx("h-full rounded-full", verdict.bar)}
              style={{ width: `${match.score ?? 0}%` }}
            />
          </div>
          <div className="text-[10px] uppercase tracking-wider text-ink-faint">
            #{rank}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="text-[15px] font-semibold text-ink">{profile.name}</h3>
            <Chip tone={verdict.tone}>{verdict.label}</Chip>
            {reaction === "yes" && <Chip tone="strong">You approved</Chip>}
            {reaction === "no" && <Chip tone="outline">You rejected</Chip>}
          </div>

          <p className="mt-1 text-[13px] text-ink-soft">
            {profile.current_title} at {profile.current_company}
            <span className="text-ink-faint">
              {" "}
              · {profile.current_company_type} · {profile.location} ·{" "}
              {profile.years_experience} yrs
            </span>
          </p>

          <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink">
            {match.headline}
          </p>

          {match.evidence.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {match.evidence.map((item, index) => (
                <li key={index} className="flex gap-2 text-[13px] leading-relaxed">
                  <span className="mt-[3px] shrink-0 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                    {FIELD_LABELS[item.field] ?? item.field}
                  </span>
                  <span className="min-w-0 text-ink-soft">
                    <span className="rounded bg-accent-soft px-1 py-px font-medium text-accent">
                      {item.value}
                    </span>{" "}
                    — {item.why}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {match.evidence.length === 0 && match.verdict !== "unscored" && (
            <p className="mt-3 rounded-lg border border-dashed border-line-strong px-2.5 py-2 text-[12.5px] text-ink-faint">
              The model&apos;s explanation could not be traced to this profile, so it
              was withheld. The score stands, the reasoning does not.
            </p>
          )}

          {match.concerns.length > 0 && (
            <p className="mt-2.5 text-[12.5px] text-possible">
              <span className="font-medium">Watch:</span> {match.concerns.join(" · ")}
            </p>
          )}

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            {!readOnly && onReact && (
              <>
                <Button
                  size="sm"
                  variant={reaction === "yes" ? "primary" : "secondary"}
                  onClick={() => onReact("yes")}
                  title="Tell the search this is the kind of person you want"
                >
                  Yes
                </Button>
                <Button
                  size="sm"
                  variant={reaction === "no" ? "primary" : "secondary"}
                  onClick={() => onReact("no")}
                  title="Tell the search this one misses"
                >
                  No
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Hide full profile" : "Full profile"}
            </Button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="animate-rise border-t border-line bg-sunken/50 px-4 py-3.5 text-[13px]">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-[11px] uppercase tracking-wider text-ink-faint">
                Skills
              </dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {profile.skills.map((skill) => (
                  <Chip key={skill} tone="outline">
                    {skill}
                  </Chip>
                ))}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] uppercase tracking-wider text-ink-faint">
                Past companies
              </dt>
              <dd className="mt-1 space-y-0.5 text-ink-soft">
                {profile.past_companies.length === 0 && <span>None listed</span>}
                {profile.past_companies.map((company, index) => (
                  <div key={index}>
                    {company.title} at {company.company}{" "}
                    <span className="text-ink-faint">
                      ({company.company_type}, {company.years}y)
                    </span>
                  </div>
                ))}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-ink-faint">
                Education
              </dt>
              <dd className="mt-1 text-ink-soft">{profile.education}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-ink-faint">
                Summary
              </dt>
              <dd className="mt-1 text-ink-soft">{profile.summary}</dd>
            </div>
          </dl>
        </div>
      )}
    </Card>
  );
}
