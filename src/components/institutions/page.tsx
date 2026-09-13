"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowDown, Menu, X } from "lucide-react";
import { cn } from "@/components/institutions/cn";
import { EXAMPLE_PROGRAM, HERO_FACTS, VERSUS } from "@/components/institutions/demo";
import { Mark, WindowFrame } from "@/components/institutions/frame";
import {
  MatchingConsole,
  YearShowcase,
} from "@/components/institutions/console";
import { ContactForm } from "@/components/institutions/contact-form";

const NAV = [
  { href: "#why", label: "Why AP MED" },
  { href: "#product", label: "Product" },
  { href: "#for", label: "For programs" },
];

const HOME_LINK = { href: "/", label: "Main site" };

const kicker = "text-[12px] font-semibold tracking-[0.16em] text-gold-dark uppercase";

const YEAR = [
  {
    n: "01",
    title: "Recruit & review",
    body: "Role- and track-specific applications. Your staff approve, waitlist, or reject. Nothing auto-enrolls.",
  },
  {
    n: "02",
    title: "Match & engage",
    body: "Reviewers select the pair. Then sessions, two-sided logs, goals, and a digest live on the same record.",
  },
  {
    n: "03",
    title: "Measure & report",
    body: "Active pairs, quiet members, CSV export, and a printable summary. The software does not invent outcomes.",
  },
] as const;

export function LandingPage() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-gold focus:px-3 focus:py-2 focus:text-gold-fg"
      >
        Skip to content
      </a>
      <SiteNav />
      <main id="main">
        <Hero />
        <Why />
        <Product />
        <ForPrograms />
        <Contact />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteNav() {
  const [open, setOpen] = useState(false);
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const main = document.getElementById("main");
    const footer = document.querySelector("footer");
    if (open) {
      main?.setAttribute("inert", "");
      footer?.setAttribute("inert", "");
    } else {
      main?.removeAttribute("inert");
      footer?.removeAttribute("inert");
    }
    return () => {
      document.body.style.overflow = "";
      main?.removeAttribute("inert");
      footer?.removeAttribute("inert");
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        document.getElementById("menu-toggle")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-[background-color,box-shadow] duration-200",
        solid || open ? "bg-canvas/95 shadow-(--shadow-border) backdrop-blur-md" : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:h-[4.25rem] sm:px-8">
        <a
          href={HOME_LINK.href}
          aria-label="AP MED home"
          className="flex items-center gap-2.5 text-ink"
          onClick={() => setOpen(false)}
        >
          <span className="text-gold-dark">
            <Mark />
          </span>
          <span className="wordmark text-[1.65rem] leading-none">AP MED</span>
        </a>
        <nav aria-label="Primary" className="hidden items-center gap-7 text-[14px] text-muted lg:flex">
          <a href={HOME_LINK.href} className="text-gold-dark transition-colors duration-150 hover:text-ink">
            {HOME_LINK.label}
          </a>
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="transition-colors duration-150 hover:text-ink">
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a
            href="#talk"
            className="hidden min-h-10 items-center rounded-lg bg-gold px-3.5 text-[13px] font-semibold text-gold-fg transition-transform duration-150 ease-out active:scale-[0.96] sm:inline-flex"
          >
            Ask about your year
          </a>
          <button
            type="button"
            id="menu-toggle"
            className="inline-flex size-11 items-center justify-center rounded-lg lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open ? (
        <div id="mobile-menu" className="border-t border-line bg-canvas px-5 py-4 lg:hidden">
          <nav aria-label="Mobile" className="flex flex-col">
            <a
              href={HOME_LINK.href}
              className="flex min-h-12 items-center text-[16px] text-gold-dark"
              onClick={() => setOpen(false)}
            >
              {HOME_LINK.label}
            </a>
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="flex min-h-12 items-center text-[16px] text-ink"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <a
              href="#talk"
              className="mt-2 inline-flex min-h-12 items-center justify-center rounded-lg bg-gold text-[15px] font-semibold text-gold-fg"
              onClick={() => setOpen(false)}
            >
              Ask about your year
            </a>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="institutionHero mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pt-16 lg:pb-20 lg:pt-20">
      <p className={kicker}>Mentorship infrastructure</p>
      <h1 className="mt-5 max-w-[20ch] font-display text-[clamp(2.5rem,6.4vw,5rem)] font-normal leading-[0.96] tracking-[-0.035em] text-ink">
        One system to <span className="mark">run</span>
        <br />
        a mentorship year.
      </h1>
      <p className="mt-6 max-w-[38rem] text-[clamp(1.05rem,2vw,1.25rem)] leading-[1.6] text-muted">
        Organizations use AP MED to recruit, match, engage, and measure a
        structured program — instead of forms, spreadsheets, calendars, and inboxes.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <a
          href="#talk"
          className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-gold px-5 text-[15px] font-semibold text-gold-fg transition-transform duration-150 ease-out active:scale-[0.96]"
        >
          Ask if this can run your year
          <ArrowRight className="size-4" />
        </a>
        <a
          href="#product"
          className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-line bg-paper px-5 text-[15px] font-medium text-ink transition-transform duration-150 ease-out active:scale-[0.96]"
        >
          See the product
          <ArrowDown className="size-4" />
        </a>
      </div>
      <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {HERO_FACTS.map((fact, i) => (
          <li key={fact.label} className="rounded-xl border border-line bg-paper px-4 py-3">
            <p className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] font-semibold tracking-[0.12em] text-faint uppercase">
                {fact.label}
              </span>
              <span className="font-mono text-[11px] tabular text-faint">
                {String(i + 1).padStart(2, "0")}
              </span>
            </p>
            <p className="mt-1.5 text-[13px] leading-snug text-ink">{fact.value}</p>
          </li>
        ))}
      </ol>
      <div className="mt-12">
        <WindowFrame title="ap-med / matching" eyebrow={`Illustrative · ${EXAMPLE_PROGRAM.label}`}>
          <MatchingConsole />
        </WindowFrame>
        <p className="mt-3 text-[12px] text-faint">
          {EXAMPLE_PROGRAM.label} — a named program on AP MED. Figures are illustrative.
        </p>
      </div>
    </section>
  );
}

