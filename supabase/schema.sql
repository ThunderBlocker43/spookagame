-- ==========================================
-- SPOOKA LEADERBOARD SCHEMA (Supabase / Postgres)
-- ==========================================
-- Paste into Supabase Dashboard > SQL Editor and run. Safe to re-run: every
-- statement is idempotent and the data migration at the bottom runs only once.
-- Tables are NOT reachable through the public API; browsers can only call the
-- functions below, which validate input and rate-limit writes.

create table if not exists public.leaderboard (
    player_id      uuid primary key,
    username       text not null,
    score          integer not null default 0,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    last_submit_at timestamptz not null default now(),
    constraint leaderboard_username_format check (username ~ '^[A-Za-z0-9][A-Za-z0-9 _.-]{1,14}[A-Za-z0-9]$'),
    constraint leaderboard_score_range check (score between 0 and 1000000)
);

-- One player per name (case-insensitive), fast top-N ordering
create unique index if not exists leaderboard_username_key on public.leaderboard (lower(username));
create index if not exists leaderboard_score_idx on public.leaderboard (score desc, updated_at asc);

-- ------------------------------------------
-- Seasons: every score is tagged with one. Add a row here for each new season.
-- ------------------------------------------
create table if not exists public.seasons (
    id         text primary key,
    name       text not null,
    created_at timestamptz not null default now()
);

insert into public.seasons (id, name) values ('halloween-2026', 'Halloween 2026')
on conflict (id) do nothing;

-- ------------------------------------------
-- Every finished game (feeds the weekly and seasonal boards). Never deleted:
-- old weeks simply fall outside the weekly query window.
-- ------------------------------------------
create table if not exists public.scores (
    id          bigint generated always as identity primary key,
    player_id   uuid not null references public.leaderboard (player_id) on delete cascade,
    season      text not null default 'halloween-2026' references public.seasons (id),
    score       integer not null,
    achieved_at timestamptz not null default now(),
    source      text not null default 'game',
    constraint scores_score_range check (score between 1 and 1000000),
    constraint scores_source check (source in ('game', 'migration'))
);

create index if not exists scores_achieved_idx on public.scores (achieved_at desc);
create index if not exists scores_season_idx on public.scores (season, score desc);

