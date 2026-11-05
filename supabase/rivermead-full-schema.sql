-- =====================================================================
-- Rivermead Stock Manager — full database setup for a NEW Supabase project
-- =====================================================================
--
-- Generated 5 Nov 2026 from migrations 0001–0025, and verified against
-- the live project (phqeftsowmorrsbbsrkn). Creates everything the app
-- needs in one run:
--   * 13 enum types, 20 tables, 6 reporting views (which obey RLS)
--   * every primary key, foreign key, unique and check constraint, and index
--   * 8 functions + 18 triggers (stock-level ledger, updated_at stamps,
--     job-reopen / stocktake / profile-role guards, and the auth.users
--     trigger that creates a staff profile for each new login)
--   * Row Level Security switched on for every table, with all 46 policies
--     (deactivated staff are blocked from all of them)
--   * the same grants to anon / authenticated / service_role
--
-- Verified: replayed into a blank Postgres and fingerprinted against the
-- live project — columns, constraints, enums, functions, grants, indexes,
-- policies, RLS flags, triggers and views all matched exactly.
--
-- HOW TO RUN: new Supabase project -> SQL Editor -> New query -> paste this
-- whole file -> Run. Run it ONCE, on an EMPTY project. It's wrapped in a
-- single transaction: if anything fails, nothing is created and you can
-- fix and re-run.
--
-- This creates STRUCTURE ONLY — no stock, jobs, suppliers or staff
-- accounts. See MIGRATION-STEPS.md for users, data and repointing the app.
-- =====================================================================

BEGIN;

-- Stop early with a clear message if this project already has the schema.
DO $$
BEGIN
  IF to_regclass('public.stock_items') IS NOT NULL THEN
    RAISE EXCEPTION 'public.stock_items already exists — this script is for an EMPTY project. Nothing was changed.';
  END IF;
END $$;
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: black_circle_lot_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.black_circle_lot_status AS ENUM (
    'in_stock',
    'used',
    'returned'
);


--
-- Name: consignment_lot_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.consignment_lot_status AS ENUM (
    'on_consignment',
    'committed',
    'returned'
);


--
-- Name: job_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.job_status AS ENUM (
    'open',
    'closed'
);


--
-- Name: purchase_order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.purchase_order_status AS ENUM (
    'draft',
    'ordered',
    'partially_received',
    'received',
    'cancelled'
);


--
-- Name: staff_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.staff_role AS ENUM (
    'admin',
    'manager',
    'staff',
    'mechanic'
);


--
-- Name: stock_item_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.stock_item_type AS ENUM (
    'part',
    'tyre'
);


--
-- Name: stock_lot_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.stock_lot_status AS ENUM (
    'ordered',
    'owned',
    'on_account',
    'returned'
);


--
-- Name: stock_movement_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.stock_movement_type AS ENUM (
    'initial',
    'goods_in',
    'used',
    'return_to_supplier',
    'adjustment'
);


--
-- Name: stock_take_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.stock_take_status AS ENUM (
    'in_progress',
    'completed',
    'cancelled'
);


--
-- Name: supplier_return_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.supplier_return_status AS ENUM (
    'draft',
    'sent',
    'credited'
);


--
-- Name: tyre_load_rating; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tyre_load_rating AS ENUM (
    'standard',
    'xl',
    'commercial'
);


--
-- Name: tyre_season; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tyre_season AS ENUM (
    'summer',
    'winter',
    'all_season'
);


--
-- Name: tyre_tier; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tyre_tier AS ENUM (
    'budget',
    'mid_range',
    'premium'
);


--
-- Name: apply_stock_movement(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_stock_movement() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.stock_items
  set quantity_on_hand = quantity_on_hand + new.quantity,
      updated_at = now()
  where id = new.stock_item_id;
  return new;
end;
$$;


--
-- Name: current_staff_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_staff_role() RETURNS public.staff_role
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select role from public.profiles where id = auth.uid() and is_active
$$;


--
-- Name: guard_job_reopen(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_job_reopen() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if old.status = 'closed' and new.status = 'open'
     and public.current_staff_role() <> 'admin' then
    raise exception 'Only admins can reopen a closed job.';
  end if;
  return new;
end;
$$;


--
-- Name: guard_profile_privileged_fields(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_profile_privileged_fields() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  -- Trusted server-side callers (the Team screen's service-role client,
  -- the SQL editor) do their own checks.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if (new.role, new.is_active, new.username, new.deactivated_at, new.deactivated_by)
     is distinct from
     (old.role, old.is_active, old.username, old.deactivated_at, old.deactivated_by)
     and public.current_staff_role() is distinct from 'admin'
  then
    raise exception 'Only an active admin can change role, username or active status'
      using errcode = '42501';
  end if;

  return new;
end;
$$;


--
-- Name: guard_stock_take_count_reconciliation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_stock_take_count_reconciliation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if (new.reconciled_at is distinct from old.reconciled_at
      or new.reconciled_movement_id is distinct from old.reconciled_movement_id)
     and public.current_staff_role() not in ('admin', 'manager') then
    raise exception 'Only admins and managers can reconcile a stock take count.';
  end if;
  return new;
end;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.profiles (id, full_name, role, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    'mechanic',
    nullif(lower(new.raw_user_meta_data ->> 'username'), '')
  );
  return new;
end;
$$;


--
-- Name: is_active_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_active_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active)
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: black_circle_stock_lots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.black_circle_stock_lots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stock_item_id uuid NOT NULL,
    job_id uuid NOT NULL,
    quantity integer NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    received_by uuid,
    status public.black_circle_lot_status DEFAULT 'in_stock'::public.black_circle_lot_status NOT NULL,
    used_at timestamp with time zone,
    used_by uuid,
    returned_at timestamp with time zone,
    returned_by uuid,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT black_circle_stock_lots_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT black_circle_stock_lots_returned_fields CHECK (((status = 'returned'::public.black_circle_lot_status) = (returned_at IS NOT NULL))),
    CONSTRAINT black_circle_stock_lots_used_fields CHECK (((status = 'used'::public.black_circle_lot_status) = (used_at IS NOT NULL)))
);


--
-- Name: consignment_stock_lots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consignment_stock_lots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stock_item_id uuid NOT NULL,
    quantity integer NOT NULL,
    cost_price numeric(10,2) DEFAULT 0 NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    received_by uuid,
    due_back_at date NOT NULL,
    status public.consignment_lot_status DEFAULT 'on_consignment'::public.consignment_lot_status NOT NULL,
    committed_at timestamp with time zone,
    committed_by uuid,
    payment_due_date date,
    returned_at timestamp with time zone,
    returned_by uuid,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    paid_by uuid,
    invoice_number text,
    vehicle_registration text,
    price_inc_vat numeric(10,2),
    CONSTRAINT consignment_stock_lots_committed_fields CHECK (((status = 'committed'::public.consignment_lot_status) = (committed_at IS NOT NULL))),
    CONSTRAINT consignment_stock_lots_cost_price_check CHECK ((cost_price >= (0)::numeric)),
    CONSTRAINT consignment_stock_lots_paid_requires_committed CHECK (((paid_at IS NULL) OR (status = 'committed'::public.consignment_lot_status))),
    CONSTRAINT consignment_stock_lots_price_inc_vat_check CHECK ((price_inc_vat >= (0)::numeric)),
    CONSTRAINT consignment_stock_lots_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT consignment_stock_lots_returned_fields CHECK (((status = 'returned'::public.consignment_lot_status) = (returned_at IS NOT NULL)))
);


