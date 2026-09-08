# Supported Ascenso program configuration

Phase 9 retains the current Ascenso program on AP MED. It does not provision another branded site or invent a second program's requirements.

## Branding and ownership

- Cohort settings supply the program name and organization label; the application header and organization consent labels use those values. Organization ownership is the separate immutable ID introduced in Phase 7. Changing a label does not transfer ownership or access.
- The existing scoped support editor supplies the support contact/instructions used in member help. Assign a real inbox owner before launch.
- New queued email messages use the program name with “via AP MED” as their display identity. The verified sending address stays `mentors@ap-med.org`. Frozen retry messages retain their original sender/content and idempotency key. Replies retain the existing support/partner destinations; changing a display name does not change mail authentication or provider configuration.
- `ASCENSO_SITE_URL` and `ASCENSO_COHORT_ID` remain exact operator configuration for the shared public intake. Existing AP MED/Ascenso shell and partner artwork remain. Additional partner artwork needs a supplied, approved asset and explicit placement review; no arbitrary remote image URLs, asset uploads, theme editor or domain console are introduced without that requirement.
- Before launching another organization publicly, review the existing Ascenso landing-page and shell copy/artwork with the organization. The member/admin product supports multiple cohorts; public intake still selects one configured cohort per deployment. This is assisted configuration, not generalized white-label infrastructure.

## Released definition

`src/lib/program-definition.ts` defines `ascenso-v1`: four existing tracks, existing milestone labels, two survey waves, exact canonical-tag matching, same-track pairing, one live assignment per participation and unchanged 40/35/25 scoring. The application contract is `ascenso-application-v1`; its implemented field/validation contract remains in the application form and intake route. Canonical tag values remain in `src/data/tags.ts` and `src/data/specialties.ts`; no labels or stored answers are rewritten.

The Phase 9 migration records `definition_version` on every cohort and allows only the implemented version. Updates cannot repoint historical cohorts to another definition. CSV exports carry that version on each row. Survey exports already carry the stored question definitions with responses; historical application answers and match scores remain stored as collected/computed.

Do not edit the meaning of a released definition. A real second-program requirement needs a new definition, version-aware form/validation/rendering/scoring where relevant, a compatible database constraint migration, and tests that continue to interpret v1 records identically. Add only the differences requested: no universal application, survey or matching builder. A version label alone does not implement another policy.

Matching weights remain fixed for both public matching and Ascenso. Revisit only when a paying program identifies a concrete policy difference; retain exact tags, deterministic scoring, board choice and assignment constraints. Changing canonical tags requires a separate compatibility plan.

## Rollout

Apply `20260908134231_ascenso_program_definition_version.sql` after Phase 8 and before dependent code. No hosted migration, environment change, provider-dashboard action or deployment was performed. Existing configuration remains sufficient for the current program. A new customer hostname still requires the existing domain/auth/Turnstile/provider checklist; no readiness or approval is inferred from repository settings.
