import type { ReactNode } from "react";
import { cn } from "@/components/institutions/cn";

export function WindowFrame({
  title = "Program console",
  eyebrow = "Illustrative data",
  children,
  className,
}: {
  title?: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-2xl bg-paper shadow-(--shadow-lift)",
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="size-2 rounded-full bg-gold" />
          <span className="size-2 rounded-full bg-mist" />
          <span className="size-2 rounded-full bg-mist" />
        </div>
        <figcaption className="min-w-0 flex-1 text-[11px] font-medium tracking-wide text-muted">
          {title}
          <span className="mx-2 text-line">·</span>
          <span className="font-normal text-faint">{eyebrow}</span>
        </figcaption>
      </div>
      <div className="bg-paper">{children}</div>
    </figure>
  );
}

export function StatusChip({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "ok" | "warn" | "danger" | "accent";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-chip text-muted",
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    accent: "bg-gold-soft text-ink",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function MiniBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-mist">
      <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Mark() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="size-5"
      fill="none"
      aria-hidden="true"
    >
      <rect x="2" y="13" width="4" height="5" rx="1" fill="currentColor" opacity="0.4" />
      <rect x="8" y="8" width="4" height="10" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="14" y="3" width="4" height="15" rx="1" fill="currentColor" />
    </svg>
  );
}
