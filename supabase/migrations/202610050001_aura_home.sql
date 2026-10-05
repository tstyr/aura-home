-- Private application data: browser roles have no direct access. All requests
-- pass through the verified user session and scope every record to that user in Vercel. Do not grant these tables
-- to anon/authenticated or expose the server credentials to the browser.
BEGIN;
CREATE TABLE IF NOT EXISTS public.home_settings (
 user_id text PRIMARY KEY, value text NOT NULL, revision integer NOT NULL,
 updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.home_records (
 user_id text NOT NULL, kind text NOT NULL, id text NOT NULL, value text NOT NULL,
 revision integer NOT NULL, updated_at text NOT NULL, PRIMARY KEY(user_id,kind,id)
);
CREATE INDEX IF NOT EXISTS home_records_user_kind_updated ON public.home_records(user_id,kind,updated_at DESC);
CREATE TABLE IF NOT EXISTS public.calendar_sources (
 user_id text NOT NULL, id text NOT NULL, name text NOT NULL, url text NOT NULL,
 updated_at text NOT NULL, PRIMARY KEY(user_id,id)
);
CREATE TABLE IF NOT EXISTS public.google_accounts (
 user_id text PRIMARY KEY, connection_id text NOT NULL, subject text NOT NULL,
 email text NOT NULL, tokens text NOT NULL, token_revision integer NOT NULL,
 selected text, calendar_list text NOT NULL, revision integer NOT NULL, updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.google_oauth_states (
 user_id text PRIMARY KEY, state_hash text NOT NULL, cookie_hash text NOT NULL,
 verifier text NOT NULL, expires_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS public.home_objects (
 object_key text PRIMARY KEY, content_type text NOT NULL, custom_metadata text NOT NULL,
 uploaded_at text NOT NULL
);
ALTER TABLE public.home_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_objects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.home_settings,public.home_records,public.calendar_sources,
 public.google_accounts,public.google_oauth_states,public.home_objects FROM anon,authenticated;
COMMIT;
