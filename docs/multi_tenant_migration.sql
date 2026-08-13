-- =============================================================================
-- MediVision AI — Multi-Tenant Database Migration
-- File   : docs/multi_tenant_migration.sql
-- Purpose: Creates pharmacies table, updates user_roles and pending_approvals
--          for multi-tenancy, adds RLS policies, seeds super admin.
-- How    : Paste entire script into Supabase SQL Editor and click Run.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Create pharmacies table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacies (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  created_by  VARCHAR(255) NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_pharmacies_created_by
  ON public.pharmacies (created_by);

-- Disable RLS during development (service_role bypasses RLS anyway)
ALTER TABLE public.pharmacies DISABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Update user_roles table - add pharmacy_id and super_admin role
-- ─────────────────────────────────────────────────────────────────────────────

-- Add pharmacy_id column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_roles' AND column_name = 'pharmacy_id'
  ) THEN
    ALTER TABLE public.user_roles ADD COLUMN pharmacy_id UUID REFERENCES public.pharmacies(id);
  END IF;
END $$;

-- Update role check constraint to include super_admin
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('super_admin', 'admin', 'pharmacist', 'staff'));

-- Index for pharmacy_id lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_pharmacy_id
  ON public.user_roles (pharmacy_id);

-- Index for email lookups (already exists but ensuring)
CREATE INDEX IF NOT EXISTS idx_user_roles_email
  ON public.user_roles (email);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Update pending_approvals table - add pharmacy_name
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pending_approvals' AND column_name = 'pharmacy_name'
  ) THEN
    ALTER TABLE public.pending_approvals ADD COLUMN pharmacy_name VARCHAR(255);
  END IF;
END $$;

-- Index for pharmacy_name
CREATE INDEX IF NOT EXISTS idx_pending_approvals_pharmacy_name
  ON public.pending_approvals (pharmacy_name);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: RLS Policies for Multi-Tenancy
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable RLS on all tables
ALTER TABLE public.pharmacies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_approvals ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (safe to re-run)
DROP POLICY IF EXISTS "Super admin full access pharmacies" ON public.pharmacies;
DROP POLICY IF EXISTS "Tenant admin read own pharmacy" ON public.pharmacies;
DROP POLICY IF EXISTS "Super admin full access user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Tenant admin manage own pharmacy users" ON public.user_roles;
DROP POLICY IF EXISTS "Users read own role" ON public.user_roles;
DROP POLICY IF EXISTS "Anyone can request access" ON public.pending_approvals;
DROP POLICY IF EXISTS "Super admin manage all pending" ON public.pending_approvals;
DROP POLICY IF EXISTS "Tenant admin view own pharmacy pending" ON public.pending_approvals;

-- Helper function to check if current user is super_admin
-- We use auth.jwt() to get the role from the JWT claims
-- Note: In production, you might want a proper SECURITY DEFINER function

-- PHARMACIES POLICIES
-- Super admin can do everything
CREATE POLICY "Super admin full access pharmacies" ON public.pharmacies
  FOR ALL USING (
    (auth.jwt() ->> 'role') = 'super_admin'
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'super_admin'
  );

-- Tenant admin can read their own pharmacy
CREATE POLICY "Tenant admin read own pharmacy" ON public.pharmacies
  FOR SELECT USING (
    id IN (
      SELECT pharmacy_id FROM public.user_roles
      WHERE email = auth.email() AND role = 'admin'
    )
  );

-- USER_ROLES POLICIES
-- Super admin full access
CREATE POLICY "Super admin full access user_roles" ON public.user_roles
  FOR ALL USING (
    (auth.jwt() ->> 'role') = 'super_admin'
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'super_admin'
  );

-- Tenant admin can manage users in their pharmacy
CREATE POLICY "Tenant admin manage own pharmacy users" ON public.user_roles
  FOR ALL USING (
    pharmacy_id IN (
      SELECT pharmacy_id FROM public.user_roles
      WHERE email = auth.email() AND role = 'admin'
    )
  );

-- Users can read their own role
CREATE POLICY "Users read own role" ON public.user_roles
  FOR SELECT USING (email = auth.email());

-- PENDING_APPROVALS POLICIES
-- Anyone can insert a request
CREATE POLICY "Anyone can request access" ON public.pending_approvals
  FOR INSERT WITH CHECK (true);

-- Super admin can manage all pending approvals
CREATE POLICY "Super admin manage all pending" ON public.pending_approvals
  FOR ALL USING (
    (auth.jwt() ->> 'role') = 'super_admin'
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'super_admin'
  );

-- Tenant admin can view pending for their pharmacy (if we track pharmacy in pending)
CREATE POLICY "Tenant admin view own pharmacy pending" ON public.pending_approvals
  FOR SELECT USING (
    pharmacy_name IN (
      SELECT p.name FROM public.pharmacies p
      JOIN public.user_roles ur ON ur.pharmacy_id = p.id
      WHERE ur.email = auth.email() AND ur.role = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: Seed Super Admin (anso2020vja@gmail.com)
-- ─────────────────────────────────────────────────────────────────────────────
-- Super admin has pharmacy_id = NULL and role = 'super_admin'
INSERT INTO public.user_roles (email, role, pharmacy_id, assigned_by)
VALUES
  ('anso2020vja@gmail.com', 'super_admin', NULL, 'system_seed')
ON CONFLICT (email) DO UPDATE
  SET role = 'super_admin',
      pharmacy_id = NULL,
      updated_at = NOW(),
      assigned_by = 'system_seed';

-- Also seed demo users for testing (they will be created with proper pharmacy_id later)
INSERT INTO public.user_roles (email, role, pharmacy_id, assigned_by)
VALUES
  ('admin@medivision.local', 'admin', NULL, 'system_seed'),
  ('pharmacist@medivision.local', 'pharmacist', NULL, 'system_seed'),
  ('staff@medivision.local', 'staff', NULL, 'system_seed')
ON CONFLICT (email) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: Force PostgREST schema cache reload
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7: Verification
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  'pharmacies'       AS table_name,
  COUNT(*)           AS row_count
FROM public.pharmacies
UNION ALL
SELECT
  'user_roles'       AS table_name,
  COUNT(*)           AS row_count
FROM public.user_roles
UNION ALL
SELECT
  'pending_approvals' AS table_name,
  COUNT(*)            AS row_count
FROM public.pending_approvals;

-- Show super admin
SELECT email, role, pharmacy_id, assigned_by, created_at
FROM public.user_roles
WHERE email = 'anso2020vja@gmail.com';