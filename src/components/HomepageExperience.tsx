"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ReliableTurnstile,
  type ReliableTurnstileHandle,
  type TurnstileStatus,
} from "@/components/ReliableTurnstile";
import { isValidEmail } from "@/lib/validate";
import styles from "./HomepageExperience.module.css";

type Signal = {
  title: string;
  weight: string;
};

const SIGNALS: Signal[] = [
  { title: "Identity / background", weight: "40%" },
  { title: "Specialty interests", weight: "35%" },
  { title: "Mentorship needs", weight: "25%" },
];

const SPOTIFY_SHOW_URL =
  "https://open.spotify.com/show/2CsWyH724wl7qHG1E6M3DB";

type WaitlistFeedback =
  | { kind: "error"; message: string; fieldInvalid: boolean }
  | { kind: "success"; message: string };

type WaitlistResponse = {
  status?: "joined" | "invalid_email" | "security_failed" | "error";
  message?: string;
};

function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<WaitlistFeedback | null>(null);
  const [turnstileStatus, setTurnstileStatus] =
    useState<TurnstileStatus>("loading");
  const turnstileToken = useRef<string | null>(null);
  const turnstileRef = useRef<ReliableTurnstileHandle | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setFeedback({
        kind: "error",
        message: "Enter your email address.",
        fieldInvalid: true,
      });
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      setFeedback({
        kind: "error",
        message: "Enter a valid email address.",
        fieldInvalid: true,
      });
      return;
    }

    const widgetExpired = turnstileRef.current?.isExpired() === true;
    if (
      !turnstileToken.current ||
      turnstileStatus !== "ready" ||
      widgetExpired
    ) {
      turnstileToken.current = null;
      setFeedback({
        kind: "error",
        message:
          turnstileStatus === "error"
            ? "The security check couldn’t load. Please try again."
            : "One moment—finishing the security check.",
        fieldInvalid: false,
      });
      if (widgetExpired || turnstileStatus === "error") {
        turnstileRef.current?.retry();
      }
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          turnstile_token: turnstileToken.current,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as WaitlistResponse;

      if (response.ok && payload.status === "joined") {
        setFeedback({
          kind: "success",
          message: "You’re on the list. We’ll keep you posted.",
        });
        return;
      }

      // Turnstile tokens are single-use. The server may have consumed this one
      // even when the request ultimately failed, so every retry starts fresh.
      turnstileToken.current = null;
      setTurnstileStatus("loading");
      turnstileRef.current?.reset();

      setFeedback({
        kind: "error",
        message:
          payload.status === "invalid_email"
            ? (payload.message ?? "Enter a valid email address.")
            : payload.status === "security_failed"
              ? "The security check expired. Please try again."
            : "Something went wrong. Please try again.",
        fieldInvalid: payload.status === "invalid_email",
      });
    } catch {
      turnstileToken.current = null;
      setTurnstileStatus("loading");
      turnstileRef.current?.reset();
      setFeedback({
        kind: "error",
        message: "Something went wrong. Please try again.",
        fieldInvalid: false,
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (feedback?.kind === "success") {
    return (
      <p className={styles.waitlistConfirmation} role="status" aria-live="polite">
        <span aria-hidden="true">✓</span>
        {feedback.message}
      </p>
    );
  }

  return (
    <form className={styles.waitlistForm} onSubmit={handleSubmit} noValidate>
      <label htmlFor="waitlist-email">Email address</label>
      <div className={styles.waitlistFields}>
        <input
          id="waitlist-email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (feedback) setFeedback(null);
          }}
          placeholder="you@example.com"
          autoComplete="email"
          autoCapitalize="none"
          inputMode="email"
          maxLength={200}
          spellCheck={false}
          aria-invalid={feedback?.kind === "error" && feedback.fieldInvalid}
          aria-describedby="waitlist-note waitlist-feedback"
          disabled={submitting}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Joining…" : "Join the waitlist"}
        </button>
      </div>
      <div className={styles.waitlistMeta}>
        <p id="waitlist-note">Email only. No account required.</p>
        <p
          id="waitlist-feedback"
          className={styles.waitlistFeedback}
          role={feedback?.kind === "error" ? "alert" : undefined}
          aria-live="polite"
        >
          {feedback?.kind === "error" ? feedback.message : ""}
        </p>
      </div>
      <div className={styles.waitlistSecurity}>
        <ReliableTurnstile
          ref={turnstileRef}
          siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
          appearance="interaction-only"
          onTokenChange={(token) => {
            turnstileToken.current = token;
          }}
          onStatusChange={setTurnstileStatus}
        />
        {turnstileStatus === "error" && (
          <button
            type="button"
            onClick={() => turnstileRef.current?.retry()}
          >
            Retry security check
          </button>
        )}
      </div>
    </form>
  );
}

