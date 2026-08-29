-- ============================================================================
-- Phase 0 — data normalization (NOT auto-applied; review then run in the
-- Supabase SQL editor against project fxffugmkmtsxccdnypyw).
--
-- This migration is DATA-ONLY. No DDL: every column it touches already exists
-- (verified live 2026-06-21). Idempotent — safe to run more than once.
--
-- Pairs with the Phase 0 code changes:
--   * 0.2 mentee field realignment: the form now writes the mentee's own
--     background to `identity`; this backfills the 16 existing rows that put
--     it in `preferred_identity`, so the matcher (now reading `identity`)
--     keeps the same results for old rows.
--   * 0.3 specialty vocabulary unification: normalizes existing rows to the
--     canonical strings in src/data/specialties.ts.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0.2  Backfill mentees.identity from preferred_identity
-- (preferred_identity is intentionally LEFT in place as the backfill source /
--  rollback safety — it is no longer read or written by app code.)
-- ---------------------------------------------------------------------------
update mentees
set identity = preferred_identity
where (identity is null or identity = '{}')
  and preferred_identity is not null
  and preferred_identity <> '{}';

-- ---------------------------------------------------------------------------
-- 0.3  Normalize specialty strings to the canonical vocabulary.
--      array_replace replaces every matching element in the text[] column.
-- ---------------------------------------------------------------------------

-- mentor.specialty  (live data has 1 row using 'ENT'; the rest are guards)
update mentor set specialty = array_replace(specialty, 'ENT',                'Otolaryngology (ENT)') where 'ENT'                = any(specialty);
update mentor set specialty = array_replace(specialty, 'OB-GYN',             'OB/GYN')               where 'OB-GYN'             = any(specialty);
update mentor set specialty = array_replace(specialty, 'Orthopedics',        'Orthopedic Surgery')   where 'Orthopedics'        = any(specialty);
update mentor set specialty = array_replace(specialty, 'Other (not listed)', 'Other')                where 'Other (not listed)' = any(specialty);
-- NOTE (lossy — flag at GATE 0): collapses generic 'Oncology' into 'Hematology/Oncology'.
update mentor set specialty = array_replace(specialty, 'Oncology',           'Hematology/Oncology')  where 'Oncology'           = any(specialty);

-- mentees.interests  (the mentee "specialties of interest" field)
update mentees set interests = array_replace(interests, 'Oncology',          'Hematology/Oncology')  where 'Oncology'           = any(interests);
update mentees set interests = array_replace(interests, 'OB-GYN',            'OB/GYN')               where 'OB-GYN'             = any(interests);
update mentees set interests = array_replace(interests, 'Orthopedics',       'Orthopedic Surgery')   where 'Orthopedics'        = any(interests);
update mentees set interests = array_replace(interests, 'ENT',               'Otolaryngology (ENT)') where 'ENT'                = any(interests);
update mentees set interests = array_replace(interests, 'Other (not listed)','Other')                where 'Other (not listed)' = any(interests);

commit;

-- ---------------------------------------------------------------------------
-- Verification (run after committing):
--   select id, identity, preferred_identity from mentees
--     where identity is distinct from preferred_identity;       -- expect: only the 1 pre-existing identity row
--   select unnest(specialty) s, count(*) from mentor  group by s order by s;  -- expect: all canonical
--   select unnest(interests) i, count(*) from mentees group by i order by i;  -- expect: all canonical
-- ---------------------------------------------------------------------------