--
-- Name: jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_number text NOT NULL,
    vehicle_registration text,
    vehicle_id uuid,
    notes text,
    status public.job_status DEFAULT 'open'::public.job_status NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_by uuid,
    closed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_name text,
    customer_company text,
    customer_email text,
    job_date date,
    reopened_by uuid,
    reopened_at timestamp with time zone,
    mileage integer,
    hours_recorded numeric(5,2),
    engine_number text,
    chassis_number text,
    customer_instruction text,
    faults_found text,
    tyre_pressure_nsf numeric(4,1),
    tyre_pressure_osf numeric(4,1),
    tyre_pressure_nsr numeric(4,1),
    tyre_pressure_osr numeric(4,1),
    antifreeze text,
    discpads text,
    tyres text,
    exhaust text,
    tyre_tread_nsf numeric(3,1),
    tyre_tread_osf numeric(3,1),
    tyre_tread_nsr numeric(3,1),
    tyre_tread_osr numeric(3,1),
    disc_front_wear text,
    disc_rear_wear text,
    pads_front_mm numeric(3,1),
    pads_rear_mm numeric(3,1),
    screenwash text,
    oil text,
    CONSTRAINT jobs_hours_recorded_check CHECK ((hours_recorded >= (0)::numeric)),
    CONSTRAINT jobs_mileage_check CHECK ((mileage >= 0)),
    CONSTRAINT jobs_pads_front_mm_check CHECK ((pads_front_mm >= (0)::numeric)),
    CONSTRAINT jobs_pads_rear_mm_check CHECK ((pads_rear_mm >= (0)::numeric)),
    CONSTRAINT jobs_tyre_pressure_nsf_check CHECK ((tyre_pressure_nsf >= (0)::numeric)),
    CONSTRAINT jobs_tyre_pressure_nsr_check CHECK ((tyre_pressure_nsr >= (0)::numeric)),
    CONSTRAINT jobs_tyre_pressure_osf_check CHECK ((tyre_pressure_osf >= (0)::numeric)),
    CONSTRAINT jobs_tyre_pressure_osr_check CHECK ((tyre_pressure_osr >= (0)::numeric)),
    CONSTRAINT jobs_tyre_tread_nsf_check CHECK ((tyre_tread_nsf >= (0)::numeric)),
    CONSTRAINT jobs_tyre_tread_nsr_check CHECK ((tyre_tread_nsr >= (0)::numeric)),
    CONSTRAINT jobs_tyre_tread_osf_check CHECK ((tyre_tread_osf >= (0)::numeric)),
    CONSTRAINT jobs_tyre_tread_osr_check CHECK ((tyre_tread_osr >= (0)::numeric))
);


--
-- Name: COLUMN jobs.mileage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.mileage IS 'Odometer reading at the time of this job, miles. Optional.';


--
-- Name: COLUMN jobs.hours_recorded; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.hours_recorded IS 'Labour hours recorded against this job. Optional.';


--
-- Name: COLUMN jobs.engine_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.engine_number IS 'Optional free text.';


--
-- Name: COLUMN jobs.chassis_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.chassis_number IS 'Optional free text (VIN or similar).';


--
-- Name: COLUMN jobs.customer_instruction; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.customer_instruction IS 'What the customer asked for — optional free text, distinct from faults_found (what the mechanic actually found).';


--
-- Name: COLUMN jobs.faults_found; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.faults_found IS 'Optional free text — what the mechanic found, distinct from customer_instruction.';


--
-- Name: COLUMN jobs.tyre_pressure_nsf; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.tyre_pressure_nsf IS 'Near-side front tyre pressure, psi. Optional.';


--
-- Name: COLUMN jobs.tyre_pressure_osf; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.tyre_pressure_osf IS 'Off-side front tyre pressure, psi. Optional.';


--
-- Name: COLUMN jobs.tyre_pressure_nsr; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.tyre_pressure_nsr IS 'Near-side rear tyre pressure, psi. Optional.';


--
-- Name: COLUMN jobs.tyre_pressure_osr; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.tyre_pressure_osr IS 'Off-side rear tyre pressure, psi. Optional.';


--
-- Name: COLUMN jobs.antifreeze; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.antifreeze IS 'Optional free-text condition/action note (e.g. "Topped up").';


--
-- Name: COLUMN jobs.discpads; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.discpads IS 'DEPRECATED (0024) — replaced by disc_front_wear/disc_rear_wear/pads_front_mm/pads_rear_mm. No longer used by the app.';


--
-- Name: COLUMN jobs.tyres; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.tyres IS 'Optional free-text condition/action note.';


--
-- Name: COLUMN jobs.exhaust; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.exhaust IS 'Optional free-text condition/action note.';


--
-- Name: COLUMN jobs.tyre_tread_nsf; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.tyre_tread_nsf IS 'Near-side front tyre tread depth, mm. Optional.';


--
-- Name: COLUMN jobs.tyre_tread_osf; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.tyre_tread_osf IS 'Off-side front tyre tread depth, mm. Optional.';


--
-- Name: COLUMN jobs.tyre_tread_nsr; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.tyre_tread_nsr IS 'Near-side rear tyre tread depth, mm. Optional.';


--
-- Name: COLUMN jobs.tyre_tread_osr; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.tyre_tread_osr IS 'Off-side rear tyre tread depth, mm. Optional.';


--
-- Name: COLUMN jobs.disc_front_wear; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.disc_front_wear IS 'Front brake disc wear — optional free text.';


--
-- Name: COLUMN jobs.disc_rear_wear; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.disc_rear_wear IS 'Rear brake disc wear — optional free text.';


--
-- Name: COLUMN jobs.pads_front_mm; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.pads_front_mm IS 'Front brake pad thickness, mm. Optional.';


--
-- Name: COLUMN jobs.pads_rear_mm; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.pads_rear_mm IS 'Rear brake pad thickness, mm. Optional.';


--
-- Name: COLUMN jobs.screenwash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.screenwash IS 'Optional free-text check note.';


--
-- Name: COLUMN jobs.oil; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jobs.oil IS 'Optional free-text check note.';


--
-- Name: part_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.part_details (
    stock_item_id uuid NOT NULL,
    vehicle_make text,
    vehicle_model text,
    manufacturer_part_number text,
    oem_part_number text
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text NOT NULL,
    role public.staff_role DEFAULT 'staff'::public.staff_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    username text,
    is_active boolean DEFAULT true NOT NULL,
    deactivated_at timestamp with time zone,
    deactivated_by uuid,
    CONSTRAINT profiles_username_format CHECK ((username ~ '^[a-z0-9][a-z0-9._-]{2,29}$'::text))
);


--
-- Name: COLUMN profiles.username; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.username IS 'Sign-in name. The Auth login is <username>@rivermead.local.';


--
-- Name: COLUMN profiles.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.is_active IS 'False = deactivated: login banned, app access and all RLS access blocked.';


--
-- Name: purchase_order_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_order_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    purchase_order_id uuid NOT NULL,
    stock_item_id uuid NOT NULL,
    quantity_ordered integer NOT NULL,
    quantity_received integer DEFAULT 0 NOT NULL,
    unit_cost numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_order_lines_quantity_ordered_check CHECK ((quantity_ordered > 0)),
    CONSTRAINT purchase_order_lines_quantity_received_check CHECK ((quantity_received >= 0)),
    CONSTRAINT purchase_order_lines_unit_cost_check CHECK ((unit_cost >= (0)::numeric))
);


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid NOT NULL,
    status public.purchase_order_status DEFAULT 'draft'::public.purchase_order_status NOT NULL,
    ordered_at timestamp with time zone,
    expected_at date,
    created_by uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_type public.stock_item_type NOT NULL,
    id_number text NOT NULL,
    name text NOT NULL,
    supplier_id uuid,
    cost_price numeric(10,2) DEFAULT 0 NOT NULL,
    selling_price numeric(10,2) DEFAULT 0 NOT NULL,
    is_non_returnable boolean DEFAULT false NOT NULL,
    is_consignment boolean DEFAULT false NOT NULL,
    vehicle_note text,
    quantity_on_hand integer DEFAULT 0 NOT NULL,
    ideal_stock_level integer DEFAULT 0 NOT NULL,
    location text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_black_circle boolean DEFAULT false NOT NULL,
    CONSTRAINT stock_items_cost_price_check CHECK ((cost_price >= (0)::numeric)),
    CONSTRAINT stock_items_ideal_stock_level_check CHECK ((ideal_stock_level >= 0)),
    CONSTRAINT stock_items_selling_price_check CHECK ((selling_price >= (0)::numeric))
);