function ProfileNode({
  name,
  role,
  initial,
  visible,
  align,
}: {
  name: string;
  role: string;
  initial: string;
  visible: boolean;
  align: "left" | "right";
}) {
  return (
    <article
      className={`${styles.profileNode} ${styles[align]} ${
        visible ? styles.visible : ""
      }`}
    >
      <div className={styles.profileMonogram} aria-hidden="true">
        {initial}
      </div>
      <div>
        <strong>{name}</strong>
        <span>{role}</span>
      </div>
    </article>
  );
}

function MatchingSignal({
  signal,
  index,
  step,
}: {
  signal: Signal;
  index: number;
  step: number;
}) {
  const activeStep = index + 2;
  const visible = step >= activeStep && step < 6;
  const complete = step > activeStep;

  return (
    <div
      className={`${styles.matchingSignal} ${visible ? styles.visible : ""} ${
        complete ? styles.complete : ""
      }`}
    >
      <span className={styles.signalNumber}>0{index + 1}</span>
      <strong>{signal.title}</strong>
      <b>{signal.weight}</b>
    </div>
  );
}

function ScoreReveal({ score, visible }: { score: number; visible: boolean }) {
  return (
    <div className={`${styles.scoreReveal} ${visible ? styles.visible : ""}`}>
      <span className={styles.scorePrelude}>Compatibility score</span>
      <div className={styles.scoreRing}>
        <strong aria-hidden="true">
          <span>{score}</span>
          <small>%</small>
        </strong>
      </div>
      <span className={styles.srOnly}>
        {score === 96
          ? "96% compatibility score"
          : "Calculating compatibility score"}
      </span>
    </div>
  );
}

