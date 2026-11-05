-- 0024_job_tread_discs_pads_checks.sql (Nov 2026)
--
-- Three Job-sheet additions requested together (Joanne, 5 Nov 2026):
--
-- 1. Tread depth per tyre, alongside the four pressures from 0023. mm, one
--    decimal place (e.g. 6.5).
-- 2. "Discpads" split into four: disc front/rear (wear — free text, e.g.
--    "OK", "lipped", "replace") and pads front/rear (thickness in mm).
--    The old free-text `discpads` column (0023) is left in place but no
--    longer read or written by the app — it held no data on any job when
--    this was applied, so nothing needed carrying over. Safe to drop later.
-- 3. Two more free-text checks: screenwash and oil.
--
-- All optional/nullable, no backfill. No RLS change — covered by the
-- existing "Staff can update jobs" policy (0009).

alter table public.jobs
  add column tyre_tread_nsf numeric(3, 1) check (tyre_tread_nsf >= 0),
  add column tyre_tread_osf numeric(3, 1) check (tyre_tread_osf >= 0),
  add column tyre_tread_nsr numeric(3, 1) check (tyre_tread_nsr >= 0),
  add column tyre_tread_osr numeric(3, 1) check (tyre_tread_osr >= 0),
  add column disc_front_wear text,
  add column disc_rear_wear text,
  add column pads_front_mm numeric(3, 1) check (pads_front_mm >= 0),
  add column pads_rear_mm numeric(3, 1) check (pads_rear_mm >= 0),
  add column screenwash text,
  add column oil text;

comment on column public.jobs.tyre_tread_nsf is 'Near-side front tyre tread depth, mm. Optional.';
comment on column public.jobs.tyre_tread_osf is 'Off-side front tyre tread depth, mm. Optional.';
comment on column public.jobs.tyre_tread_nsr is 'Near-side rear tyre tread depth, mm. Optional.';
comment on column public.jobs.tyre_tread_osr is 'Off-side rear tyre tread depth, mm. Optional.';
comment on column public.jobs.disc_front_wear is 'Front brake disc wear — optional free text.';
comment on column public.jobs.disc_rear_wear is 'Rear brake disc wear — optional free text.';
comment on column public.jobs.pads_front_mm is 'Front brake pad thickness, mm. Optional.';
comment on column public.jobs.pads_rear_mm is 'Rear brake pad thickness, mm. Optional.';
comment on column public.jobs.screenwash is 'Optional free-text check note.';
comment on column public.jobs.oil is 'Optional free-text check note.';
comment on column public.jobs.discpads is 'DEPRECATED (0024) — replaced by disc_front_wear/disc_rear_wear/pads_front_mm/pads_rear_mm. No longer used by the app.';
