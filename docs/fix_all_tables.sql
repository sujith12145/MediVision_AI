-- =============================================================================
-- MediVision AI — Complete Database Migration
-- File   : docs/fix_all_tables.sql
-- Purpose: Creates user_roles and pending_approvals tables idempotently.
--          Safe to run multiple times (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- How    : Paste entire script into Supabase SQL Editor and click Run.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: public.user_roles
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_roles (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(255) UNIQUE NOT NULL,
  role        VARCHAR(50)  NOT NULL
                           CHECK (role IN ('admin', 'pharmacist', 'staff')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  assigned_by VARCHAR(255)
);

-- Index for fast role-lookup by email (used on every login)
CREATE INDEX IF NOT EXISTS idx_user_roles_email
  ON public.user_roles (email);

-- Disable RLS during development so the service_role key works without policies
ALTER TABLE public.user_roles DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: public.pending_approvals
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pending_approvals (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email          VARCHAR(255) NOT NULL,
  token          UUID        NOT NULL DEFAULT gen_random_uuid(),
  requested_role VARCHAR(50) NOT NULL DEFAULT 'admin'
                              CHECK (requested_role IN ('admin', 'pharmacist', 'staff')),
  status         VARCHAR(50) NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast token lookup (approve link) and email lookup (duplicate check)
CREATE INDEX IF NOT EXISTS idx_pending_approvals_token
  ON public.pending_approvals (token);

CREATE INDEX IF NOT EXISTS idx_pending_approvals_email
  ON public.pending_approvals (email);

-- Disable RLS during development
ALTER TABLE public.pending_approvals DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Seed initial admin users
-- Replace the placeholder emails with real ones if needed.
-- ON CONFLICT DO NOTHING is safe to run repeatedly.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.user_roles (email, role, assigned_by)
VALUES
  ('sathish.madhu777@gmail.com',   'admin',      'system_seed'),
  ('admin@medivision.local',       'admin',      'system_seed'),
  ('pharmacist@medivision.local',  'pharmacist', 'system_seed'),
  ('staff@medivision.local',       'staff',      'system_seed')
ON CONFLICT (email) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: Force PostgREST schema cache reload
-- This tells PostgREST to re-read the schema immediately, fixing PGRST205.
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: Verification — confirm tables and seed data exist
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  'user_roles'       AS table_name,
  COUNT(*)           AS row_count
FROM public.user_roles
UNION ALL
SELECT
  'pending_approvals' AS table_name,
  COUNT(*)            AS row_count
FROM public.pending_approvals;
