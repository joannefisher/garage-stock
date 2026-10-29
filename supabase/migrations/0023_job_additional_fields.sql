-- 0023_job_additional_fields.sql
-- Joanne's request (verbatim): "Add the following fields to Job
--   * Mileage
--   * Hours Recorded
--   * Engine Number
--   * Chassis Number
--   * Customer Instruction
--   * Job Details (replace the header for notes with this title)
--   * Faults Found
--   * N.S.F, O.S.F, N.S.R and O.S.R (psi measurements for each tyre)
--   * Antifreeze
--   * Discpads
--   * Tyres
--   * Exhaust"
--
-- All fourteen fields are nullable with no default — a job can still be
-- opened with just a job reference, same as before this migration (see
-- 0009's "everything except the job reference is optional"). None of
-- these feed any existing report/view, so no backfill is needed.
--
-- "Job Details" is a UI-label-only rename of the existing `notes` column
-- (new/[id] pages now show "Job Details" where they used to show
-- "Notes") — not a column rename, to avoid touching every existing query/
-- type that already reads `notes`.
--
-- Mileage/Hours Recorded are numeric, not text, since they're the only
-- two of this batch with an obvious numeric meaning and a clear use for
-- being queryable/sortable later (unlike e.g. "Tyres", which is closer to
-- a free-text condition note, per the clarifying answer this was built
-- against). hours_recorded is numeric(5,2) to allow e.g. 2.50 hours.
-- Tyre pressures are numeric(4,1) (e.g. 32.5 psi) for the same reason.
--
-- Antifreeze/Discpads/Tyres/Exhaust are free text (e.g. "4mm front, 6mm
-- rear" or "Replaced, OK") rather than a structured checkbox+note or
-- fixed-option dropdown — Joanne's choice, clarified before building,
-- picked for speed of filling in over reporting structure.
alter table public.jobs
  add column mileage integer check (mileage >= 0),
  add column hours_recorded numeric(5, 2) check (hours_recorded >= 0),
  add column engine_number text,
  add column chassis_number text,
  add column customer_instruction text,
  add column faults_found text,
  add column tyre_pressure_nsf numeric(4, 1) check (tyre_pressure_nsf >= 0),
  add column tyre_pressure_osf numeric(4, 1) check (tyre_pressure_osf >= 0),
  add column tyre_pressure_nsr numeric(4, 1) check (tyre_pressure_nsr >= 0),
  add column tyre_pressure_osr numeric(4, 1) check (tyre_pressure_osr >= 0),
  add column antifreeze text,
  add column discpads text,
  add column tyres text,
  add column exhaust text;

comment on column public.jobs.mileage is 'Odometer reading at the time of this job, miles. Optional.';
comment on column public.jobs.hours_recorded is 'Labour hours recorded against this job. Optional.';
comment on column public.jobs.engine_number is 'Optional free text.';
comment on column public.jobs.chassis_number is 'Optional free text (VIN or similar).';
comment on column public.jobs.customer_instruction is 'What the customer asked for — optional free text, distinct from faults_found (what the mechanic actually found).';
comment on column public.jobs.faults_found is 'Optional free text — what the mechanic found, distinct from customer_instruction.';
comment on column public.jobs.tyre_pressure_nsf is 'Near-side front tyre pressure, psi. Optional.';
comment on column public.jobs.tyre_pressure_osf is 'Off-side front tyre pressure, psi. Optional.';
comment on column public.jobs.tyre_pressure_nsr is 'Near-side rear tyre pressure, psi. Optional.';
comment on column public.jobs.tyre_pressure_osr is 'Off-side rear tyre pressure, psi. Optional.';
comment on column public.jobs.antifreeze is 'Optional free-text condition/action note (e.g. "Topped up").';
comment on column public.jobs.discpads is 'Optional free-text condition/action note (e.g. "4mm front, 6mm rear").';
comment on column public.jobs.tyres is 'Optional free-text condition/action note.';
comment on column public.jobs.exhaust is 'Optional free-text condition/action note.';
