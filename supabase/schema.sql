create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  api_fixture_id integer unique,
  group_name text not null,
  kickoff_at timestamptz not null,
  home_team text not null,
  away_team text not null,
  home_score integer,
  away_score integer,
  elapsed integer,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'finished')),
  updated_at timestamptz not null default now()
);

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  home_score integer not null check (home_score >= 0 and home_score <= 30),
  away_score integer not null check (away_score >= 0 and away_score <= 30),
  points integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, user_id)
);

create or replace function public.prediction_points(
  actual_home integer,
  actual_away integer,
  predicted_home integer,
  predicted_away integer
) returns integer
language sql
immutable
as $$
  select case
    when actual_home is null or actual_away is null then 0
    when actual_home = predicted_home and actual_away = predicted_away then 3
    when sign(actual_home - actual_away) = sign(predicted_home - predicted_away) then 1
    else 0
  end;
$$;

create or replace function public.set_prediction_points()
returns trigger
language plpgsql
security definer
as $$
declare
  selected_match public.matches;
begin
  select * into selected_match from public.matches where id = new.match_id;
  if selected_match.kickoff_at <= now() and tg_op = 'INSERT' then
    raise exception 'Predictions are locked after kickoff.';
  end if;

  if selected_match.kickoff_at <= now()
    and tg_op = 'UPDATE'
    and (
      new.home_score is distinct from old.home_score
      or new.away_score is distinct from old.away_score
      or new.match_id is distinct from old.match_id
      or new.user_id is distinct from old.user_id
    ) then
    raise exception 'Predictions are locked after kickoff.';
  end if;

  new.points := public.prediction_points(
    selected_match.home_score,
    selected_match.away_score,
    new.home_score,
    new.away_score
  );
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists predictions_score_before_write on public.predictions;
create trigger predictions_score_before_write
before insert or update on public.predictions
for each row execute function public.set_prediction_points();

create or replace function public.recalculate_prediction_points()
returns void
language plpgsql
security definer
as $$
begin
  update public.predictions p
  set points = public.prediction_points(m.home_score, m.away_score, p.home_score, p.away_score),
      updated_at = now()
  from public.matches m
  where p.match_id = m.id;
end;
$$;

create or replace view public.predictions_public as
select
  p.id,
  p.match_id,
  p.user_id,
  pr.display_name,
  p.home_score,
  p.away_score,
  p.points
from public.predictions p
join public.profiles pr on pr.id = p.user_id
join public.matches m on m.id = p.match_id
where m.kickoff_at <= now() or p.user_id = auth.uid();

create or replace view public.leaderboard as
select
  pr.id as user_id,
  pr.display_name,
  coalesce(sum(p.points), 0)::integer as points,
  coalesce(count(*) filter (where p.points = 3), 0)::integer as exact_scores,
  coalesce(count(*) filter (where p.points = 1), 0)::integer as outcomes,
  coalesce(count(p.id), 0)::integer as predicted
from public.profiles pr
left join public.predictions p on p.user_id = pr.id
  and exists (
    select 1 from public.matches m
    where m.id = p.match_id and m.kickoff_at <= now()
  )
group by pr.id, pr.display_name
order by points desc, exact_scores desc, outcomes desc, pr.display_name asc;

alter view public.predictions_public set (security_invoker = true);
alter view public.leaderboard set (security_invoker = true);

grant select on public.matches to anon, authenticated;
grant select on public.predictions_public to authenticated;
grant select on public.leaderboard to authenticated;
grant select on public.profiles to authenticated;
grant insert, update, select on public.predictions to authenticated;

alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.predictions enable row level security;

drop policy if exists "profiles readable by authenticated users" on public.profiles;
create policy "profiles readable by authenticated users"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "profiles update own display name" on public.profiles;
create policy "profiles update own display name"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "matches readable by everyone" on public.matches;
create policy "matches readable by everyone"
on public.matches for select
to anon, authenticated
using (true);

drop policy if exists "predictions readable when visible" on public.predictions;
create policy "predictions readable when visible"
on public.predictions for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.matches m
    where m.id = match_id and m.kickoff_at <= now()
  )
);

drop policy if exists "predictions insert own before kickoff" on public.predictions;
create policy "predictions insert own before kickoff"
on public.predictions for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.matches m
    where m.id = match_id and m.kickoff_at > now()
  )
);

drop policy if exists "predictions update own before kickoff" on public.predictions;
create policy "predictions update own before kickoff"
on public.predictions for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.matches m
    where m.id = match_id and m.kickoff_at > now()
  )
);
