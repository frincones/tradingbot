/**
 * Fix Agent Alerts RLS Policy
 * Allow authenticated users to insert their own alerts
 */

-- Drop the old service_role only policy
DROP POLICY IF EXISTS "Service role can insert alerts" ON public.agent_alerts;

-- Create new policy allowing authenticated users to insert their own alerts
CREATE POLICY "Users can insert own alerts"
  ON public.agent_alerts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Also allow service_role to insert (for server-side operations)
CREATE POLICY "Service role can insert alerts"
  ON public.agent_alerts
  FOR INSERT
  TO service_role
  WITH CHECK (true);
