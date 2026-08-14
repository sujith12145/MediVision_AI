-- =============================================================================
-- MediVision AI — RLS Policy & Recursion Fix
-- File   : docs/fix_rls_policies.sql
-- Purpose: Solves circular/infinite recursion in user_roles policy by creating
--          a SECURITY DEFINER helper function.
-- How    : Copy the entire script, paste it into the Supabase SQL Editor,
--          and click Run.
-- =============================================================================

-- 1. Create a non-recursive helper function to check admin status.
-- SECURITY DEFINER bypasses RLS checks on the table queried within the function.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE email = auth.email() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql;

-- 2. Make sure RLS is enabled on both tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_approvals ENABLE ROW LEVEL SECURITY;

-- 3. Clean up existing recursive/broken policies
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Anyone can request access" ON public.pending_approvals;
DROP POLICY IF EXISTS "Admins can manage pending approvals" ON public.pending_approvals;

-- 4. Create policies for public.user_roles
CREATE POLICY "Users can read own role" ON public.user_roles
  FOR SELECT USING (auth.email() = email);

CREATE POLICY "Admins can manage all roles" ON public.user_roles
  FOR ALL USING (public.is_admin());

-- 5. Create policies for public.pending_approvals
CREATE POLICY "Anyone can request access" ON public.pending_approvals
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can manage pending approvals" ON public.pending_approvals
  FOR ALL USING (public.is_admin());

-- 6. Ensure the main admin account exists
INSERT INTO public.user_roles (email, role, assigned_by)
VALUES ('anso2020vja@gmail.com', 'admin', 'system_fix')
ON CONFLICT (email) DO NOTHING;

-- 7. Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