--
-- Name: stock_lots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_lots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stock_item_id uuid NOT NULL,
    quantity integer NOT NULL,
    cost_price numeric(10,2) DEFAULT 0 NOT NULL,
    price_inc_vat numeric(10,2),
    status public.stock_lot_status DEFAULT 'owned'::public.stock_lot_status NOT NULL,
    ordered_at timestamp with time zone,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    received_by uuid,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    invoice_number text,
    supplier_id uuid,
    quantity_received integer DEFAULT 0 NOT NULL,
    order_lot_id uuid,
    order_date date,
    invoice_date date,
    return_by_date date,
    payment_due_date date,
    invoice_paid_at timestamp with time zone,
    invoice_paid_by uuid,
    CONSTRAINT stock_lots_cost_price_check CHECK ((cost_price >= (0)::numeric)),
    CONSTRAINT stock_lots_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT stock_lots_quantity_received_check CHECK ((quantity_received >= 0)),
    CONSTRAINT stock_lots_quantity_received_le_quantity_check CHECK ((quantity_received <= quantity))
);


--
-- Name: COLUMN stock_lots.order_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_lots.order_date IS 'Orders only: the date the order was actually placed, editable independently of ordered_at (which stays the system "record created" timestamp). Defaults to today in the UI, not enforced here.';


--
-- Name: COLUMN stock_lots.invoice_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_lots.invoice_date IS 'Orders only: the date on the supplier''s invoice, editable, optional.';


--
-- Name: COLUMN stock_lots.return_by_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_lots.return_by_date IS 'Set on an ordered lot from the supplier''s default_return_days (order_date + N days), editable. Copied onto the ''owned'' lot created when that order is received (receiveOrderQuantity / the Quick Stock Add invoice auto-match) so the Returnable Stock report can query owned lots directly, without re-deriving it from the order every time.';


--
-- Name: COLUMN stock_lots.payment_due_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_lots.payment_due_date IS 'Orders only: set from the supplier''s default_payment_due_day (next occurrence of that day-of-month on/after order_date), editable.';


--
-- Name: COLUMN stock_lots.invoice_paid_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_lots.invoice_paid_at IS 'Orders only: when the order''s invoice was marked paid — see markOrderInvoicePaid, mirrors consignment_stock_lots.paid_at (0012).';


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stock_item_id uuid NOT NULL,
    movement_type public.stock_movement_type NOT NULL,
    quantity integer NOT NULL,
    job_number text,
    purchase_order_id uuid,
    supplier_return_id uuid,
    performed_by uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    stock_take_id uuid,
    job_id uuid,
    consignment_lot_id uuid,
    black_circle_lot_id uuid,
    stock_lot_id uuid,
    CONSTRAINT stock_movements_sign_check CHECK ((((movement_type = ANY (ARRAY['goods_in'::public.stock_movement_type, 'initial'::public.stock_movement_type])) AND (quantity > 0)) OR ((movement_type = ANY (ARRAY['used'::public.stock_movement_type, 'return_to_supplier'::public.stock_movement_type])) AND (quantity < 0)) OR (movement_type = 'adjustment'::public.stock_movement_type)))
);


--
-- Name: stock_take_counts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_take_counts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stock_take_id uuid NOT NULL,
    stock_item_id uuid NOT NULL,
    counted_quantity integer NOT NULL,
    expected_quantity integer NOT NULL,
    counted_by uuid,
    counted_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    reconciled_at timestamp with time zone,
    reconciled_movement_id uuid,
    CONSTRAINT stock_take_counts_counted_quantity_check CHECK ((counted_quantity >= 0))
);


--
-- Name: stock_takes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_takes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    status public.stock_take_status DEFAULT 'in_progress'::public.stock_take_status NOT NULL,
    started_by uuid,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_by uuid,
    completed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: supplier_return_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_return_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_return_id uuid NOT NULL,
    stock_item_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_cost numeric(10,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplier_return_lines_quantity_check CHECK ((quantity > 0))
);


--
-- Name: supplier_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_returns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid NOT NULL,
    status public.supplier_return_status DEFAULT 'draft'::public.supplier_return_status NOT NULL,
    reason text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    contact_name text,
    phone text,
    email text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    address text,
    default_return_days integer,
    default_payment_due_day integer,
    CONSTRAINT suppliers_default_payment_due_day_check CHECK (((default_payment_due_day >= 1) AND (default_payment_due_day <= 31))),
    CONSTRAINT suppliers_default_return_days_check CHECK ((default_return_days >= 0))
);


--
-- Name: COLUMN suppliers.default_return_days; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.suppliers.default_return_days IS 'Days from an order''s Order Date used to auto-fill that order''s Return Date. Nullable — no default offered until set.';


--
-- Name: COLUMN suppliers.default_payment_due_day; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.suppliers.default_payment_due_day IS 'Day-of-month (1-31, clamped to the target month''s last day) used to auto-fill an order''s Payment Due Date as the next occurrence of this day on/after the Order Date. Nullable — no default offered until set.';


--
-- Name: tyre_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tyre_details (
    stock_item_id uuid NOT NULL,
    width integer NOT NULL,
    profile integer NOT NULL,
    rim_diameter integer NOT NULL,
    size_label text GENERATED ALWAYS AS ((((((width)::text || '/'::text) || (profile)::text) || 'R'::text) || (rim_diameter)::text)) STORED,
    load_index text,
    speed_rating text,
    season public.tyre_season DEFAULT 'summer'::public.tyre_season NOT NULL,
    tier public.tyre_tier DEFAULT 'mid_range'::public.tyre_tier NOT NULL,
    brand text,
    pattern text,
    load_rating public.tyre_load_rating DEFAULT 'standard'::public.tyre_load_rating NOT NULL,
    CONSTRAINT tyre_details_profile_check CHECK ((profile > 0)),
    CONSTRAINT tyre_details_rim_diameter_check CHECK ((rim_diameter > 0)),
    CONSTRAINT tyre_details_width_check CHECK ((width > 0))
);


--
-- Name: v_consignment_pending_payments; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_consignment_pending_payments WITH (security_invoker='true') AS
 SELECT csl.id AS lot_id,
    csl.stock_item_id,
    si.id_number,
    si.name,
    si.supplier_id,
    s.name AS supplier_name,
    csl.quantity,
    csl.cost_price,
    ((csl.quantity)::numeric * csl.cost_price) AS amount_due,
    csl.received_at,
    csl.committed_at,
    csl.payment_due_date,
    (csl.payment_due_date < CURRENT_DATE) AS is_overdue,
    csl.invoice_number,
    csl.vehicle_registration,
    csl.price_inc_vat
   FROM ((public.consignment_stock_lots csl
     JOIN public.stock_items si ON ((si.id = csl.stock_item_id)))
     LEFT JOIN public.suppliers s ON ((s.id = si.supplier_id)))
  WHERE ((csl.status = 'committed'::public.consignment_lot_status) AND (csl.paid_at IS NULL));


--
-- Name: v_orders_report; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_orders_report WITH (security_invoker='true') AS
 SELECT sl.id AS lot_id,
    sl.stock_item_id,
    si.id_number,
    si.name,
    sl.supplier_id,
    s.name AS supplier_name,
    sl.invoice_number,
    sl.quantity,
    sl.quantity_received,
    (sl.quantity - sl.quantity_received) AS outstanding,
    sl.cost_price,
    sl.price_inc_vat,
    sl.order_date,
    sl.invoice_date,
    sl.ordered_at,
    sl.return_by_date,
    sl.payment_due_date,
    sl.invoice_paid_at
   FROM ((public.stock_lots sl
     JOIN public.stock_items si ON ((si.id = sl.stock_item_id)))
     LEFT JOIN public.suppliers s ON ((s.id = sl.supplier_id)))
  WHERE (sl.status = 'ordered'::public.stock_lot_status);


--
-- Name: VIEW v_orders_report; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_orders_report IS 'Every order ever placed (status = ordered), historical — unlike /dashboard/orders which only lists outstanding ones. Backs the Reporting-hub "Orders report" and "Orders due" report.';