function MatchingExperience() {
  const [run, setRun] = useState(0);
  const [step, setStep] = useState(0);
  const [score, setScore] = useState(0);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reducedMotion) {
      setScore(96);
      setStep(7);
      return;
    }

    setScore(0);
    setStep(0);

    const timeouts = [
      window.setTimeout(() => setStep(1), 350),
      window.setTimeout(() => setStep(2), 1050),
      window.setTimeout(() => setStep(3), 2050),
      window.setTimeout(() => setStep(4), 3050),
      window.setTimeout(() => setStep(5), 4200),
    ];
    let ticker: number | undefined;

    timeouts.push(
      window.setTimeout(() => {
        setStep(6);
        ticker = window.setInterval(() => {
          setScore((current) => Math.min(96, current + 3));
        }, 46);
      }, 4380),
      window.setTimeout(() => {
        if (ticker !== undefined) window.clearInterval(ticker);
        setScore(96);
        setStep(7);
      }, 6000),
    );

    return () => {
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
      if (ticker !== undefined) window.clearInterval(ticker);
    };
  }, [run]);

  return (
    <section className={styles.matchStage} aria-label="How AP MED creates a match">
      <p className={styles.stageLabel}>A match, in motion</p>
      <div className={styles.stageWorld}>
        <ProfileNode
          name="Maya"
          role="Pre-med student"
          initial="M"
          visible={step >= 1}
          align="left"
        />

        <div className={styles.signalsRail}>
          {SIGNALS.map((signal, index) => (
            <MatchingSignal
              key={signal.title}
              signal={signal}
              index={index}
              step={step}
            />
          ))}
          <ScoreReveal score={score} visible={step >= 6} />
        </div>

        <ProfileNode
          name="Dr. Alvarez"
          role="Family medicine"
          initial="A"
          visible={step >= 1}
          align="right"
        />
      </div>

      <div
        className={`${styles.matchResult} ${step >= 7 ? styles.visible : ""}`}
        aria-live="polite"
        aria-atomic="true"
      >
        {step >= 7 ? (
          <>
            <p>A match is only the beginning.</p>
            <button
              type="button"
              onClick={() => setRun((current) => current + 1)}
            >
              Replay the match <span aria-hidden="true">↻</span>
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}

export default function HomepageExperience({
  ascensoVisible,
}: {
  ascensoVisible: boolean;
}) {
  return (
    <div className={styles.homeShell}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroIntro}>
          <p className={styles.eyebrow}>
            Free <span>·</span> Identity-matched <span>·</span> Podcast-vetted
          </p>
          <h1 id="hero-title">
            Find a mentor who <em>actually gets</em> your story.
          </h1>
          <p className={styles.heroCopy}>
            AP MED makes thoughtful matches for underrepresented pre-med
            students—always free, always human.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryButton} href="/mentee-onboarding">
              Get Matched
            </Link>
            <Link className={styles.secondaryButton} href="/mentors">
              Browse Mentors
            </Link>
          </div>
        </div>

        <MatchingExperience />
      </section>

      <section className={styles.journey} aria-labelledby="journey-title">
        <div className={styles.journeyHeading}>
          <p className={styles.sectionKicker}>How it works</p>
          <h2 id="journey-title">Your story shapes the match.</h2>
        </div>
        <ol className={styles.journeySteps}>
          <li>
            <span>01</span>
            <div>
              <h3>Share what matters</h3>
              <p>
                Tell us about your identity, specialty interests, and mentorship
                needs.
              </p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>See your matches</h3>
              <p>
                Review mentors ranked using AP MED&apos;s transparent matching model.
              </p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>Request an introduction</h3>
              <p>Choose who feels right and send a mentorship request.</p>
            </div>
          </li>
        </ol>
      </section>

      <section className={styles.waitlist} aria-labelledby="waitlist-title">
        <div className={styles.waitlistCopy}>
          <p className={styles.sectionKicker}>AP MED Mentors</p>
          <h2 id="waitlist-title">Get early access to AP Med Mentors</h2>
          <p>
            We&apos;re opening the platform to more premeds soon. Join the
            waitlist and we&apos;ll let you know when you&apos;re in.
          </p>
        </div>
        <WaitlistForm />
      </section>

      {ascensoVisible && (
        <section className={styles.ascenso} aria-labelledby="ascenso-title">
          <p className={styles.sectionKicker}>Partnered with LMSA-NE</p>
          <h2 id="ascenso-title">Ascenso: Mentorship Beyond the Match</h2>
          <p>
            A structured, longitudinal mentorship initiative built to help
            relationships grow from one milestone to the next.
          </p>
          <div className={styles.ascensoActions}>
            <Link className={styles.primaryButton} href="/ascenso">
              About Ascenso
            </Link>
            <Link className={styles.secondaryButton} href="/ascenso/apply">
              Apply Now
            </Link>
          </div>
        </section>
      )}

      <section className={styles.podcast} aria-label="The AP MED Podcast">
        <p className={styles.eyebrow}>The AP MED Podcast</p>
        <a
          className={styles.spotifyButton}
          href={SPOTIFY_SHOW_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Listen on Spotify
        </a>
      </section>
    </div>
  );
}
