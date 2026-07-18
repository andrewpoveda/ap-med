# PRM — Ascenso Cohort System on AP MED

**Status:** Draft for Andrew's review → then execution via Claude Code (Opus 4.8)
**Planned by:** Claude Fable 5, July 12 2026
**Repo:** `~/Downloads/ap-med` → `andrewpoveda/ap-med` (NEVER `portfolio-main`)
**Relationship to other docs:** Supplements `ap-med-work-order.md` and `ap-med-v2-schema-spec.md`. For anything Ascenso/cohort-scoped, **this PRM wins on conflict.** For general-platform behavior, existing docs win.

---

## 1. Context and thesis

AP MED Mentors is a **permission system, not a matching platform**. Ascenso is the first **spoke** in the hub-and-spoke model: LMSA-NE's 30-pair inaugural cohort runs on the same AP MED backend, but as its own scoped program — org-vetted mentor pool, board-approved matches, accountability tracking. It does **not** merge into the general mentee/mentor flow, and Ascenso participants **never** appear in the public directory.

The differentiator being built here: existing orgs run mentorship as Google Form matching with zero post-match accountability. Ascenso is the proof-of-concept that AP MED is the **tracking/accountability infrastructure layer** orgs plug into.

**Cohort composition (LMSA-NE spec):** 30 pairs — 10 med-student→premed, 10 resident→med-student, 5 attending→med-student, 5 attending→resident.

## 2. Hard constraints

- **Build everything that runs on free tiers now (decided Jul 12 2026).** Funding is no longer a gate for tracking features — meeting logs, goals, reminders, analytics, and reporting all ship in the initial build. The funding conversation with LMSA-NE now covers what genuinely can't ship free-and-clean (in-platform messaging, see §10) plus ongoing costs, not feature access.
- **Dependency:** PR #5 (mentor OAuth), PR #6 (Calendar sync), and the availability/scheduling feature (migration 0005, `mentor_availability`, `sessions`, magic-link booking) must be merged and verified in prod before Ascenso work begins. Ascenso's migration is **0006** — verify the latest migration number at session start; do not assume.
- **Cohort accounts (decided Jul 12 2026):** Ascenso mentors AND mentees get authenticated accounts via the existing Google OAuth + claim-by-email pattern (`auth_user_id` added to `mentees`, mirroring `mentor`). This applies to cohort members only — general-platform mentees remain auth-less per the platform thesis. Account activation is part of cohort onboarding.
- **Email budget (Resend free):** 100 emails/day, 3,000/month, sent+received both count, each recipient counts separately. Full-cohort blast ≈ 60–65 emails. **Rule: never more than one full-cohort send per day.** All send routes must check `email_log` (see §5.9) and refuse past a soft cap of 90/day.
- **Cron (Vercel Hobby):** max once per day, fires anytime within the scheduled hour, UTC only. No exact-time or multi-daily reminders in Phase 1/2 without a plan upgrade — design around a single daily digest.
- **Supabase free tier:** trivially sufficient at 30-pair scale. No concerns.
- **Isolation is a security requirement, not a preference.** A cohort member leaking into the public `/mentors` directory or public API is a P0 bug (see §6).

## 3. Non-goals / anti-patterns

- No quizzes, tests, or knowledge assessment for orientation/training. These are **attendance/completion checkboxes** marked by an admin after a Zoom session. Nothing more.
- No engagement loops, no gamification, no forced long-term framing.
- No in-platform LMS, video hosting, or certificate generation.
- No newsletter engine in Phase 1 or 2 (see §8 — open decision).
- No public mentor emails, ever.
- Don't overbuild: 30 pairs, one org. Resist generalizing the admin panel for hypothetical future orgs beyond keeping `cohort_id` on everything.

## 4. Data model

