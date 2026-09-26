-- ============================================================================
-- RakshaSetu Supabase Migration: Fix Safe Shelters RLS Policies
-- Target Table: public.shelters
-- Purpose:
--   1. Enable Row Level Security (RLS) on public.shelters
--   2. Grant public / citizen read access so active safe shelters are visible
--   3. Restrict INSERT, UPDATE, DELETE to authenticated users with role
--      'authority' or 'admin' verified against public.profiles
-- ============================================================================

-- STEP 1: Ensure RLS is active on public.shelters
ALTER TABLE public.shelters ENABLE ROW LEVEL SECURITY;

-- STEP 2: Drop any legacy or conflicting policies on public.shelters
DROP POLICY IF EXISTS "Public and authenticated users can view shelters" ON public.shelters;
DROP POLICY IF EXISTS "Anyone can view shelters" ON public.shelters;
DROP POLICY IF EXISTS "Allow public read access" ON public.shelters;
DROP POLICY IF EXISTS "Authorities can insert shelters" ON public.shelters;
DROP POLICY IF EXISTS "Authorities can update shelters" ON public.shelters;
DROP POLICY IF EXISTS "Authorities can delete shelters" ON public.shelters;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.shelters;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.shelters;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.shelters;

-- STEP 3: Create Canonical Read Policy (Citizen + Authority read access)
CREATE POLICY "Anyone can view shelters"
ON public.shelters
FOR SELECT
USING (true);

-- STEP 4: Create Canonical INSERT Policy (Strict Authority / Admin only)
-- Validates auth.uid() against public.profiles where role IN ('authority', 'admin')
CREATE POLICY "Authorities can insert shelters"
ON public.shelters
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('authority', 'admin')
  )
);

-- STEP 5: Create Canonical UPDATE Policy (Strict Authority / Admin only)
CREATE POLICY "Authorities can update shelters"
ON public.shelters
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('authority', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('authority', 'admin')
  )
);

-- STEP 6: Create Canonical DELETE Policy (Strict Authority / Admin only)
CREATE POLICY "Authorities can delete shelters"
ON public.shelters
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('authority', 'admin')
  )
);

-- STEP 7: Verify Policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'shelters';
