-- 0014_tyre_load_rating.sql
-- Replaces the two independent tyre_details booleans (is_xl,
-- is_commercial) with a single "Load Rated" attribute — Joanne's rename
-- request (Sept 2026) noted the "Commercial" dropdown filter was really
-- standing in for one underlying choice per tyre, not two independent
-- flags, and asked for it to be a proper single dropdown: Commercial,
-- XL, Standard (a 4th filter-only option, "All", means "no filter" and
-- lives in the UI, not the data — see stock-filters.tsx).
--
-- Backfill rule for the one theoretically-possible conflict (a tyre with
-- both is_commercial and is_xl true): commercial wins, since a
-- commercial-rated tyre is the more load-capable of the two ratings.
-- Checked the live data before writing this (Sept 2026): zero tyre_details
-- rows have any combination of these flags set at all yet, so this rule
-- doesn't actually reclassify anything today — it only matters if that
-- ever changes before this migration runs elsewhere.

create type public.tyre_load_rating as enum ('standard', 'xl', 'commercial');

alter table public.tyre_details
  add column load_rating public.tyre_load_rating not null default 'standard';

update public.tyre_details
set load_rating = case
  when is_commercial then 'commercial'
  when is_xl then 'xl'
  else 'standard'
end::public.tyre_load_rating;

alter table public.tyre_details
  drop column is_xl,
  drop column is_commercial;
