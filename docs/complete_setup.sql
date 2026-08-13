-- ============================================================
-- MediVision AI — Complete Database Setup
-- Run this ONCE in Supabase Dashboard → SQL Editor
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- TABLE 1: user_roles
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'pharmacist', 'staff')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by VARCHAR(255)
);

-- Enable Row Level Security
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (safe to re-run)
DROP POLICY IF EXISTS "Users can read own role" ON user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON user_roles;
DROP POLICY IF EXISTS "Service role bypass" ON user_roles;

-- Policy: Users can read their own role
CREATE POLICY "Users can read own role" ON user_roles
  FOR SELECT USING (auth.email() = email);

-- Policy: Admins can manage all roles via UI
CREATE POLICY "Admins can manage all roles" ON user_roles
  FOR ALL USING (EXISTS (
    SELECT 1 FROM user_roles WHERE email = auth.email() AND role = 'admin'
  ));

-- ─────────────────────────────────────────────────────────────
-- TABLE 2: pending_approvals
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  requested_role VARCHAR(50) DEFAULT 'admin' CHECK (requested_role IN ('admin', 'pharmacist', 'staff')),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_approvals_token ON pending_approvals(token);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_email ON pending_approvals(email);

-- Enable Row Level Security
ALTER TABLE pending_approvals ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (safe to re-run)
DROP POLICY IF EXISTS "Anyone can request access" ON pending_approvals;
DROP POLICY IF EXISTS "Admins can manage pending approvals" ON pending_approvals;

-- Policy: Anyone can insert a request
CREATE POLICY "Anyone can request access" ON pending_approvals
  FOR INSERT WITH CHECK (true);

-- Policy: Only admins can read/update pending approvals
CREATE POLICY "Admins can manage pending approvals" ON pending_approvals
  FOR ALL USING (EXISTS (
    SELECT 1 FROM user_roles WHERE email = auth.email() AND role = 'admin'
  ));

-- ─────────────────────────────────────────────────────────────
-- SEED: Grant YOUR Google account admin access
-- ─────────────────────────────────────────────────────────────
INSERT INTO user_roles (email, role, assigned_by)
VALUES
  ('mallirachagulla@gmail.com', 'admin', 'system_seed')
ON CONFLICT (email) DO UPDATE
  SET role = 'admin',
      updated_at = NOW(),
      assigned_by = 'system_seed';

-- Verify the seed worked
SELECT email, role, assigned_by, created_at FROM user_roles;
