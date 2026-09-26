-- ============================================================================
-- RakshaSetu Supabase Migration: Authority Demo Incident Ingestion RPC & Policy
-- Target Table: public.incidents
-- Purpose:
--   1. Create secure SECURITY DEFINER RPC function `ingest_authority_demo_incident`
--      specifically for authorized authority/admin demo incident ingestion.
--   2. Enforce strict authorization: verifies auth.uid() against public.profiles.role.
--      Only role = 'authority' or 'admin' may execute it.
--   3. Guarantees valid client_event_id (NOT-NULL constraint) and Munger, Bihar defaults.
--   4. Adds canonical INSERT RLS policy on public.incidents for authorities/admins.
-- ============================================================================

-- STEP 1: Create or replace the Authority Demo SOS ingestion RPC
CREATE OR REPLACE FUNCTION public.ingest_authority_demo_incident(
  p_description text DEFAULT 'Simulated Citizen SOS — Authority demonstration',
  p_latitude numeric DEFAULT 25.3757,
  p_longitude numeric DEFAULT 86.4735,
  p_accuracy_meters numeric DEFAULT 15,
  p_priority text DEFAULT 'CRITICAL',
  p_incident_type text DEFAULT 'SOS',
  p_network_state text DEFAULT 'Cellular 4G'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_uid uuid;
  v_caller_role text;
  v_event_id uuid;
  v_incident record;
BEGIN
  -- 1. Obtain caller UID from authenticated session
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required: No active authenticated session found.';
  END IF;

  -- 2. Verify caller role in public.profiles (strictly from authenticated database session)
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_uid;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('authority', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only accounts with role ''authority'' or ''admin'' can ingest demo incidents.';
  END IF;

  -- 3. Generate UUID for client_event_id to satisfy NOT NULL constraint
  v_event_id := gen_random_uuid();

  -- 4. Insert into public.incidents
  INSERT INTO public.incidents (
    citizen_id,
    client_event_id,
    incident_type,
    priority,
    description,
    latitude,
    longitude,
    accuracy_meters,
    location_timestamp,
    network_state,
    status
  ) VALUES (
    v_caller_uid,
    v_event_id,
    COALESCE(p_incident_type, 'SOS'),
    COALESCE(p_priority, 'CRITICAL'),
    COALESCE(p_description, 'Simulated Citizen SOS — Authority demonstration'),
    COALESCE(p_latitude, 25.3757),
    COALESCE(p_longitude, 86.4735),
    COALESCE(p_accuracy_meters, 15),
    NOW(),
    COALESCE(p_network_state, 'Cellular 4G'),
    'UNASSIGNED'
  )
  RETURNING * INTO v_incident;

  -- 5. Return created row as JSONB
  RETURN to_jsonb(v_incident);
END;
$$;

-- STEP 2: Grant execution permission to authenticated users (internal RBAC check enforces authority/admin)
REVOKE EXECUTE ON FUNCTION public.ingest_authority_demo_incident FROM public;
GRANT EXECUTE ON FUNCTION public.ingest_authority_demo_incident TO authenticated;

-- STEP 3: Ensure Canonical Authority INSERT Policy on public.incidents
-- Enables direct authenticated REST insert for authority/admin users while keeping Citizen RLS intact
DROP POLICY IF EXISTS "Authorities can insert incidents" ON public.incidents;
DROP POLICY IF EXISTS "Authorities can insert demo incidents" ON public.incidents;

CREATE POLICY "Authorities can insert demo incidents"
ON public.incidents
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('authority', 'admin')
  )
);
