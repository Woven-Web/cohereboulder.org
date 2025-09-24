-- Remove sample/boilerplate events that were inserted during initial setup
DELETE FROM public.events
WHERE title IN (
  'COhere Invitation Opening',
  'COhere Invocation',
  'COhere Integration Closing'
)
AND description IN (
  'Official opening of the COhere 2025 Invitation phase',
  'The transformative Invocation ceremony',
  'Closing ceremony and integration celebration'
);

-- This migration cleans up the sample events that were initially added for testing
-- Admins should create actual events through the admin dashboard
