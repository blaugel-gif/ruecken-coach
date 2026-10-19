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
