-- Migration: Create pending_approvals table, configure indexes, and set RLS.

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

-- Drop existing policies if any
DROP POLICY IF EXISTS "Anyone can request access" ON pending_approvals;
DROP POLICY IF EXISTS "Admins can manage pending approvals" ON pending_approvals;

-- Policy: Anyone can insert (so non-authenticated users can request access)
CREATE POLICY "Anyone can request access" ON pending_approvals
  FOR INSERT WITH CHECK (true);

-- Policy: Only admins can read/update pending approvals
CREATE POLICY "Admins can manage pending approvals" ON pending_approvals
  FOR ALL USING (EXISTS (
    SELECT 1 FROM user_roles WHERE email = auth.email() AND role = 'admin'
  ));
