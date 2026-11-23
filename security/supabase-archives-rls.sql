-- My Film Archive — Supabase RLS hardening
-- REVIEW BEFORE RUNNING in Supabase SQL Editor.
-- Expected existing table: public.archives(user_id uuid, data jsonb, updated_at).
-- This file is documentation/migration only; committing it does NOT apply it.
BEGIN;

ALTER TABLE public.archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archives FORCE ROW LEVEL SECURITY;

-- Anonymous visitors should never see or modify personal archives.
REVOKE ALL PRIVILEGES ON TABLE public.archives FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archives TO authenticated;

-- This RESTRICTIVE guard is AND-ed with any permissive legacy policies.
-- It prevents an accidentally broad older policy from exposing other users.
DROP POLICY IF EXISTS archives_owner_guard ON public.archives;
CREATE POLICY archives_owner_guard ON public.archives
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- These are the minimal permissive policies that make owner access possible.
DROP POLICY IF EXISTS archives_owner_select ON public.archives;
CREATE POLICY archives_owner_select ON public.archives
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS archives_owner_insert ON public.archives;
CREATE POLICY archives_owner_insert ON public.archives
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS archives_owner_update ON public.archives;
CREATE POLICY archives_owner_update ON public.archives
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS archives_owner_delete ON public.archives;
CREATE POLICY archives_owner_delete ON public.archives
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

COMMIT;

-- Verify policies after running:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies WHERE schemaname='public' AND tablename='archives';
-- Test: User A must not be able to SELECT, UPDATE, INSERT, or DELETE User B's row.