function Why() {
  return (
    <section id="why" className="border-y border-white/10 bg-ink text-paper">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <p className="text-[12px] font-semibold tracking-[0.16em] text-gold uppercase">Why AP MED</p>
        <h2 className="mt-4 max-w-[16ch] font-display text-[clamp(2rem,4.5vw,3.4rem)] text-paper">
          One operating system. Not a pile of tools.
        </h2>
        <div className="mt-10 overflow-hidden rounded-2xl border border-white/10">
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="border-b border-white/10 bg-[#161626] px-5 py-4 md:border-r md:border-b-0 md:px-7">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-paper/50 uppercase">
                How it usually runs
              </p>
            </div>
            <div className="border-b border-white/10 bg-[#252238] px-5 py-4 md:border-l-2 md:border-l-gold md:px-7">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-gold uppercase">
                How it runs on AP MED
              </p>
            </div>
          </div>
          {VERSUS.map((row) => (
            <div key={row.manual} className="grid grid-cols-1 md:grid-cols-2">
              <p className="border-t border-white/10 px-5 py-4 text-[14px] leading-relaxed text-paper/60 md:border-r md:px-7">
                <span className="mb-1 block text-[10px] font-semibold tracking-[0.12em] text-paper/45 uppercase md:hidden">
                  Usually
                </span>
                {row.manual}
              </p>
              <p className="border-t border-white/10 bg-[#211f31] px-5 py-4 text-[14px] leading-relaxed text-paper md:border-l-2 md:border-l-gold md:px-7">
                <span className="mb-1 block text-[10px] font-semibold tracking-[0.12em] text-gold uppercase md:hidden">
                  On AP MED
                </span>
                {row.platform}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Product() {
  return (
    <section id="product" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
      <p className={kicker}>Product</p>
      <h2 className="mt-4 max-w-[16ch] font-display text-[clamp(2rem,4.5vw,3.4rem)]">
        The year, in the console.
      </h2>
      <p className="mt-5 max-w-[36rem] text-[17px] leading-relaxed text-muted">
        Workflows that exist on AP MED, shown as {EXAMPLE_PROGRAM.label}.
        Your program would appear the same way — under its own name.
      </p>
      <ol className="mt-8 grid gap-5 sm:grid-cols-3">
        {YEAR.map((item) => (
          <li key={item.n}>
            <p className="font-mono text-[11px] text-faint">{item.n}</p>
            <h3 className="mt-1.5 text-[16px] font-semibold tracking-tight text-ink">{item.title}</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{item.body}</p>
          </li>
        ))}
      </ol>
      <WindowFrame
        className="mt-6"
        title="ap-med / year"
        eyebrow={`Illustrative · ${EXAMPLE_PROGRAM.label}`}
      >
        <YearShowcase />
      </WindowFrame>
    </section>
  );
}

function ForPrograms() {
  return (
    <section id="for" className="border-y border-line bg-paper">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <p className={kicker}>For programs</p>
        <h2 className="mt-4 max-w-[18ch] font-display text-[clamp(2rem,4.5vw,3.4rem)]">
          Built for the person accountable for the year.
        </h2>
        <p className="mt-5 max-w-[40rem] text-[17px] leading-relaxed text-muted">
          Structured cohorts — universities, medical pipeline programs, student
          organizations, professional associations — that currently assemble a
          year from forms and a spreadsheet. Reviewers stay in control. Mentoring
          still happens in the room. AP MED holds the operating record.
        </p>
        <div className="mt-10 grid gap-3 md:grid-cols-3">
          <article className="rounded-2xl border border-line border-t-2 border-t-gold bg-canvas p-5">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-faint uppercase">
              Isolated membership
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-ink">
              Cohort members stay inside the program. They are not mixed into
              AP MED’s public student directory.
            </p>
          </article>
          <article className="rounded-2xl border border-line border-t-2 border-t-gold bg-canvas p-5">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-faint uppercase">
              Provisioned
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-ink">
              No checkout, no public rate card. We stand the cohort up with you
              after a fit conversation — including gaps.
            </p>
          </article>
          <article className="rounded-2xl border border-line border-t-2 border-t-gold bg-canvas p-5">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-faint uppercase">
              Stood up with you
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-ink">
              Your program’s name, tracks, applications, and reviewers — configured
              as a provisioned cohort on AP MED, not a self-serve checkout.
            </p>
          </article>
        </div>
        <p className="mt-8 max-w-[44rem] text-[15px] leading-relaxed text-muted">
          AP MED is the company and the platform. Programs keep their own names.{" "}
          {EXAMPLE_PROGRAM.label} is one such year — not a second product. The
          student-facing directory lives at{" "}
          <Link
            className="text-ink underline decoration-line underline-offset-4"
            href="/"
          >
            ap-med.org
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section id="talk" className="bg-ink text-paper">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <p className="text-[12px] font-semibold tracking-[0.16em] text-gold uppercase">
            Fit conversation
          </p>
          <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3.2rem)] text-paper">
            If you operate a cohort, tell us how the year runs.
          </h2>
          <p className="mt-5 max-w-[38ch] text-[16px] leading-relaxed text-paper/70">
            Tell us the program you operate. Fit, timing, and constraints belong
            in the conversation that follows.
          </p>
          <p className="mt-6 max-w-[38ch] text-[14px] leading-relaxed text-paper/55">
            The form opens a message to apmedpodcast@gmail.com. There is no separate
            sales inbox.
          </p>
        </div>
        <div className="rounded-2xl bg-canvas p-5 text-ink sm:p-8">
          <ContactForm />
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="bg-ink text-paper">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-12 sm:px-8 lg:flex-row lg:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-gold">
              <Mark />
            </span>
            <span className="wordmark text-[1.65rem] leading-none">AP MED</span>
          </div>
          <p className="mt-3 max-w-[32ch] text-[14px] leading-relaxed text-paper/65">
            Mentorship infrastructure for structured programs. Provisioned with
            you — not sold at checkout.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-10 text-[14px] sm:grid-cols-3">
          <FooterCol title="On this page" links={NAV} />
          <FooterCol
            title="AP MED"
            links={[
              { href: "/", label: "Student-facing site" },
              { href: "/institutions", label: "For programs" },
              { href: "mailto:apmedpodcast@gmail.com", label: "apmedpodcast@gmail.com" },
            ]}
          />
          <FooterCol
            title="For directors"
            links={[
              { href: "#product", label: "Product" },
              { href: "#for", label: "For programs" },
              { href: "#talk", label: "Ask about your year" },
            ]}
          />
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-5 py-6 text-[12px] text-paper/50 sm:px-8">
          © {new Date().getFullYear()} AP MED. Console views show {EXAMPLE_PROGRAM.label} as
          one named program on the platform.
        </p>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string; external?: boolean }[];
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.14em] text-gold uppercase">{title}</p>
      <ul className="mt-3 space-y-2">
        {links.map((link) => (
          <li key={link.href + link.label}>
            {link.href.startsWith("/") ? (
              <Link
                href={link.href}
                className="text-paper/85 transition-opacity duration-150 hover:opacity-70"
              >
                {link.label}
              </Link>
            ) : (
              <a
                href={link.href}
                className="text-paper/85 transition-opacity duration-150 hover:opacity-70"
                {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {link.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
