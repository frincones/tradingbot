-- Fix: audit_trigger_function was using COALESCE to fall back to a zero-UUID
-- when auth.uid() is NULL (e.g., service role / admin client calls).
-- The zero-UUID doesn't exist in auth.users, violating the foreign key constraint.
-- Fix: just use auth.uid() directly — the audit_log.user_id column allows NULL.

CREATE OR REPLACE FUNCTION public.audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
  entity_id_val UUID;
BEGIN
  -- Get the entity ID
  IF TG_OP = 'DELETE' THEN
    entity_id_val := OLD.id;
  ELSE
    entity_id_val := NEW.id;
  END IF;

  INSERT INTO public.audit_log (
    user_id,
    ts,
    action,
    entity_type,
    entity_id,
    old_value,
    new_value,
    source
  ) VALUES (
    auth.uid(),  -- NULL is fine for system/admin operations
    NOW(),
    TG_OP,
    TG_TABLE_NAME,
    entity_id_val,
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN row_to_json(NEW) ELSE NULL END,
    'trigger'
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
