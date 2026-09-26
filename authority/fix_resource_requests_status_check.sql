-- ============================================================================
-- RakshaSetu Supabase Migration: Fix resource_requests_status_check Constraint
-- Intended Lifecycle: PENDING -> ASSIGNED -> IN_TRANSIT -> DELIVERED (and CANCELLED)
-- Target Table: public.resource_requests
-- ============================================================================

-- STEP 1: Diagnostic Queries (Inspect current state)
-- Check existing constraint definition:
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conname = 'resource_requests_status_check';

-- Check all existing status values currently stored in the table:
-- SELECT status, count(*)
-- FROM public.resource_requests
-- GROUP BY status;

-- STEP 2: Safely Normalize Legacy Status Values
-- Ensures existing rows (such as CLOSED, FULFILLED, COMPLETED, etc.)
-- remain intact and map seamlessly to the new database lifecycle.

UPDATE public.resource_requests
SET status = 'DELIVERED', updated_at = now()
WHERE status IN ('CLOSED', 'closed', 'FULFILLED', 'fulfilled', 'COMPLETED', 'completed');

UPDATE public.resource_requests
SET status = 'IN_TRANSIT', updated_at = now()
WHERE status IN ('IN_PROGRESS', 'in_progress', 'IN-PROGRESS');

UPDATE public.resource_requests
SET status = 'PENDING', updated_at = now()
WHERE status IN ('pending', 'PENDING_SYNC', 'NEW', 'new');

UPDATE public.resource_requests
SET status = 'ASSIGNED', updated_at = now()
WHERE status IN ('assigned', 'PRIORITIZED', 'prioritized');

UPDATE public.resource_requests
SET status = 'CANCELLED', updated_at = now()
WHERE status IN ('cancelled', 'canceled', 'REJECTED', 'rejected');

-- STEP 3: Drop and Recreate the Status Check Constraint
-- Allows only canonical lifecycle statuses:
-- PENDING, ASSIGNED, IN_TRANSIT, DELIVERED, CANCELLED

ALTER TABLE public.resource_requests
  DROP CONSTRAINT IF EXISTS resource_requests_status_check;

ALTER TABLE public.resource_requests
  ADD CONSTRAINT resource_requests_status_check
  CHECK (status IN (
    'PENDING',
    'ASSIGNED',
    'IN_TRANSIT',
    'DELIVERED',
    'CANCELLED'
  ));

-- STEP 4: Verification Queries
-- Verify the newly active constraint definition:
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'resource_requests_status_check';

-- Verify row counts by status:
SELECT status, count(*)
FROM public.resource_requests
GROUP BY status;