--
-- Name: v_purchase_costs_weekly; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_purchase_costs_weekly WITH (security_invoker='true') AS
 SELECT (date_trunc('week'::text, po.ordered_at))::date AS week_start,
    po.supplier_id,
    s.name AS supplier_name,
    sum(((pol.quantity_ordered)::numeric * pol.unit_cost)) AS total_cost
   FROM ((public.purchase_orders po
     JOIN public.purchase_order_lines pol ON ((pol.purchase_order_id = po.id)))
     JOIN public.suppliers s ON ((s.id = po.supplier_id)))
  WHERE (po.ordered_at IS NOT NULL)
  GROUP BY ((date_trunc('week'::text, po.ordered_at))::date), po.supplier_id, s.name;


--
-- Name: v_reorder_report; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_reorder_report WITH (security_invoker='true') AS
 SELECT si.id,
    si.item_type,
    si.id_number,
    si.name,
    si.supplier_id,
    s.name AS supplier_name,
    si.quantity_on_hand,
    si.ideal_stock_level,
    (si.ideal_stock_level - si.quantity_on_hand) AS quantity_to_order
   FROM (public.stock_items si
     LEFT JOIN public.suppliers s ON ((s.id = si.supplier_id)))
  WHERE (si.is_active AND (si.quantity_on_hand < si.ideal_stock_level));


--
-- Name: v_returnable_stock; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_returnable_stock WITH (security_invoker='true') AS
 SELECT 'owned'::text AS source,
    sl.id AS lot_id,
    sl.stock_item_id,
    si.id_number,
    si.name,
    sl.supplier_id,
    s.name AS supplier_name,
    sl.quantity,
    sl.cost_price,
    ((sl.quantity)::numeric * sl.cost_price) AS value,
    sl.return_by_date AS return_date,
    sl.invoice_number,
    sl.received_at
   FROM ((public.stock_lots sl
     JOIN public.stock_items si ON ((si.id = sl.stock_item_id)))
     LEFT JOIN public.suppliers s ON ((s.id = sl.supplier_id)))
  WHERE ((sl.status = 'owned'::public.stock_lot_status) AND (sl.return_by_date IS NOT NULL))
UNION ALL
 SELECT 'on_account'::text AS source,
    csl.id AS lot_id,
    csl.stock_item_id,
    si.id_number,
    si.name,
    si.supplier_id,
    s.name AS supplier_name,
    csl.quantity,
    csl.cost_price,
    ((csl.quantity)::numeric * csl.cost_price) AS value,
    csl.due_back_at AS return_date,
    csl.invoice_number,
    csl.received_at
   FROM ((public.consignment_stock_lots csl
     JOIN public.stock_items si ON ((si.id = csl.stock_item_id)))
     LEFT JOIN public.suppliers s ON ((s.id = si.supplier_id)))
  WHERE ((csl.status = 'committed'::public.consignment_lot_status) AND (csl.paid_at IS NULL) AND (csl.due_back_at IS NOT NULL));


--
-- Name: VIEW v_returnable_stock; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_returnable_stock IS 'Union of owned stock_lots and committed/unpaid on-account consignment_stock_lots that each have a return deadline set — "return date has not past" is filtered at query time (return_date >= current_date), same convention as the other report views.';


--
-- Name: v_supplier_return_credits_weekly; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_supplier_return_credits_weekly WITH (security_invoker='true') AS
 SELECT (date_trunc('week'::text, sr.created_at))::date AS week_start,
    sr.supplier_id,
    s.name AS supplier_name,
    sum(((srl.quantity)::numeric * COALESCE(srl.unit_cost, (0)::numeric))) AS total_credit
   FROM ((public.supplier_returns sr
     JOIN public.supplier_return_lines srl ON ((srl.supplier_return_id = sr.id)))
     JOIN public.suppliers s ON ((s.id = sr.supplier_id)))
  GROUP BY ((date_trunc('week'::text, sr.created_at))::date), sr.supplier_id, s.name;


--
-- Name: vehicle_model_fitments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicle_model_fitments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vehicle_model_id uuid NOT NULL,
    stock_item_id uuid NOT NULL,
    notes text
);


--
-- Name: vehicle_model_lubricants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicle_model_lubricants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vehicle_model_id uuid NOT NULL,
    lubricant_type text NOT NULL,
    specification text NOT NULL,
    capacity_litres numeric(4,2),
    notes text
);


--
-- Name: vehicle_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicle_models (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    make text NOT NULL,
    model text NOT NULL,
    generation text,
    year_from integer,
    year_to integer,
    engine_code text,
    fuel_type text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    registration text,
    vin text,
    vehicle_model_id uuid,
    colour text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vehicles_reg_or_vin CHECK (((registration IS NOT NULL) OR (vin IS NOT NULL)))
);


--
-- Name: black_circle_stock_lots black_circle_stock_lots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.black_circle_stock_lots
    ADD CONSTRAINT black_circle_stock_lots_pkey PRIMARY KEY (id);


--
-- Name: consignment_stock_lots consignment_stock_lots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consignment_stock_lots
    ADD CONSTRAINT consignment_stock_lots_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: part_details part_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.part_details
    ADD CONSTRAINT part_details_pkey PRIMARY KEY (stock_item_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: purchase_order_lines purchase_order_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_lines
    ADD CONSTRAINT purchase_order_lines_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: stock_items stock_items_id_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_items
    ADD CONSTRAINT stock_items_id_number_key UNIQUE (id_number);


--
-- Name: stock_items stock_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_items
    ADD CONSTRAINT stock_items_pkey PRIMARY KEY (id);


--
-- Name: stock_lots stock_lots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_lots
    ADD CONSTRAINT stock_lots_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: stock_take_counts stock_take_counts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_take_counts
    ADD CONSTRAINT stock_take_counts_pkey PRIMARY KEY (id);


--
-- Name: stock_take_counts stock_take_counts_stock_take_id_stock_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_take_counts
    ADD CONSTRAINT stock_take_counts_stock_take_id_stock_item_id_key UNIQUE (stock_take_id, stock_item_id);


--
-- Name: stock_takes stock_takes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_takes
    ADD CONSTRAINT stock_takes_pkey PRIMARY KEY (id);


--
-- Name: supplier_return_lines supplier_return_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_return_lines
    ADD CONSTRAINT supplier_return_lines_pkey PRIMARY KEY (id);


--
-- Name: supplier_returns supplier_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_returns
    ADD CONSTRAINT supplier_returns_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_name_key UNIQUE (name);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: tyre_details tyre_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tyre_details
    ADD CONSTRAINT tyre_details_pkey PRIMARY KEY (stock_item_id);


--
-- Name: vehicle_model_fitments vehicle_model_fitments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_model_fitments
    ADD CONSTRAINT vehicle_model_fitments_pkey PRIMARY KEY (id);


--
-- Name: vehicle_model_fitments vehicle_model_fitments_vehicle_model_id_stock_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_model_fitments
    ADD CONSTRAINT vehicle_model_fitments_vehicle_model_id_stock_item_id_key UNIQUE (vehicle_model_id, stock_item_id);


--
-- Name: vehicle_model_lubricants vehicle_model_lubricants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_model_lubricants
    ADD CONSTRAINT vehicle_model_lubricants_pkey PRIMARY KEY (id);


--
-- Name: vehicle_models vehicle_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_models
    ADD CONSTRAINT vehicle_models_pkey PRIMARY KEY (id);


--
-- Name: vehicles vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);


--
-- Name: vehicles vehicles_registration_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_registration_key UNIQUE (registration);


--
-- Name: vehicles vehicles_vin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_vin_key UNIQUE (vin);


--
-- Name: black_circle_stock_lots_job_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX black_circle_stock_lots_job_idx ON public.black_circle_stock_lots USING btree (job_id);


--
-- Name: black_circle_stock_lots_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX black_circle_stock_lots_status_idx ON public.black_circle_stock_lots USING btree (status);


--
-- Name: black_circle_stock_lots_stock_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX black_circle_stock_lots_stock_item_idx ON public.black_circle_stock_lots USING btree (stock_item_id);


--
-- Name: consignment_stock_lots_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX consignment_stock_lots_status_idx ON public.consignment_stock_lots USING btree (status);


