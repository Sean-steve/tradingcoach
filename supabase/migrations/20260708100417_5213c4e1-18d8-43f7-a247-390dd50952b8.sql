
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
-- has_role stays callable by authenticated because RLS policies reference it via SECURITY DEFINER, which uses definer privileges regardless. But we still allow authenticated for direct app-side role checks.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