-- ------------------------------------------
-- Each new personal best, as it happens (the player's history)
-- ------------------------------------------
create table if not exists public.highscore_history (
    id          bigint generated always as identity primary key,
    player_id   uuid not null references public.leaderboard (player_id) on delete cascade,
    season      text not null default 'halloween-2026' references public.seasons (id),
    score       integer not null,
    achieved_at timestamptz not null default now(),
    source      text not null default 'game',
    constraint highscore_history_source check (source in ('game', 'legacy', 'migration'))
);

create index if not exists highscore_history_player_idx on public.highscore_history (player_id, achieved_at desc);

-- ------------------------------------------
-- One-way friend links, stored by player id so renames can't break them
-- ------------------------------------------
create table if not exists public.friends (
    player_id  uuid not null references public.leaderboard (player_id) on delete cascade,
    friend_id  uuid not null references public.leaderboard (player_id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (player_id, friend_id),
    constraint friends_not_self check (player_id <> friend_id)
);

create table if not exists public.schema_migrations (
    name       text primary key,
    applied_at timestamptz not null default now()
);

-- Lock the tables: RLS on with no policies, and no direct grants
alter table public.leaderboard enable row level security;
alter table public.seasons enable row level security;
alter table public.scores enable row level security;
alter table public.highscore_history enable row level security;
alter table public.friends enable row level security;
alter table public.schema_migrations enable row level security;
revoke all on public.leaderboard, public.seasons, public.scores, public.highscore_history,
    public.friends, public.schema_migrations from anon, authenticated;

-- ------------------------------------------
-- Top N public scores, all time (no player ids exposed)
-- ------------------------------------------
create or replace function public.get_leaderboard(p_limit integer default 10)
returns table (username text, score integer)
language sql stable security definer set search_path = public
as $$
    select l.username, l.score
    from leaderboard l
    where l.score > 0
    order by l.score desc, l.updated_at asc
    limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

-- ------------------------------------------
-- Top N best scores of the current week.
-- Week = ISO week: Monday 00:00 UTC up to (not including) the next Monday 00:00 UTC.
-- ------------------------------------------
create or replace function public.get_weekly_leaderboard(p_limit integer default 10)
returns table (username text, score integer)
language sql stable security definer set search_path = public
as $$
    select l.username, max(s.score)::integer as score
    from scores s
    join leaderboard l on l.player_id = s.player_id
    where s.achieved_at >= date_trunc('week', now() at time zone 'UTC') at time zone 'UTC'
    group by l.player_id, l.username
    order by score desc, l.username asc
    limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

-- ------------------------------------------
-- Top N best scores within one season
-- ------------------------------------------
create or replace function public.get_season_leaderboard(p_season text, p_limit integer default 10)
returns table (username text, score integer)
language sql stable security definer set search_path = public
as $$
    select l.username, max(s.score)::integer as score
    from scores s
    join leaderboard l on l.player_id = s.player_id
    where s.season = p_season
    group by l.player_id, l.username
    order by score desc, l.username asc
    limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

-- ------------------------------------------
-- A returning player's own name and best score
-- ------------------------------------------
create or replace function public.get_player(p_player_id uuid)
returns table (username text, score integer)
language sql stable security definer set search_path = public
as $$
    select l.username, l.score from leaderboard l where l.player_id = p_player_id;
$$;

-- ------------------------------------------
-- The player plus everyone on their friends list, by all-time best
-- ------------------------------------------
create or replace function public.get_friends_leaderboard(p_player_id uuid)
returns table (username text, score integer, is_me boolean)
language sql stable security definer set search_path = public
as $$
    select l.username, l.score, l.player_id = p_player_id
    from leaderboard l
    where l.player_id = p_player_id
       or l.player_id in (select f.friend_id from friends f where f.player_id = p_player_id)
    order by l.score desc, l.updated_at asc
    limit 101;
$$;

-- ------------------------------------------
-- The player's personal bests, newest first
-- ------------------------------------------
drop function if exists public.get_history(uuid);

create or replace function public.get_history(p_player_id uuid)
returns table (score integer, season text, season_name text, achieved_at timestamptz)
language sql stable security definer set search_path = public
as $$
    select h.score, h.season, s.name, h.achieved_at
    from highscore_history h
    join seasons s on s.id = h.season
    where h.player_id = p_player_id
    order by h.achieved_at desc, h.id desc
    limit 200;
$$;

-- ------------------------------------------
-- Create/rename a player, record a finished game and keep their best score.
-- p_score is the game just played (0 = none); p_legacy_score is an old
-- pre-leaderboard local best being migrated (counts for all-time + history only).
-- Returns the stored all-time best.
-- ------------------------------------------
drop function if exists public.submit_score(uuid, text, integer);

create or replace function public.submit_score(
    p_player_id uuid,
    p_username text,
    p_score integer,
    p_season text default 'halloween-2026',
    p_legacy_score integer default 0
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
    v_last_submit timestamptz;
    v_previous_best integer;
    v_running_best integer;
    v_best integer;
begin
    if p_player_id is null then
        raise exception 'invalid_player';
    end if;
    p_legacy_score := coalesce(p_legacy_score, 0);
    if p_score is null or p_score < 0 or p_score > 1000000
        or p_legacy_score < 0 or p_legacy_score > 1000000 then
        raise exception 'invalid_score';
    end if;
    if not exists (select 1 from seasons s where s.id = p_season) then
        raise exception 'invalid_season';
    end if;

    p_username := btrim(p_username);
    if p_username is null or p_username !~ '^[A-Za-z0-9][A-Za-z0-9 _.-]{1,14}[A-Za-z0-9]$' then
        raise exception 'invalid_username';
    end if;

    -- Rate limits: one write per player every 3 s, max 30 new players per minute overall
    select l.last_submit_at, l.score into v_last_submit, v_previous_best
    from leaderboard l where l.player_id = p_player_id;
    if found then
        if v_last_submit > now() - interval '3 seconds' then
            raise exception 'rate_limited';
        end if;
    elsif (select count(*) from leaderboard l where l.created_at > now() - interval '1 minute') >= 30 then
        raise exception 'rate_limited';
    end if;

    begin
        insert into leaderboard as l (player_id, username, score)
        values (p_player_id, p_username, greatest(p_score, p_legacy_score))
        on conflict (player_id) do update
            set username       = excluded.username,
                score          = greatest(l.score, excluded.score),
                updated_at     = case when excluded.score > l.score then now() else l.updated_at end,
                last_submit_at = now()
        returning l.score into v_best;
    exception when unique_violation then
        -- Primary key conflicts are handled above, so this is the username index
        raise exception 'username_taken';
    end;

    if p_score > 0 then
        insert into scores (player_id, season, score) values (p_player_id, p_season, p_score);
    end if;

    -- History: log each value that beat the best known before it (legacy first, it is older)
    v_running_best := coalesce(v_previous_best, 0);
    if p_legacy_score > v_running_best then
        insert into highscore_history (player_id, season, score, source)
        values (p_player_id, p_season, p_legacy_score, 'legacy');
        v_running_best := p_legacy_score;
    end if;
    if p_score > v_running_best then
        insert into highscore_history (player_id, season, score, source)
        values (p_player_id, p_season, p_score, 'game');
    end if;

    return v_best;
end;
$$;

-- ------------------------------------------
-- Friend management by username (names are unique, see leaderboard_username_key)
-- ------------------------------------------
create or replace function public.add_friend(p_player_id uuid, p_friend_username text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
    v_friend_id uuid;
    v_friend_name text;
begin
    if not exists (select 1 from leaderboard l where l.player_id = p_player_id) then
        raise exception 'not_registered';
    end if;

    select l.player_id, l.username into v_friend_id, v_friend_name
    from leaderboard l where lower(l.username) = lower(btrim(p_friend_username));
    if not found then
        raise exception 'friend_not_found';
    end if;
    if v_friend_id = p_player_id then
        raise exception 'friend_self';
    end if;
    if (select count(*) from friends f where f.player_id = p_player_id) >= 100 then
        raise exception 'friend_limit';
    end if;

    insert into friends (player_id, friend_id) values (p_player_id, v_friend_id)
    on conflict do nothing;
    return v_friend_name;
end;
$$;

create or replace function public.remove_friend(p_player_id uuid, p_friend_username text)
returns void
language sql security definer set search_path = public
as $$
    delete from friends f
    where f.player_id = p_player_id
      and f.friend_id = (select l.player_id from leaderboard l where lower(l.username) = lower(btrim(p_friend_username)));
$$;

revoke execute on function public.get_leaderboard(integer) from public;
revoke execute on function public.get_weekly_leaderboard(integer) from public;
revoke execute on function public.get_season_leaderboard(text, integer) from public;
revoke execute on function public.get_player(uuid) from public;
revoke execute on function public.get_friends_leaderboard(uuid) from public;
revoke execute on function public.get_history(uuid) from public;
revoke execute on function public.submit_score(uuid, text, integer, text, integer) from public;
revoke execute on function public.add_friend(uuid, text) from public;
revoke execute on function public.remove_friend(uuid, text) from public;
grant execute on function public.get_leaderboard(integer) to anon, authenticated;
grant execute on function public.get_weekly_leaderboard(integer) to anon, authenticated;
grant execute on function public.get_season_leaderboard(text, integer) to anon, authenticated;
grant execute on function public.get_player(uuid) to anon, authenticated;
grant execute on function public.get_friends_leaderboard(uuid) to anon, authenticated;
grant execute on function public.get_history(uuid) to anon, authenticated;
grant execute on function public.submit_score(uuid, text, integer, text, integer) to anon, authenticated;
grant execute on function public.add_friend(uuid, text) to anon, authenticated;
grant execute on function public.remove_friend(uuid, text) to anon, authenticated;

-- ------------------------------------------
-- DATA MIGRATION 002: upgrade pre-season leaderboard rows (runs once)
-- Each existing best becomes a Halloween-season score and a history entry,
-- dated by when it was set (updated_at, falling back to created_at, then now).
-- The leaderboard rows themselves are left untouched.
-- ------------------------------------------
do $$
begin
    if not exists (select 1 from schema_migrations m where m.name = '002_seasons_weekly_friends_history') then
        insert into scores (player_id, season, score, achieved_at, source)
        select l.player_id, 'halloween-2026', l.score, coalesce(l.updated_at, l.created_at, now()), 'migration'
        from leaderboard l
        where l.score > 0;

        insert into highscore_history (player_id, season, score, achieved_at, source)
        select l.player_id, 'halloween-2026', l.score, coalesce(l.updated_at, l.created_at, now()), 'migration'
        from leaderboard l
        where l.score > 0;

        insert into schema_migrations (name) values ('002_seasons_weekly_friends_history');
    end if;
end;
$$;
