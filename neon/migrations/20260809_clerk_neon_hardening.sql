-- DayDial Clock: Neon Data API + Clerk identity bridge.
-- Apply on a branch after the legacy Supabase schema has been imported.

-- Idempotency table for the send-reminders scheduler job.
-- Claimed by `INSERT ... ON CONFLICT (reminder_id, fire_window_start) DO NOTHING
-- RETURNING id`; rolled back with DELETE if the push fails so the next run can
-- retry. Only the server-side scheduler (DATABASE_URL, service role) writes
-- here -- never exposed to authenticated clients.
CREATE TABLE IF NOT EXISTS public.reminder_dispatch_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id UUID NOT NULL REFERENCES public.event_reminders(id) ON DELETE CASCADE,
  fire_window_start TIMESTAMPTZ NOT NULL,
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reminder_id, fire_window_start)
);
CREATE INDEX IF NOT EXISTS reminder_dispatch_log_fire_window_start_idx
  ON public.reminder_dispatch_log (fire_window_start);

CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = auth, pg_catalog
AS $$
  SELECT auth.user_id();
$$;

REVOKE ALL ON FUNCTION public.current_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_id() TO authenticated;

DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'calendars', 'categories', 'event_exceptions', 'event_reminders',
        'events', 'profiles', 'push_tokens', 'user_settings'
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', policy_row.policyname, policy_row.tablename);
  END LOOP;
END;
$$;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.calendars,
  public.categories,
  public.event_exceptions,
  public.event_reminders,
  public.events,
  public.profiles,
  public.push_tokens,
  public.user_settings
TO authenticated;
REVOKE ALL ON TABLE public.reminder_dispatch_log FROM authenticated, PUBLIC;

CREATE POLICY calendars_select_own ON public.calendars
  FOR SELECT TO authenticated USING (user_id = public.current_user_id());
CREATE POLICY calendars_insert_own ON public.calendars
  FOR INSERT TO authenticated WITH CHECK (user_id = public.current_user_id());
CREATE POLICY calendars_update_own ON public.calendars
  FOR UPDATE TO authenticated
  USING (user_id = public.current_user_id())
  WITH CHECK (user_id = public.current_user_id());
CREATE POLICY calendars_delete_own ON public.calendars
  FOR DELETE TO authenticated USING (user_id = public.current_user_id());

CREATE POLICY categories_select_own ON public.categories
  FOR SELECT TO authenticated USING (user_id = public.current_user_id());
CREATE POLICY categories_insert_own ON public.categories
  FOR INSERT TO authenticated WITH CHECK (user_id = public.current_user_id());
CREATE POLICY categories_update_own ON public.categories
  FOR UPDATE TO authenticated
  USING (user_id = public.current_user_id())
  WITH CHECK (user_id = public.current_user_id());
CREATE POLICY categories_delete_own ON public.categories
  FOR DELETE TO authenticated USING (user_id = public.current_user_id());

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated USING (id = public.current_user_id());
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = public.current_user_id());
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = public.current_user_id())
  WITH CHECK (id = public.current_user_id());
CREATE POLICY profiles_delete_own ON public.profiles
  FOR DELETE TO authenticated USING (id = public.current_user_id());

CREATE POLICY user_settings_select_own ON public.user_settings
  FOR SELECT TO authenticated USING (user_id = public.current_user_id());
CREATE POLICY user_settings_insert_own ON public.user_settings
  FOR INSERT TO authenticated WITH CHECK (user_id = public.current_user_id());
CREATE POLICY user_settings_update_own ON public.user_settings
  FOR UPDATE TO authenticated
  USING (user_id = public.current_user_id())
  WITH CHECK (user_id = public.current_user_id());
CREATE POLICY user_settings_delete_own ON public.user_settings
  FOR DELETE TO authenticated USING (user_id = public.current_user_id());

CREATE POLICY events_select_own ON public.events
  FOR SELECT TO authenticated USING (user_id = public.current_user_id());
CREATE POLICY events_insert_own ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.current_user_id()
    AND (
      calendar_id IS NULL OR EXISTS (
        SELECT 1 FROM public.calendars c
        WHERE c.id = calendar_id AND c.user_id = public.current_user_id()
      )
    )
    AND (
      category_id IS NULL OR EXISTS (
        SELECT 1 FROM public.categories c
        WHERE c.id = category_id AND c.user_id = public.current_user_id()
      )
    )
  );
CREATE POLICY events_update_own ON public.events
  FOR UPDATE TO authenticated
  USING (user_id = public.current_user_id())
  WITH CHECK (
    user_id = public.current_user_id()
    AND (
      calendar_id IS NULL OR EXISTS (
        SELECT 1 FROM public.calendars c
        WHERE c.id = calendar_id AND c.user_id = public.current_user_id()
      )
    )
    AND (
      category_id IS NULL OR EXISTS (
        SELECT 1 FROM public.categories c
        WHERE c.id = category_id AND c.user_id = public.current_user_id()
      )
    )
  );
CREATE POLICY events_delete_own ON public.events
  FOR DELETE TO authenticated USING (user_id = public.current_user_id());

CREATE POLICY event_exceptions_select_own ON public.event_exceptions
  FOR SELECT TO authenticated USING (user_id = public.current_user_id());
CREATE POLICY event_exceptions_insert_own ON public.event_exceptions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.current_user_id()
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id AND e.user_id = public.current_user_id()
    )
  );
CREATE POLICY event_exceptions_update_own ON public.event_exceptions
  FOR UPDATE TO authenticated
  USING (user_id = public.current_user_id())
  WITH CHECK (
    user_id = public.current_user_id()
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id AND e.user_id = public.current_user_id()
    )
  );
CREATE POLICY event_exceptions_delete_own ON public.event_exceptions
  FOR DELETE TO authenticated USING (user_id = public.current_user_id());

CREATE POLICY event_reminders_select_own ON public.event_reminders
  FOR SELECT TO authenticated USING (user_id = public.current_user_id());
CREATE POLICY event_reminders_insert_own ON public.event_reminders
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.current_user_id()
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id AND e.user_id = public.current_user_id()
    )
  );
CREATE POLICY event_reminders_update_own ON public.event_reminders
  FOR UPDATE TO authenticated
  USING (user_id = public.current_user_id())
  WITH CHECK (
    user_id = public.current_user_id()
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id AND e.user_id = public.current_user_id()
    )
  );
CREATE POLICY event_reminders_delete_own ON public.event_reminders
  FOR DELETE TO authenticated USING (user_id = public.current_user_id());

CREATE POLICY push_tokens_select_own ON public.push_tokens
  FOR SELECT TO authenticated USING (user_id = public.current_user_id());
CREATE POLICY push_tokens_insert_own ON public.push_tokens
  FOR INSERT TO authenticated WITH CHECK (user_id = public.current_user_id());
CREATE POLICY push_tokens_update_own ON public.push_tokens
  FOR UPDATE TO authenticated
  USING (user_id = public.current_user_id())
  WITH CHECK (user_id = public.current_user_id());
CREATE POLICY push_tokens_delete_own ON public.push_tokens
  FOR DELETE TO authenticated USING (user_id = public.current_user_id());
