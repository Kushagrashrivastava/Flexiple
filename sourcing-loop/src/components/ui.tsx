import type { ReactNode } from "react";

/** Shared primitives. Small on purpose — the app has one visual vocabulary. */

export function cx(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(" ");
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-medium uppercase tracking-[0.13em] text-ink-faint">
      {children}
    </div>
  );
}

export function Chip({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "strong" | "possible" | "weak" | "danger" | "outline";
  title?: string;
}) {
  const tones = {
    neutral: "bg-sunken text-ink-soft border-transparent",
    outline: "bg-surface text-ink-soft border-line",
    accent: "bg-accent-soft text-accent border-accent-line",
    strong: "bg-strong-soft text-strong border-transparent",
    possible: "bg-possible-soft text-possible border-transparent",
    weak: "bg-weak-soft text-weak border-transparent",
    danger: "bg-danger-soft text-danger border-transparent",
  } as const;

  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-[3px] text-[12px] leading-4",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  size = "md",
  disabled,
  type = "button",
  title,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
  className?: string;
}) {
  const variants = {
    primary:
      "bg-ink text-canvas border-ink hover:bg-[#2c2c32] disabled:bg-ink-faint disabled:border-ink-faint",
    secondary:
      "bg-surface text-ink border-line-strong hover:border-ink-faint hover:bg-sunken",
    ghost: "bg-transparent text-ink-soft border-transparent hover:bg-sunken",
    danger: "bg-surface text-danger border-line-strong hover:bg-danger-soft",
  } as const;

  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" ? "px-2.5 py-1.5 text-[13px]" : "px-3.5 py-2 text-sm",
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(22,22,26,0.04)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Weight 1–5 as filled dots. Reads faster than a number in a list. */
export function WeightDots({ weight }: { weight: number }) {
  return (
    <span className="inline-flex items-center gap-[3px]" title={`Weight ${weight} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={cx(
            "h-[5px] w-[5px] rounded-full",
            n <= weight ? "bg-accent" : "bg-line-strong",
          )}
        />
      ))}
    </span>
  );
}

export function EmptyValue() {
  return <span className="text-ink-faint">Any</span>;
}