--
-- Name: consignment_stock_lots_stock_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX consignment_stock_lots_stock_item_idx ON public.consignment_stock_lots USING btree (stock_item_id);


--
-- Name: jobs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_status_idx ON public.jobs USING btree (status);


--
-- Name: jobs_vehicle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_vehicle_idx ON public.jobs USING btree (vehicle_id) WHERE (vehicle_id IS NOT NULL);


--
-- Name: part_details_make_model_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX part_details_make_model_idx ON public.part_details USING btree (vehicle_make, vehicle_model);


--
-- Name: purchase_order_lines_po_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_order_lines_po_idx ON public.purchase_order_lines USING btree (purchase_order_id);


--
-- Name: purchase_orders_ordered_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_orders_ordered_at_idx ON public.purchase_orders USING btree (ordered_at);


--
-- Name: purchase_orders_supplier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_orders_supplier_idx ON public.purchase_orders USING btree (supplier_id);


--
-- Name: stock_items_item_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_items_item_type_idx ON public.stock_items USING btree (item_type);


--
-- Name: stock_items_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_items_name_idx ON public.stock_items USING gin (to_tsvector('english'::regconfig, name));


--
-- Name: stock_items_supplier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_items_supplier_idx ON public.stock_items USING btree (supplier_id);


--
-- Name: stock_lots_invoice_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_lots_invoice_number_idx ON public.stock_lots USING btree (invoice_number) WHERE (invoice_number IS NOT NULL);


--
-- Name: stock_lots_order_lot_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_lots_order_lot_idx ON public.stock_lots USING btree (order_lot_id) WHERE (order_lot_id IS NOT NULL);


--
-- Name: stock_lots_payment_due_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_lots_payment_due_date_idx ON public.stock_lots USING btree (payment_due_date) WHERE (payment_due_date IS NOT NULL);


--
-- Name: stock_lots_return_by_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_lots_return_by_date_idx ON public.stock_lots USING btree (return_by_date) WHERE (return_by_date IS NOT NULL);


--
-- Name: stock_lots_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_lots_status_idx ON public.stock_lots USING btree (status);


--
-- Name: stock_lots_stock_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_lots_stock_item_idx ON public.stock_lots USING btree (stock_item_id);


--
-- Name: stock_lots_supplier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_lots_supplier_idx ON public.stock_lots USING btree (supplier_id) WHERE (supplier_id IS NOT NULL);


--
-- Name: stock_movements_black_circle_lot_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_black_circle_lot_idx ON public.stock_movements USING btree (black_circle_lot_id) WHERE (black_circle_lot_id IS NOT NULL);


--
-- Name: stock_movements_consignment_lot_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_consignment_lot_idx ON public.stock_movements USING btree (consignment_lot_id) WHERE (consignment_lot_id IS NOT NULL);


--
-- Name: stock_movements_job_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_job_idx ON public.stock_movements USING btree (job_id) WHERE (job_id IS NOT NULL);


--
-- Name: stock_movements_job_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_job_number_idx ON public.stock_movements USING btree (job_number) WHERE (job_number IS NOT NULL);


--
-- Name: stock_movements_stock_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_stock_item_idx ON public.stock_movements USING btree (stock_item_id, created_at DESC);


--
-- Name: stock_movements_stock_lot_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_stock_lot_idx ON public.stock_movements USING btree (stock_lot_id) WHERE (stock_lot_id IS NOT NULL);


--
-- Name: stock_movements_stock_take_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_stock_take_idx ON public.stock_movements USING btree (stock_take_id) WHERE (stock_take_id IS NOT NULL);


--
-- Name: stock_take_counts_stock_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_take_counts_stock_item_idx ON public.stock_take_counts USING btree (stock_item_id);


--
-- Name: stock_take_counts_stock_take_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_take_counts_stock_take_idx ON public.stock_take_counts USING btree (stock_take_id);


--
-- Name: stock_takes_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_takes_status_idx ON public.stock_takes USING btree (status);


--
-- Name: supplier_return_lines_return_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplier_return_lines_return_idx ON public.supplier_return_lines USING btree (supplier_return_id);


--
-- Name: supplier_returns_supplier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplier_returns_supplier_idx ON public.supplier_returns USING btree (supplier_id);


--
-- Name: tyre_details_season_tier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tyre_details_season_tier_idx ON public.tyre_details USING btree (season, tier);


--
-- Name: tyre_details_size_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tyre_details_size_idx ON public.tyre_details USING btree (width, profile, rim_diameter);


--
-- Name: vehicle_model_fitments_model_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vehicle_model_fitments_model_idx ON public.vehicle_model_fitments USING btree (vehicle_model_id);


--
-- Name: vehicle_model_fitments_stock_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vehicle_model_fitments_stock_item_idx ON public.vehicle_model_fitments USING btree (stock_item_id);


--
-- Name: vehicle_model_lubricants_model_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vehicle_model_lubricants_model_idx ON public.vehicle_model_lubricants USING btree (vehicle_model_id);


--
-- Name: vehicle_models_make_model_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vehicle_models_make_model_idx ON public.vehicle_models USING btree (make, model);


--
-- Name: jobs guard_job_reopen; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_job_reopen BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.guard_job_reopen();


--
-- Name: profiles guard_profile_privileged_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_profile_privileged_fields BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_fields();


--
-- Name: stock_take_counts guard_stock_take_count_reconciliation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_stock_take_count_reconciliation BEFORE UPDATE ON public.stock_take_counts FOR EACH ROW EXECUTE FUNCTION public.guard_stock_take_count_reconciliation();


--
-- Name: stock_movements on_stock_movement_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_stock_movement_insert AFTER INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();


--
-- Name: black_circle_stock_lots set_black_circle_stock_lots_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_black_circle_stock_lots_updated_at BEFORE UPDATE ON public.black_circle_stock_lots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: consignment_stock_lots set_consignment_stock_lots_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_consignment_stock_lots_updated_at BEFORE UPDATE ON public.consignment_stock_lots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: jobs set_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: profiles set_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: purchase_order_lines set_purchase_order_lines_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_purchase_order_lines_updated_at BEFORE UPDATE ON public.purchase_order_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: purchase_orders set_purchase_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_purchase_orders_updated_at BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: stock_items set_stock_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_stock_items_updated_at BEFORE UPDATE ON public.stock_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: stock_lots set_stock_lots_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_stock_lots_updated_at BEFORE UPDATE ON public.stock_lots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: stock_takes set_stock_takes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_stock_takes_updated_at BEFORE UPDATE ON public.stock_takes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: supplier_returns set_supplier_returns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_supplier_returns_updated_at BEFORE UPDATE ON public.supplier_returns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: suppliers set_suppliers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: vehicle_models set_vehicle_models_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_vehicle_models_updated_at BEFORE UPDATE ON public.vehicle_models FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: vehicles set_vehicles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_vehicles_updated_at BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: black_circle_stock_lots black_circle_stock_lots_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.black_circle_stock_lots
    ADD CONSTRAINT black_circle_stock_lots_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: black_circle_stock_lots black_circle_stock_lots_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.black_circle_stock_lots
    ADD CONSTRAINT black_circle_stock_lots_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id);


--
-- Name: black_circle_stock_lots black_circle_stock_lots_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.black_circle_stock_lots
    ADD CONSTRAINT black_circle_stock_lots_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.profiles(id);


--
-- Name: black_circle_stock_lots black_circle_stock_lots_returned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.black_circle_stock_lots
    ADD CONSTRAINT black_circle_stock_lots_returned_by_fkey FOREIGN KEY (returned_by) REFERENCES public.profiles(id);


--
-- Name: black_circle_stock_lots black_circle_stock_lots_stock_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.black_circle_stock_lots
    ADD CONSTRAINT black_circle_stock_lots_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id);


--
-- Name: black_circle_stock_lots black_circle_stock_lots_used_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.black_circle_stock_lots
    ADD CONSTRAINT black_circle_stock_lots_used_by_fkey FOREIGN KEY (used_by) REFERENCES public.profiles(id);