All new tables carry `cohort_id` even where derivable, so future spokes are additive. Migration file: **0006** (0005 is the scheduling migration — verify latest before creating). Also in 0006: `auth_user_id uuid` on `mentees` (mirroring `mentor`'s PR #5 column) and `cohort_id` on both member tables.

```sql
create table cohorts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,                 -- 'Ascenso 2026–27'
  org text not null,                  -- 'LMSA-NE'
  status text not null default 'setup',
    -- setup | applications_open | matching | active | closed
  config jsonb not null default '{}'  -- track quotas, survey links, orientation date
);

create table cohort_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cohort_id uuid not null references cohorts(id),
  role text not null,                 -- 'mentor' | 'mentee'
  track text not null,                -- 'ms_premed' | 'resident_ms' | 'attending_ms' | 'attending_resident'
  full_name text not null,
  email text not null,
  answers jsonb not null default '{}',-- form responses; schema per cohort, don't over-normalize
  status text not null default 'submitted',
    -- submitted | approved | rejected | waitlisted
  reviewed_by uuid,                   -- admin_users.id
  reviewed_at timestamptz,
  review_notes text,
  member_id uuid                      -- set on approval: the mentor/mentees row created
);
create unique index on cohort_applications (cohort_id, role, lower(email));

create table admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,         -- matched against Google-verified session email (PR #5 pattern)
  display_name text,
  role text not null default 'cohort_admin',  -- 'super' | 'cohort_admin'
  cohort_id uuid references cohorts(id)       -- null for super
);

create table cohort_matches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cohort_id uuid not null references cohorts(id),
  mentor_id uuid not null,            -- mentor.id
  mentee_id uuid not null,            -- mentees.id
  track text not null,
  score numeric,                      -- from existing deterministic matcher
  status text not null default 'proposed',
    -- proposed | board_approved | active | ended
  approved_by uuid,
  approved_at timestamptz,
  unique (cohort_id, mentor_id, mentee_id)
);

create table member_milestones (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references cohorts(id),
  member_type text not null,          -- 'mentor' | 'mentee'
  member_id uuid not null,
  milestone text not null,            -- 'orientation' | 'mentor_training' | 'mentee_training'
  completed_at timestamptz not null default now(),
  marked_by uuid not null,            -- admin_users.id
  unique (cohort_id, member_type, member_id, milestone)
);

-- Tracking tables (same migration — everything ships now):

create table meeting_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cohort_id uuid not null references cohorts(id),
  match_id uuid not null references cohort_matches(id),
  session_id uuid references sessions(id),  -- null = off-platform meeting; set = marks a booked session as held
  logged_by_type text not null,       -- 'mentor' | 'mentee' | 'admin'
  logged_by_id uuid not null,
  met_at date not null,
  duration_minutes int,
  mode text,                          -- 'zoom' | 'phone' | 'in_person' | 'async'
  notes text
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cohort_id uuid not null references cohorts(id),
  match_id uuid not null references cohort_matches(id),
  title text not null,
  status text not null default 'active',  -- active | done | dropped
  target_date date,
  updated_at timestamptz not null default now()
);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cohort_id uuid not null references cohorts(id),
  subject text not null,
  body text not null,
  audience text not null default 'all',   -- all | mentors | mentees
  sent_at timestamptz,
  sent_by uuid not null,
  recipient_count int
);

create table surveys (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cohort_id uuid not null references cohorts(id),
  wave text not null,                 -- 'mid_year' | 'end_year'
  title text not null,
  questions jsonb not null,           -- ordered array: {id, prompt, type: 'text'|'scale'|'select', options?}
  status text not null default 'draft',  -- draft | open | closed
  opens_at timestamptz,
  closes_at timestamptz,
  unique (cohort_id, wave)
);

create table survey_responses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  survey_id uuid not null references surveys(id),
  cohort_id uuid not null references cohorts(id),
  member_type text not null,          -- resolved server-side from email
  member_id uuid not null,
  answers jsonb not null,
  unique (survey_id, member_id)
);

create table email_log (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  cohort_id uuid,
  kind text not null,                 -- 'announcement' | 'digest' | 'match_notify' | ...
  recipient_email text not null,
  ref_id uuid                         -- announcement id, match id, etc.
);
```

**Cohort membership approach:** on application approval, create (or claim by email, using the `linkMentorByEmail` no-override pattern) a row in the existing `mentor` / `mentees` table with a new nullable `cohort_id uuid` column. The existing matcher then runs scoped to `where cohort_id = $1`. Public-facing queries must filter `cohort_id is null` (§6).

**Gotcha (from CLAUDE.md):** when adding `cohort_id` to existing tables, no default-drop dance needed (it's a scalar), but any new array form fields follow the established pattern: type def + initial state + `toggleArrayField` union + checkbox.

## 5. Feature specs (the 14 items)

### 5.1 Mentor applications — Phase 1
Public form at `/cohorts/ascenso/apply/mentor` (or `/ascenso/apply` with role toggle). Same architecture as existing onboarding: client form → Turnstile-verified POST → `/api/cohort-applications` → insert. Track selector, cohort-specific questions stored in `answers` jsonb. Turnstile fails closed. Duplicate email per cohort/role → 409.

### 5.2 Mentee applications — Phase 1
Same form/route, `role='mentee'`. Note that Ascenso "mentees" include med students and residents depending on track — don't hardcode premed assumptions into copy or fields.

### 5.3 Board review of applications — Phase 1
Admin panel at `/admin/cohorts/[id]/applications`, gated by PR #5 session where session email ∈ `admin_users`. List by status/track, detail view, approve / reject / waitlist with notes. **Approve action:** set status, create/claim mentor or mentees row with `cohort_id`, write `member_id` back. All admin routes are server routes using the service-role client; nothing admin-shaped is reachable without a verified admin session.

### 5.4 Matching workflow — Phase 1
Reuse the existing deterministic weighted matcher (identity 40 / specialty 35 / can_help_with 25), scoped to the cohort and constrained by track (an `attending_ms` mentor only scores against `attending_ms` mentees). Admin view: proposed matches ranked by score → board selects → status `board_approved` → admin activates → status `active` + notification email to both parties (2 emails per match; 60 total for full cohort — fine, but activate in batches if same-day announcements are planned, per §2 email budget). **No auto-matching goes live without explicit board approval — this is the whole point of the spoke.**

### 5.5 Orientation attendance — Phase 1
A checkbox. Admin opens `/admin/cohorts/[id]/milestones`, sees the member roster × milestone grid, checks people off after the Zoom orientation. Insert into `member_milestones`. Unchecking deletes the row. That is the entire feature. Orientation date/Zoom link live in `cohorts.config` and can be included in an announcement.

### 5.6 Mentor training completion — Phase 1
Same grid, `milestone='mentor_training'`. No quiz, no content hosting. If LMSA-NE has training slides, link them in an announcement or store the URL in `cohorts.config`.

### 5.7 Mentee training completion — Phase 1
Identical, `milestone='mentee_training'`.

### 5.8 Meeting logs — build now
Two-sided: **both mentor and mentee log from their authed dashboards** (revised Jul 12 2026 — the original mentor-only decision predates cohort accounts; `logged_by_type` was kept in the schema for exactly this). Meetings have two sources: (a) sessions booked through the platform's scheduling flow — these count automatically; (b) manual log entries for off-platform meetings (phone call, hallway conversation, async). Logging against a booked session (`session_id` set) marks it as held rather than creating a duplicate meeting. Analytics counts the union. This is the core accountability feature and the heart of the differentiator.

### 5.9 Automated reminders — build now, digest-only
One Vercel cron (`0 13 * * *` UTC ≈ 9am ET, fires within the hour), `CRON_SECRET`-authed route `/api/cron/digest`. Each run: compute who has pending items (unlogged meeting this month, incomplete milestone past orientation date, goal past target date, open survey unanswered, session in the next 24h), batch **all** of a person's items into **one** email, write to `email_log`, skip anyone already reminded within N days (default 7; session-tomorrow items exempt from the cooldown). Hard behaviors: refuse to send if today's `email_log` count would exceed 90; idempotent per day (safe to re-invoke). No per-event or exact-time reminders on free tier — do not build them.

### 5.10 Community announcements — Phase 1
Admin composes subject/body/audience → server route resolves recipients from cohort membership → sends via Resend → writes `announcements` row + `email_log` rows. Enforce the one-full-cohort-send-per-day check at the route level (block with a clear error, don't silently queue).

### 5.11 Newsletter distribution — Deferred (see §8)
Not built. For the pilot, announcements cover it. A real newsletter (especially anything touching the broader AP MED audience) blows the 100/day Resend cap the moment the list passes ~100 people and belongs on a separate decision track.

### 5.12 Mid-year / end-of-year surveys — build now, native
Authed survey pages: cohort members submit from their dashboards, member identity resolved from the session (no email matching, no Turnstile needed — every cohort member has an account). `unique(survey_id, member_id)` enforces one response. Admin side: create/open/close surveys per wave, view responses; completion is **derived** from `survey_responses` — it appears in the milestone grid and analytics automatically, no manual marking. Survey announcements ride the announcements feature; the digest cron nags non-responders while a survey is open. One note for LMSA-NE: responses are tied to members (that's what makes completion tracking work); if the board wants an *anonymous* feedback channel, that's a separate simple form later, not this feature.

### 5.13 Engagement analytics — build now
Admin dashboard at `/admin/cohorts/[id]/analytics`: matches active, meetings logged per pair per month, milestone completion %, goal completion %, members with zero activity in 30 days. Pure SQL + recharts. PostHog is already wired for product analytics; cohort analytics come from our own tables, not PostHog.

### 5.14 Annual reporting — build now
CSV export per table + a one-page printable summary view (the analytics dashboard with a print stylesheet is acceptable v1). This is the artifact LMSA-NE's board sees — it justifies the funding ask, so make the numbers legible, not fancy.

## 6. Security requirements (P0)

1. **Public directory isolation:** every client-reachable mentor query adds `cohort_id is null`. Audit `/api/mentor` and `/mentors` page at implementation time. Continue the `PUBLIC_MENTOR_COLUMNS` / `toPublicMentor()` pattern — never `select('*')` on client-reachable routes; do not add `cohort_id` to public columns.
2. **RLS:** new cohort tables get **no** public policies. All access via server routes with the service-role client. `cohort_applications` is the one exception-shaped thing, and even it goes through a Turnstile-verified server route (matching the `/api/mentees` pattern), not direct client insert.
3. **Auth gating:** admin routes check session email ∈ `admin_users`; member dashboard routes resolve the session to a cohort member row (`auth_user_id`) and scope every query to that member's own matches/logs/goals — server-side, per request. No client-side-only gating. A mentor must never read another pair's logs.
4. **Rate limiting:** add `/api/cohort-applications` (and later `/api/cron/digest` exclusion) to the Cloudflare rate-limit rule. Verify the rule path list — history says these drift (§ the `/api/mentors` typo incident).
5. **Cron auth:** `Authorization: Bearer ${CRON_SECRET}` check, 401 otherwise.
6. No cohort member PII in Sentry breadcrumbs (repeat of the PR #5 UUID fix — same discipline).

## 7. Build order (single sequence — everything ships)

1. Migration 0006: all tables in §4 (`cohorts`, `cohort_applications`, `admin_users`, `cohort_matches`, `member_milestones`, `meeting_logs`, `goals`, `announcements`, `surveys`, `survey_responses`, `email_log`) + `cohort_id` on `mentor`/`mentees` + `auth_user_id` on `mentees`. Public-route isolation audit in the same PR.
2. Application form + API route (Turnstile, dedup, rate limit — applicants aren't members yet, so applications stay public forms).
3. Admin shell + auth gating (`admin_users` check on existing OAuth sessions).
4. Board review UI + approve→member promotion.
5. Cohort-scoped matching view + approval flow + activation emails.
6. Member accounts + dashboards: extend the claim-by-email OAuth linking to cohort mentees; role-aware dashboard showing match, milestones, and upcoming sessions. Account activation tracked as an onboarding step.
7. Milestone grid (admin).
8. Announcements composer + send route + email_log cap check.
9. Meeting logs (both sides, session-aware per §5.8).
10. Goals (both sides, same dashboards).
11. Cohort session booking: matched pairs book through mentor availability reusing `computeOpenSlots`/`bookSession` — authed, no magic link. Rides entirely on the 0005 scheduling work.
12. Daily digest cron.
13. Analytics dashboard.
14. Report/CSV export + print stylesheet.
15. Native surveys (§5.12).

Each numbered item = one PR, stacked as needed, on branches `ascenso/<nn>-<slug>`. Nothing merges until PR #5/#6 and the scheduling feature are in main and verified live. Items 1–8 form a launchable pilot; 9–15 complete the accountability layer and should follow immediately, not wait on anything. Add every new API route to the pending Cloudflare rate-limit rule update (alongside the still-outstanding `/api/sessions` + `/api/google/*` + `/api/schedule/*`).

Each numbered item = one PR, stacked as needed, on branches `ascenso/<nn>-<slug>`. Nothing merges until PR #5/#6 are in main and verified live.

## 8. Decisions log (all resolved — PRM is final for LMSA-NE presentation)

1. **Reminders — resolved:** single daily digest, all of a member's pending items in one email, hard 90/day cap, idempotent. Exact-time reminders are a paid-tier feature and part of any future funding conversation, not this build.
2. **Newsletter — resolved: deferred.** Announcements cover the pilot. A real newsletter is an AP MED-wide decision with its own quota math.
3. **Mentee-side meeting logging — revised Jul 12 2026:** originally mentor-only; now **both-sided** — cohort accounts (decision 6) made mentee logging free (§5.8).
4. **Phase split — resolved:** everything free-buildable ships now, single build order in §7.
5. **Surveys — resolved:** native, authed submission from member dashboards (§5.12). Completion is derived and appears in the milestone grid and analytics automatically.
6. **Cohort accounts — resolved Jul 12 2026:** both roles get Google OAuth accounts via the existing claim-by-email pattern, scoped to cohort members only. The auth-less thesis governs the open funnel, not a vetted 30-pair program where accountability is the product. Unlocks two-sided logging, authed surveys, mentee dashboards, and direct session booking.

## 10. Explicitly out of scope: in-platform messaging

Messaging is the one requested-adjacent feature that stays out, and the honest reasons have shifted now that cohort members have accounts. Infrastructure cost is still not the blocker — a messages table is free at this scale, and Supabase Realtime's free tier is far beyond pilot needs. The auth blocker is also gone for the cohort. What remains:

1. **Notification pressure.** Messaging without "you have a new message" emails is a dead feature; with them, per-message notifications compete with announcements and digests for the 100/day Resend cap, and the once-daily Hobby cron can't batch them at useful latency. A messaging feature people check only when the daily digest tells them to is worse than email.
2. **The pairs already have channels.** Match activation introduces them by email, and cohort session booking (item 11) puts real meetings with Meet links on their calendars. In-app chat competes with tools they already live in.
3. It's AP MED general-roadmap Phase 4 — building it cohort-first inverts the platform build order.

So: messaging remains the centerpiece of the LMSA-NE funding ask (Manni already offered to bring messaging costs to the board) — funded, it arrives as a platform feature with proper notification infrastructure, and Ascenso inherits it.

## 9. Execution protocol (for Opus 4.8 in Claude Code)

**Session start:** read this PRM in full, `git status`, confirm repo is `ap-med` (never `portfolio-main`), confirm current branch, check whether PR #5/#6 are merged before touching anything auth-dependent.

**Standing guardrails (from CLAUDE.md, restated because they will bite):**
- Data-fetching pages: `export const dynamic = 'force-dynamic'`.
- NEVER run `npm audit fix --force` (downgrades Next.js to v9).
- API route is singular `/api/mentor`; new cohort routes follow their own naming, don't "fix" existing ones.
- Array column migrations: drop default first, then `ALTER COLUMN ... TYPE text[] USING ARRAY[]::text[]`.
- Vercel env vars are Sensitive/write-only — `vercel env pull` returns empty; source real values from service dashboards. Local dev uses Turnstile test keys.
- Migrations are numbered sequentially; check the latest before creating 0005.

**Session end:** summarize what shipped vs. this PRM's build order, list any deviations and why, note the next numbered item.

**Scope discipline:** if a task tempts generalization beyond one cohort/one org, stop and flag it instead of building it. In-platform messaging (§10) is not to be started "while we're in there."
