-- Migration script to create the user_roles table, enable Row Level Security, and seed roles.

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

-- Policy: Users can read their own role
CREATE POLICY "Users can read own role" ON user_roles
  FOR SELECT USING (auth.email() = email);

-- Policy: Admins can manage all roles
CREATE POLICY "Admins can manage all roles" ON user_roles
  FOR ALL USING (EXISTS (
    SELECT 1 FROM user_roles WHERE email = auth.email() AND role = 'admin'
  ));

-- Seed the initial admin and testing users
-- IMPORTANT: Replace 'your-google-email@gmail.com' with your actual Google OAuth email address!
INSERT INTO user_roles (email, role, assigned_by)
VALUES 
  ('admin@medivision.local', 'admin', 'system'),
  ('pharmacist@medivision.local', 'pharmacist', 'system'),
  ('staff@medivision.local', 'staff', 'system'),
  ('your-google-email@gmail.com', 'admin', 'system')
ON CONFLICT (email) DO UPDATE 
SET role = EXCLUDED.role,
    updated_at = NOW();