--
-- Name: consignment_stock_lots consignment_stock_lots_committed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consignment_stock_lots
    ADD CONSTRAINT consignment_stock_lots_committed_by_fkey FOREIGN KEY (committed_by) REFERENCES public.profiles(id);


--
-- Name: consignment_stock_lots consignment_stock_lots_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consignment_stock_lots
    ADD CONSTRAINT consignment_stock_lots_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: consignment_stock_lots consignment_stock_lots_paid_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consignment_stock_lots
    ADD CONSTRAINT consignment_stock_lots_paid_by_fkey FOREIGN KEY (paid_by) REFERENCES public.profiles(id);


--
-- Name: consignment_stock_lots consignment_stock_lots_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consignment_stock_lots
    ADD CONSTRAINT consignment_stock_lots_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.profiles(id);


--
-- Name: consignment_stock_lots consignment_stock_lots_returned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consignment_stock_lots
    ADD CONSTRAINT consignment_stock_lots_returned_by_fkey FOREIGN KEY (returned_by) REFERENCES public.profiles(id);


--
-- Name: consignment_stock_lots consignment_stock_lots_stock_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consignment_stock_lots
    ADD CONSTRAINT consignment_stock_lots_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id);


--
-- Name: jobs jobs_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.profiles(id);


--
-- Name: jobs jobs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: jobs jobs_reopened_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_reopened_by_fkey FOREIGN KEY (reopened_by) REFERENCES public.profiles(id);


--
-- Name: jobs jobs_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id);


--
-- Name: part_details part_details_stock_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.part_details
    ADD CONSTRAINT part_details_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_deactivated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_deactivated_by_fkey FOREIGN KEY (deactivated_by) REFERENCES public.profiles(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: purchase_order_lines purchase_order_lines_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_lines
    ADD CONSTRAINT purchase_order_lines_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: purchase_order_lines purchase_order_lines_stock_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_lines
    ADD CONSTRAINT purchase_order_lines_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id);


--
-- Name: purchase_orders purchase_orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: purchase_orders purchase_orders_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: stock_items stock_items_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_items
    ADD CONSTRAINT stock_items_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: stock_lots stock_lots_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_lots
    ADD CONSTRAINT stock_lots_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: stock_lots stock_lots_invoice_paid_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_lots
    ADD CONSTRAINT stock_lots_invoice_paid_by_fkey FOREIGN KEY (invoice_paid_by) REFERENCES public.profiles(id);


--
-- Name: stock_lots stock_lots_order_lot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_lots
    ADD CONSTRAINT stock_lots_order_lot_id_fkey FOREIGN KEY (order_lot_id) REFERENCES public.stock_lots(id) ON DELETE SET NULL;


--
-- Name: stock_lots stock_lots_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_lots
    ADD CONSTRAINT stock_lots_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.profiles(id);


--
-- Name: stock_lots stock_lots_stock_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_lots
    ADD CONSTRAINT stock_lots_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id);


--
-- Name: stock_lots stock_lots_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_lots
    ADD CONSTRAINT stock_lots_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: stock_movements stock_movements_black_circle_lot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_black_circle_lot_id_fkey FOREIGN KEY (black_circle_lot_id) REFERENCES public.black_circle_stock_lots(id);


--
-- Name: stock_movements stock_movements_consignment_lot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_consignment_lot_id_fkey FOREIGN KEY (consignment_lot_id) REFERENCES public.consignment_stock_lots(id);


--
-- Name: stock_movements stock_movements_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id);


--
-- Name: stock_movements stock_movements_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.profiles(id);


--
-- Name: stock_movements stock_movements_purchase_order_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_purchase_order_fk FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id);


--
-- Name: stock_movements stock_movements_stock_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id);


--
-- Name: stock_movements stock_movements_stock_lot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_stock_lot_id_fkey FOREIGN KEY (stock_lot_id) REFERENCES public.stock_lots(id) ON DELETE SET NULL;


--
-- Name: stock_movements stock_movements_stock_take_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_stock_take_id_fkey FOREIGN KEY (stock_take_id) REFERENCES public.stock_takes(id);


--
-- Name: stock_movements stock_movements_supplier_return_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_supplier_return_fk FOREIGN KEY (supplier_return_id) REFERENCES public.supplier_returns(id);


--
-- Name: stock_take_counts stock_take_counts_counted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_take_counts
    ADD CONSTRAINT stock_take_counts_counted_by_fkey FOREIGN KEY (counted_by) REFERENCES public.profiles(id);


--
-- Name: stock_take_counts stock_take_counts_reconciled_movement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_take_counts
    ADD CONSTRAINT stock_take_counts_reconciled_movement_id_fkey FOREIGN KEY (reconciled_movement_id) REFERENCES public.stock_movements(id);


--
-- Name: stock_take_counts stock_take_counts_stock_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_take_counts
    ADD CONSTRAINT stock_take_counts_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id);


--
-- Name: stock_take_counts stock_take_counts_stock_take_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_take_counts
    ADD CONSTRAINT stock_take_counts_stock_take_id_fkey FOREIGN KEY (stock_take_id) REFERENCES public.stock_takes(id) ON DELETE CASCADE;


--
-- Name: stock_takes stock_takes_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_takes
    ADD CONSTRAINT stock_takes_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.profiles(id);


--
-- Name: stock_takes stock_takes_started_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_takes
    ADD CONSTRAINT stock_takes_started_by_fkey FOREIGN KEY (started_by) REFERENCES public.profiles(id);


--
-- Name: supplier_return_lines supplier_return_lines_stock_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_return_lines
    ADD CONSTRAINT supplier_return_lines_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id);


--
-- Name: supplier_return_lines supplier_return_lines_supplier_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_return_lines
    ADD CONSTRAINT supplier_return_lines_supplier_return_id_fkey FOREIGN KEY (supplier_return_id) REFERENCES public.supplier_returns(id) ON DELETE CASCADE;


--
-- Name: supplier_returns supplier_returns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_returns
    ADD CONSTRAINT supplier_returns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: supplier_returns supplier_returns_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_returns
    ADD CONSTRAINT supplier_returns_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: tyre_details tyre_details_stock_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tyre_details
    ADD CONSTRAINT tyre_details_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id) ON DELETE CASCADE;


--
-- Name: vehicle_model_fitments vehicle_model_fitments_stock_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_model_fitments
    ADD CONSTRAINT vehicle_model_fitments_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id) ON DELETE CASCADE;


--
-- Name: vehicle_model_fitments vehicle_model_fitments_vehicle_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_model_fitments
    ADD CONSTRAINT vehicle_model_fitments_vehicle_model_id_fkey FOREIGN KEY (vehicle_model_id) REFERENCES public.vehicle_models(id) ON DELETE CASCADE;


--
-- Name: vehicle_model_lubricants vehicle_model_lubricants_vehicle_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_model_lubricants
    ADD CONSTRAINT vehicle_model_lubricants_vehicle_model_id_fkey FOREIGN KEY (vehicle_model_id) REFERENCES public.vehicle_models(id) ON DELETE CASCADE;


--
-- Name: vehicles vehicles_vehicle_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_vehicle_model_id_fkey FOREIGN KEY (vehicle_model_id) REFERENCES public.vehicle_models(id);


--
-- Name: profiles Admins can manage all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all profiles" ON public.profiles TO authenticated USING ((public.current_staff_role() = 'admin'::public.staff_role)) WITH CHECK ((public.current_staff_role() = 'admin'::public.staff_role));


--
-- Name: black_circle_stock_lots Admins/managers can manage black circle stock lots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can manage black circle stock lots" ON public.black_circle_stock_lots TO authenticated USING ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role]))) WITH CHECK ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role])));


--
-- Name: consignment_stock_lots Admins/managers can manage consignment stock lots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can manage consignment stock lots" ON public.consignment_stock_lots TO authenticated USING ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role]))) WITH CHECK ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role])));


--
-- Name: part_details Admins/managers can manage part details; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can manage part details" ON public.part_details TO authenticated USING ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role]))) WITH CHECK ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role])));


--
-- Name: purchase_order_lines Admins/managers can manage purchase order lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can manage purchase order lines" ON public.purchase_order_lines TO authenticated USING ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role]))) WITH CHECK ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role])));


