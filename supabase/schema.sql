-- Rücken-Coach: Datenbank-Schema für Supabase
-- Einmal komplett im Supabase SQL Editor ausführen (New query → einfügen → Run).
-- Alle Tabellen sind per Row Level Security nur für den eingeloggten Besitzer lesbar/schreibbar.

-- gen_random_uuid() ist in Postgres eingebaut, keine Erweiterung nötig

-- Einstellungen pro Person (Hilfsmittel, Kalibrierung, Toleranzen …)
create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Eine Zeile pro Trainingseinheit. Rohdaten bleiben vollständig erhalten (schema_version für spätere Auswertungen).
create table if not exists public.sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  schema_version int not null default 1,
  started_at timestamptz not null,
  ended_at timestamptz,
  mode int,
  variant text,
  completed boolean,
  dev_mode boolean not null default false,
  device jsonb,
  settings_snapshot jsonb,
  plan jsonb,
  exercises jsonb,
  posture_check jsonb,
  checkin jsonb,
  checkout jsonb,
  summary jsonb,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_started on public.sessions (user_id, started_at desc);

-- Haltungsmesswerte ca. 1x pro Sekunde während der Übungen (Basis für spätere KPIs)
create table if not exists public.posture_samples (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  t_ms int not null,
  exercise_id text,
  rep int,
  side int,
  score real,
  metrics jsonb,
  bad text[]
);
create index if not exists samples_session on public.posture_samples (session_id, t_ms);

-- Dev-Modus: Ereignisprotokoll + Notizen pro Einheit
create table if not exists public.dev_logs (
  session_id uuid primary key references public.sessions on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  env jsonb,
  events jsonb,
  notes jsonb,
  created_at timestamptz not null default now()
);

-- Dev-Modus: Bilder (JPEG als Data-URL) mit Messwerten
create table if not exists public.dev_snapshots (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  t_ms int,
  exercise_id text,
  reason text,
  metrics jsonb,
  checks jsonb,
  image text,
  created_at timestamptz not null default now()
);
create index if not exists snapshots_session on public.dev_snapshots (session_id, t_ms);

-- Befristete Lese-Schlüssel, damit Claude Dev-Daten abrufen kann
create table if not exists public.dev_shares (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Row Level Security: nur eigene Zeilen
do $$
declare t text;
begin
  foreach t in array array['profiles','sessions','posture_samples','dev_logs','dev_snapshots','dev_shares'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format('create policy own_rows on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Lesezugriff für Claude über einen gültigen Schlüssel (nur lesen, nur Daten dieses Accounts)
create or replace function public.dev_bundle(p_token uuid, p_limit int default 5, p_session uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid; result jsonb;
begin
  select user_id into uid from dev_shares where token = p_token and expires_at > now();
  if uid is null then raise exception 'Schlüssel ungültig oder abgelaufen'; end if;
  select coalesce(jsonb_agg(row_data order by started desc), '[]'::jsonb) into result from (
    select s.started_at as started,
      (to_jsonb(s) - 'user_id') || jsonb_build_object(
        'dev', (select to_jsonb(d) - 'user_id' from dev_logs d where d.session_id = s.id),
        'snapshots', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 't_ms', n.t_ms, 'exercise_id', n.exercise_id, 'reason', n.reason, 'metrics', n.metrics, 'checks', n.checks) order by n.t_ms), '[]'::jsonb)
                      from dev_snapshots n where n.session_id = s.id)
      ) as row_data
    from sessions s
    where s.user_id = uid and (p_session is null or s.id = p_session) and (p_session is not null or s.dev_mode)
    order by s.started_at desc
    limit greatest(1, least(p_limit, 50))
  ) q;
  return jsonb_build_object('generated_at', now(), 'sessions', result);
end $$;

create or replace function public.dev_image(p_token uuid, p_id bigint)
returns text language plpgsql stable security definer set search_path = public as $$
declare uid uuid; img text;
begin
  select user_id into uid from dev_shares where token = p_token and expires_at > now();
  if uid is null then raise exception 'Schlüssel ungültig oder abgelaufen'; end if;
  select image into img from dev_snapshots where id = p_id and user_id = uid;
  return img;
end $$;

-- Alle Einheiten (ohne Rohmesswerte) für Auswertungen
create or replace function public.history_export(p_token uuid, p_limit int default 500)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid; result jsonb;
begin
  select user_id into uid from dev_shares where token = p_token and expires_at > now();
  if uid is null then raise exception 'Schlüssel ungültig oder abgelaufen'; end if;
  select coalesce(jsonb_agg(to_jsonb(s) - 'user_id' order by s.started_at desc), '[]'::jsonb) into result
  from (select * from sessions where user_id = uid order by started_at desc limit greatest(1, least(p_limit, 2000))) s;
  return result;
end $$;

revoke all on function public.dev_bundle(uuid, int, uuid) from public;
revoke all on function public.dev_image(uuid, bigint) from public;
revoke all on function public.history_export(uuid, int) from public;
grant execute on function public.dev_bundle(uuid, int, uuid) to anon, authenticated;
grant execute on function public.dev_image(uuid, bigint) to anon, authenticated;
grant execute on function public.history_export(uuid, int) to anon, authenticated;

-- Tabellenrechte für eingeloggte Nutzer (RLS schränkt auf eigene Zeilen ein)
grant select, insert, update, delete on public.profiles, public.sessions, public.posture_samples, public.dev_logs, public.dev_snapshots, public.dev_shares to authenticated;
revoke all on public.profiles, public.sessions, public.posture_samples, public.dev_logs, public.dev_snapshots, public.dev_shares from anon;
-- Ergebnis je Wiederholung (Teilschritte, Bewegungs- und Haltungsbewertung)
create table if not exists public.rep_results (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  exercise_id text not null,
  exercise_idx int,
  rep int,
  side int,
  started_ms int,
  duration_ms int,
  kind text,
  phases jsonb,
  cycles int,
  expected_cycles int,
  hold_ratio real,
  reach_ms int,
  phase_score real,
  posture_score real,
  score real,
  created_at timestamptz not null default now()
);
create index if not exists rep_results_session on public.rep_results (session_id, exercise_idx, side, rep);
create index if not exists rep_results_user_ex on public.rep_results (user_id, exercise_id, created_at desc);
alter table public.rep_results enable row level security;
drop policy if exists own_rows on public.rep_results;
create policy own_rows on public.rep_results for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.rep_results to authenticated;
revoke all on public.rep_results from anon;
