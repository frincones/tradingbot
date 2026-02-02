/**
 * Fix accounts table RLS policy
 *
 * The existing policy uses (select auth.uid()) which is unnecessary and
 * can cause issues. This migration simplifies the policy to use auth.uid() directly.
 */

-- Drop the existing policy
DROP POLICY IF EXISTS accounts_read ON public.accounts;

-- Recreate the policy with simplified syntax
CREATE POLICY accounts_read ON public.accounts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Drop and recreate update policy as well for consistency
DROP POLICY IF EXISTS accounts_update ON public.accounts;

CREATE POLICY accounts_update ON public.accounts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