--
-- Name: purchase_orders Admins/managers can manage purchase orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can manage purchase orders" ON public.purchase_orders TO authenticated USING ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role]))) WITH CHECK ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role])));


--
-- Name: stock_items Admins/managers can manage stock items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can manage stock items" ON public.stock_items TO authenticated USING ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role]))) WITH CHECK ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role])));


--
-- Name: stock_lots Admins/managers can manage stock lots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can manage stock lots" ON public.stock_lots TO authenticated USING ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role]))) WITH CHECK ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role])));


--
-- Name: supplier_return_lines Admins/managers can manage supplier return lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can manage supplier return lines" ON public.supplier_return_lines TO authenticated USING ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role]))) WITH CHECK ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role])));


--
-- Name: supplier_returns Admins/managers can manage supplier returns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can manage supplier returns" ON public.supplier_returns TO authenticated USING ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role]))) WITH CHECK ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role])));


--
-- Name: suppliers Admins/managers can manage suppliers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can manage suppliers" ON public.suppliers TO authenticated USING ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role]))) WITH CHECK ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role])));


--
-- Name: tyre_details Admins/managers can manage tyre details; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can manage tyre details" ON public.tyre_details TO authenticated USING ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role]))) WITH CHECK ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role])));


--
-- Name: vehicle_model_fitments Admins/managers can manage vehicle fitments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can manage vehicle fitments" ON public.vehicle_model_fitments TO authenticated USING ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role]))) WITH CHECK ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role])));


--
-- Name: vehicle_model_lubricants Admins/managers can manage vehicle lubricants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can manage vehicle lubricants" ON public.vehicle_model_lubricants TO authenticated USING ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role]))) WITH CHECK ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role])));


--
-- Name: vehicle_models Admins/managers can manage vehicle models; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can manage vehicle models" ON public.vehicle_models TO authenticated USING ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role]))) WITH CHECK ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role])));


--
-- Name: vehicles Admins/managers can manage vehicles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can manage vehicles" ON public.vehicles TO authenticated USING ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role]))) WITH CHECK ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role])));


--
-- Name: stock_take_counts Admins/managers can reconcile stock take counts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can reconcile stock take counts" ON public.stock_take_counts FOR UPDATE TO authenticated USING ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role]))) WITH CHECK ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role])));


--
-- Name: stock_movements Admins/managers can record other stock movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can record other stock movements" ON public.stock_movements FOR INSERT TO authenticated WITH CHECK (((movement_type <> 'used'::public.stock_movement_type) AND (performed_by = auth.uid()) AND (public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role]))));


--
-- Name: stock_takes Admins/managers can start stock takes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can start stock takes" ON public.stock_takes FOR INSERT TO authenticated WITH CHECK (((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role])) AND (started_by = auth.uid())));


--
-- Name: stock_takes Admins/managers can update stock takes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins/managers can update stock takes" ON public.stock_takes FOR UPDATE TO authenticated USING ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role]))) WITH CHECK ((public.current_staff_role() = ANY (ARRAY['admin'::public.staff_role, 'manager'::public.staff_role])));


--
-- Name: profiles Profiles are viewable by authenticated staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Profiles are viewable by authenticated staff" ON public.profiles FOR SELECT TO authenticated USING ((public.is_active_staff() OR (id = auth.uid())));


--
-- Name: stock_take_counts Staff can correct in-progress stock take counts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can correct in-progress stock take counts" ON public.stock_take_counts FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.stock_takes st
  WHERE ((st.id = stock_take_counts.stock_take_id) AND (st.status = 'in_progress'::public.stock_take_status)))) AND public.is_active_staff())) WITH CHECK (((counted_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.stock_takes st
  WHERE ((st.id = stock_take_counts.stock_take_id) AND (st.status = 'in_progress'::public.stock_take_status)))) AND public.is_active_staff()));


--
-- Name: jobs Staff can create jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can create jobs" ON public.jobs FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND public.is_active_staff()));


--
-- Name: black_circle_stock_lots Staff can read black circle stock lots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read black circle stock lots" ON public.black_circle_stock_lots FOR SELECT TO authenticated USING (public.is_active_staff());


--
-- Name: consignment_stock_lots Staff can read consignment stock lots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read consignment stock lots" ON public.consignment_stock_lots FOR SELECT TO authenticated USING (public.is_active_staff());


--
-- Name: jobs Staff can read jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read jobs" ON public.jobs FOR SELECT TO authenticated USING (public.is_active_staff());


--
-- Name: part_details Staff can read part details; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read part details" ON public.part_details FOR SELECT TO authenticated USING (public.is_active_staff());


--
-- Name: purchase_order_lines Staff can read purchase order lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read purchase order lines" ON public.purchase_order_lines FOR SELECT TO authenticated USING (public.is_active_staff());


--
-- Name: purchase_orders Staff can read purchase orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read purchase orders" ON public.purchase_orders FOR SELECT TO authenticated USING (public.is_active_staff());


--
-- Name: stock_items Staff can read stock items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read stock items" ON public.stock_items FOR SELECT TO authenticated USING (public.is_active_staff());


--
-- Name: stock_lots Staff can read stock lots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read stock lots" ON public.stock_lots FOR SELECT TO authenticated USING (public.is_active_staff());


--
-- Name: stock_movements Staff can read stock movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read stock movements" ON public.stock_movements FOR SELECT TO authenticated USING (public.is_active_staff());


--
-- Name: stock_take_counts Staff can read stock take counts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read stock take counts" ON public.stock_take_counts FOR SELECT TO authenticated USING (public.is_active_staff());


--
-- Name: stock_takes Staff can read stock takes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read stock takes" ON public.stock_takes FOR SELECT TO authenticated USING (public.is_active_staff());


--
-- Name: supplier_return_lines Staff can read supplier return lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read supplier return lines" ON public.supplier_return_lines FOR SELECT TO authenticated USING (public.is_active_staff());


--
-- Name: supplier_returns Staff can read supplier returns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read supplier returns" ON public.supplier_returns FOR SELECT TO authenticated USING (public.is_active_staff());


--
-- Name: suppliers Staff can read suppliers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read suppliers" ON public.suppliers FOR SELECT TO authenticated USING (public.is_active_staff());


--
-- Name: tyre_details Staff can read tyre details; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read tyre details" ON public.tyre_details FOR SELECT TO authenticated USING (public.is_active_staff());


--
-- Name: vehicle_model_fitments Staff can read vehicle fitments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read vehicle fitments" ON public.vehicle_model_fitments FOR SELECT TO authenticated USING (public.is_active_staff());


--
-- Name: vehicle_model_lubricants Staff can read vehicle lubricants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read vehicle lubricants" ON public.vehicle_model_lubricants FOR SELECT TO authenticated USING (public.is_active_staff());


--
-- Name: vehicle_models Staff can read vehicle models; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read vehicle models" ON public.vehicle_models FOR SELECT TO authenticated USING (public.is_active_staff());


--
-- Name: vehicles Staff can read vehicles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read vehicles" ON public.vehicles FOR SELECT TO authenticated USING (public.is_active_staff());


--
-- Name: stock_take_counts Staff can record stock take counts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can record stock take counts" ON public.stock_take_counts FOR INSERT TO authenticated WITH CHECK (((counted_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.stock_takes st
  WHERE ((st.id = stock_take_counts.stock_take_id) AND (st.status = 'in_progress'::public.stock_take_status)))) AND public.is_active_staff()));


--
-- Name: stock_movements Staff can record stock usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can record stock usage" ON public.stock_movements FOR INSERT TO authenticated WITH CHECK (((movement_type = 'used'::public.stock_movement_type) AND (performed_by = auth.uid()) AND (job_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.jobs j
  WHERE ((j.id = stock_movements.job_id) AND (j.status = 'open'::public.job_status)))) AND public.is_active_staff()));


--
-- Name: jobs Staff can update jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can update jobs" ON public.jobs FOR UPDATE TO authenticated USING (public.is_active_staff()) WITH CHECK (public.is_active_staff());


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (((auth.uid() = id) AND public.is_active_staff())) WITH CHECK (((auth.uid() = id) AND public.is_active_staff()));


