"use client";

import { Button, cx } from "./ui";

const EXAMPLES = [
  "RDS developers with 4-7 years of experience who have worked at startups, for a role based in Bangalore.",
  "Senior frontend engineer in Europe, strong React and design sense, ideally from a scaleup.",
  "Data engineer for a payments team — Python and warehouse work, 5+ years, India or remote.",
];

export function HeroSearch({
  query,
  onQueryChange,
  onSubmit,
  poolSize,
  model,
  busy,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
  poolSize: number;
  model: string;
  busy: boolean;
}) {
  const canSubmit = query.trim().length > 2 && !busy;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-12">
      <div className="animate-rise">
        <div className="text-[11px] font-medium uppercase tracking-[0.15em] text-ink-faint">
          Sourcing · {poolSize} profiles in the talent map
        </div>
        <h1 className="mt-3 font-display text-[44px] leading-[1.05] tracking-tight text-ink sm:text-[52px]">
          Who are you looking for?
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-soft">
          Describe the role the way you would type it into Google. You will get
          filters you can see, a rubric you can argue with, and a shortlist you can
          correct until it is right.
        </p>
      </div>

      <div className="animate-rise mt-7 rounded-2xl border border-line bg-surface p-2 shadow-[0_2px_16px_rgba(22,22,26,0.05)]">
        <textarea
          autoFocus
          value={query}
          disabled={busy}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && canSubmit) {
              event.preventDefault();
              onSubmit();
            }
          }}
          rows={3}
          placeholder="RDS developers with 4-7 years of experience who have worked at startups, for a role based in Bangalore."
          className={cx(
            "w-full resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed",
            "placeholder:text-ink-faint focus:outline-none",
          )}
        />
        <div className="flex items-center justify-between gap-3 px-3 pb-1.5 pt-1">
          <span className="text-[12px] text-ink-faint">⌘↵ to search</span>
          <Button variant="primary" onClick={onSubmit} disabled={!canSubmit}>
            {busy ? "Searching…" : "Find candidates"}
          </Button>
        </div>
      </div>

      <div className="animate-rise mt-6">
        <div className="text-[11px] uppercase tracking-wider text-ink-faint">
          Try one of these
        </div>
        <div className="mt-2 space-y-1.5">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              disabled={busy}
              onClick={() => onQueryChange(example)}
              className={cx(
                "block w-full rounded-lg border border-line bg-surface px-3 py-2 text-left text-[13px] leading-relaxed text-ink-soft",
                "transition-colors hover:border-ink-faint hover:text-ink disabled:opacity-50",
              )}
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-8 text-[12px] text-ink-faint">
        Every search makes real calls to{" "}
        <span className="font-mono text-[11.5px]">{model}</span>. Nothing here is
        pre-computed.
      </p>
    </div>
  );
}
