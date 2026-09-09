"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  APPLICATIONS,
  CANDIDATES,
  GOALS,
  MATCH_WEIGHTS,
  MEETINGS_BY_MONTH,
  PAIRS,
  SESSIONS,
} from "@/components/institutions/demo";
import { cn, MiniBar, StatusChip } from "@/components/institutions/frame";

const STATUS_TONE = {
  submitted: "warn",
  approved: "ok",
  waitlisted: "neutral",
  rejected: "danger",
} as const;

export function MatchingConsole() {
  const [selected, setSelected] = useState(0);
  const pair = CANDIDATES[selected] ?? CANDIDATES[0];
  const weights = useMemo(
    () =>
      pair
        ? MATCH_WEIGHTS.map((w) => ({
            ...w,
            score: pair.breakdown[w.key as keyof typeof pair.breakdown],
          }))
        : [],
    [pair],
  );
  if (!pair) return null;

  return (
    <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.9fr)]">
      <div className="border-b border-line p-4 sm:p-5 lg:border-r lg:border-b-0">
        <p className="text-[11px] font-medium tracking-[0.12em] text-faint uppercase">
          Reviewer queue
        </p>
        <h3 className="mt-1 font-display text-xl font-normal">Reviewers select the match</h3>
        <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-muted">
          Scores are computed on identity, specialty, and needs — then constrained by
          track. Nothing activates until a reviewer approves.
        </p>
        <ul className="mt-4 space-y-2">
          {CANDIDATES.map((c, i) => (
            <li key={c.mentor + c.mentee}>
              <button
                type="button"
                onClick={() => setSelected(i)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.99]",
                  i === selected
                    ? "border-gold bg-gold-soft"
                    : "border-line bg-paper hover:bg-canvas",
                )}
              >
                <span>
                  <span className="block text-[13px] font-medium text-ink">
                    {c.mentor}
                    <span className="mx-1.5 text-faint">→</span>
                    {c.mentee}
                  </span>
                  <span className="text-[11px] text-muted">{c.track}</span>
                </span>
                <span className="font-display text-xl tabular text-ink">{c.score}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="bg-canvas/50 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] tracking-wide text-faint uppercase">Compatibility</p>
          <span className="font-display text-3xl tabular">{pair.score}</span>
        </div>
        <ol className="mt-4 space-y-3">
          {weights.map((w) => (
            <li key={w.key}>
              <div className="mb-1 flex justify-between text-[12px]">
                <span className="text-ink">
                  {w.label}
                  <span className="ml-1.5 text-faint">{w.weight}%</span>
                </span>
                <span className="tabular text-muted">{w.score}</span>
              </div>
              <MiniBar value={w.score} />
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[11px] text-muted">
          Overlap: {pair.overlap.join(" · ")}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="inline-flex min-h-10 items-center rounded-lg bg-gold px-3 text-[12px] font-semibold text-gold-fg">
            Select pair
          </span>
          <span className="inline-flex min-h-10 items-center rounded-lg border border-line px-3 text-[12px] font-medium text-muted">
            Activate after approval
          </span>
        </div>
      </div>
    </div>
  );
}

export function YearShowcase() {
  return (
    <div className="grid gap-0 lg:grid-cols-2">
      <div className="border-b border-line p-4 sm:p-5 lg:border-r lg:border-b-0">
        <p className="text-[11px] font-medium tracking-[0.12em] text-faint uppercase">
          01  Recruit & review
        </p>
        <h3 className="mt-1 font-display text-xl font-normal">Applications</h3>
        <ul className="mt-3 space-y-2">
          {APPLICATIONS.slice(0, 3).map((row) => (
            <li
              key={row.name}
              className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5"
            >
              <span>
                <span className="block text-[13px] font-medium text-ink">{row.name}</span>
                <span className="text-[11px] text-muted">
                  {row.role} · {row.track}
                </span>
              </span>
              <StatusChip tone={STATUS_TONE[row.status]}>{row.status}</StatusChip>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-b border-line p-4 sm:p-5">
        <p className="text-[11px] font-medium tracking-[0.12em] text-faint uppercase">
          02  Match & engage
        </p>
        <h3 className="mt-1 font-display text-xl font-normal">The pair record</h3>
        <ul className="mt-3 space-y-2">
          {SESSIONS.slice(0, 2).map((s) => (
            <li
              key={s.pair}
              className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5"
            >
              <span>
                <span className="block text-[13px] font-medium">{s.pair}</span>
                <span className="text-[11px] text-muted">
                  {s.when} · {s.mode}
                </span>
              </span>
              <StatusChip tone={s.status === "Needs log" ? "warn" : "ok"}>{s.status}</StatusChip>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          {GOALS[0]?.pair}: {GOALS[0]?.title}
        </p>
      </div>
      <div className="p-4 sm:p-5 lg:col-span-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium tracking-[0.12em] text-faint uppercase">
              03  Measure & report
            </p>
            <h3 className="mt-1 font-display text-xl font-normal">Meetings this year</h3>
          </div>
          <p className="text-[12px] text-muted">CSV + printable summary</p>
        </div>
        <div className="mt-2 h-24" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={MEETINGS_BY_MONTH} barCategoryGap="28%">
              <XAxis
                dataKey="month"
                tick={{ fill: "var(--color-faint)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip
                cursor={{ fill: "rgba(20,21,26,0.04)" }}
                contentStyle={{
                  background: "var(--color-paper)",
                  border: "1px solid var(--color-line)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" fill="var(--color-gold)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-3 flex flex-wrap gap-2">
          {PAIRS.slice(0, 3).map((p) => (
            <li
              key={p.mentor}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-canvas px-3 py-1 text-[12px]"
            >
              <span className="text-ink">
                {p.mentor} · {p.mentee}
              </span>
              <span className="tabular text-muted">{p.meetings}</span>
              {p.quiet ? <StatusChip tone="warn">Quiet</StatusChip> : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