--
-- Name: black_circle_stock_lots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.black_circle_stock_lots ENABLE ROW LEVEL SECURITY;

--
-- Name: consignment_stock_lots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consignment_stock_lots ENABLE ROW LEVEL SECURITY;

--
-- Name: jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: part_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.part_details ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_order_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_lots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_lots ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_take_counts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_take_counts ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_takes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_takes ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_return_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_return_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_returns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_returns ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: tyre_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tyre_details ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicle_model_fitments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vehicle_model_fitments ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicle_model_lubricants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vehicle_model_lubricants ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicle_models; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vehicle_models ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION apply_stock_movement(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.apply_stock_movement() TO anon;
GRANT ALL ON FUNCTION public.apply_stock_movement() TO authenticated;
GRANT ALL ON FUNCTION public.apply_stock_movement() TO service_role;


--
-- Name: FUNCTION current_staff_role(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_staff_role() TO anon;
GRANT ALL ON FUNCTION public.current_staff_role() TO authenticated;
GRANT ALL ON FUNCTION public.current_staff_role() TO service_role;


--
-- Name: FUNCTION guard_job_reopen(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_job_reopen() TO anon;
GRANT ALL ON FUNCTION public.guard_job_reopen() TO authenticated;
GRANT ALL ON FUNCTION public.guard_job_reopen() TO service_role;


--
-- Name: FUNCTION guard_profile_privileged_fields(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_profile_privileged_fields() TO anon;
GRANT ALL ON FUNCTION public.guard_profile_privileged_fields() TO authenticated;
GRANT ALL ON FUNCTION public.guard_profile_privileged_fields() TO service_role;


--
-- Name: FUNCTION guard_stock_take_count_reconciliation(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_stock_take_count_reconciliation() TO anon;
GRANT ALL ON FUNCTION public.guard_stock_take_count_reconciliation() TO authenticated;
GRANT ALL ON FUNCTION public.guard_stock_take_count_reconciliation() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION is_active_staff(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_active_staff() TO anon;
GRANT ALL ON FUNCTION public.is_active_staff() TO authenticated;
GRANT ALL ON FUNCTION public.is_active_staff() TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: TABLE black_circle_stock_lots; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.black_circle_stock_lots TO anon;
GRANT ALL ON TABLE public.black_circle_stock_lots TO authenticated;
GRANT ALL ON TABLE public.black_circle_stock_lots TO service_role;


--
-- Name: TABLE consignment_stock_lots; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.consignment_stock_lots TO anon;
GRANT ALL ON TABLE public.consignment_stock_lots TO authenticated;
GRANT ALL ON TABLE public.consignment_stock_lots TO service_role;


--
-- Name: TABLE jobs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.jobs TO anon;
GRANT ALL ON TABLE public.jobs TO authenticated;
GRANT ALL ON TABLE public.jobs TO service_role;


--
-- Name: TABLE part_details; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.part_details TO anon;
GRANT ALL ON TABLE public.part_details TO authenticated;
GRANT ALL ON TABLE public.part_details TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE purchase_order_lines; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.purchase_order_lines TO anon;
GRANT ALL ON TABLE public.purchase_order_lines TO authenticated;
GRANT ALL ON TABLE public.purchase_order_lines TO service_role;


--
-- Name: TABLE purchase_orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.purchase_orders TO anon;
GRANT ALL ON TABLE public.purchase_orders TO authenticated;
GRANT ALL ON TABLE public.purchase_orders TO service_role;


--
-- Name: TABLE stock_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.stock_items TO anon;
GRANT ALL ON TABLE public.stock_items TO authenticated;
GRANT ALL ON TABLE public.stock_items TO service_role;


--
-- Name: TABLE stock_lots; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.stock_lots TO anon;
GRANT ALL ON TABLE public.stock_lots TO authenticated;
GRANT ALL ON TABLE public.stock_lots TO service_role;


--
-- Name: TABLE stock_movements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.stock_movements TO anon;
GRANT ALL ON TABLE public.stock_movements TO authenticated;
GRANT ALL ON TABLE public.stock_movements TO service_role;


--
-- Name: TABLE stock_take_counts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.stock_take_counts TO anon;
GRANT ALL ON TABLE public.stock_take_counts TO authenticated;
GRANT ALL ON TABLE public.stock_take_counts TO service_role;


--
-- Name: TABLE stock_takes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.stock_takes TO anon;
GRANT ALL ON TABLE public.stock_takes TO authenticated;
GRANT ALL ON TABLE public.stock_takes TO service_role;


--
-- Name: TABLE supplier_return_lines; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.supplier_return_lines TO anon;
GRANT ALL ON TABLE public.supplier_return_lines TO authenticated;
GRANT ALL ON TABLE public.supplier_return_lines TO service_role;


--
-- Name: TABLE supplier_returns; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.supplier_returns TO anon;
GRANT ALL ON TABLE public.supplier_returns TO authenticated;
GRANT ALL ON TABLE public.supplier_returns TO service_role;


--
-- Name: TABLE suppliers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.suppliers TO anon;
GRANT ALL ON TABLE public.suppliers TO authenticated;
GRANT ALL ON TABLE public.suppliers TO service_role;


--
-- Name: TABLE tyre_details; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tyre_details TO anon;
GRANT ALL ON TABLE public.tyre_details TO authenticated;
GRANT ALL ON TABLE public.tyre_details TO service_role;


--
-- Name: TABLE v_consignment_pending_payments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_consignment_pending_payments TO anon;
GRANT ALL ON TABLE public.v_consignment_pending_payments TO authenticated;
GRANT ALL ON TABLE public.v_consignment_pending_payments TO service_role;


--
-- Name: TABLE v_orders_report; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_orders_report TO anon;
GRANT ALL ON TABLE public.v_orders_report TO authenticated;
GRANT ALL ON TABLE public.v_orders_report TO service_role;


--
-- Name: TABLE v_purchase_costs_weekly; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_purchase_costs_weekly TO anon;
GRANT ALL ON TABLE public.v_purchase_costs_weekly TO authenticated;
GRANT ALL ON TABLE public.v_purchase_costs_weekly TO service_role;


--
-- Name: TABLE v_reorder_report; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_reorder_report TO anon;
GRANT ALL ON TABLE public.v_reorder_report TO authenticated;
GRANT ALL ON TABLE public.v_reorder_report TO service_role;


--
-- Name: TABLE v_returnable_stock; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_returnable_stock TO anon;
GRANT ALL ON TABLE public.v_returnable_stock TO authenticated;
GRANT ALL ON TABLE public.v_returnable_stock TO service_role;


--
-- Name: TABLE v_supplier_return_credits_weekly; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_supplier_return_credits_weekly TO anon;
GRANT ALL ON TABLE public.v_supplier_return_credits_weekly TO authenticated;
GRANT ALL ON TABLE public.v_supplier_return_credits_weekly TO service_role;


--
-- Name: TABLE vehicle_model_fitments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vehicle_model_fitments TO anon;
GRANT ALL ON TABLE public.vehicle_model_fitments TO authenticated;
GRANT ALL ON TABLE public.vehicle_model_fitments TO service_role;


--
-- Name: TABLE vehicle_model_lubricants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vehicle_model_lubricants TO anon;
GRANT ALL ON TABLE public.vehicle_model_lubricants TO authenticated;
GRANT ALL ON TABLE public.vehicle_model_lubricants TO service_role;


--
-- Name: TABLE vehicle_models; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vehicle_models TO anon;
GRANT ALL ON TABLE public.vehicle_models TO authenticated;
GRANT ALL ON TABLE public.vehicle_models TO service_role;


--
-- Name: TABLE vehicles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vehicles TO anon;
GRANT ALL ON TABLE public.vehicles TO authenticated;
GRANT ALL ON TABLE public.vehicles TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;

--
-- Auth hook: every new login (auth.users row) automatically gets a
-- public.profiles row (role mechanic; username from the login metadata).
--

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMIT;
