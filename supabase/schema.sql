-- ==========================================
-- SPOOKA LEADERBOARD SCHEMA (Supabase / Postgres)
-- ==========================================
-- Paste into Supabase Dashboard > SQL Editor and run once.
-- The table is NOT reachable through the public API; browsers can only call
-- the three functions below, which validate input and rate-limit writes.

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

-- Lock the table: RLS on with no policies, and no direct grants
alter table public.leaderboard enable row level security;
revoke all on public.leaderboard from anon, authenticated;

-- ------------------------------------------
-- Top N public scores (no player ids exposed)
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
-- A returning player's own name and best score
-- ------------------------------------------
create or replace function public.get_player(p_player_id uuid)
returns table (username text, score integer)
language sql stable security definer set search_path = public
as $$
    select l.username, l.score from leaderboard l where l.player_id = p_player_id;
$$;

-- ------------------------------------------
-- Create/rename a player and keep their best score. Returns the stored best.
-- ------------------------------------------
create or replace function public.submit_score(p_player_id uuid, p_username text, p_score integer)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
    v_last_submit timestamptz;
    v_best integer;
begin
    if p_player_id is null then
        raise exception 'invalid_player';
    end if;
    if p_score is null or p_score < 0 or p_score > 1000000 then
        raise exception 'invalid_score';
    end if;

    p_username := btrim(p_username);
    if p_username is null or p_username !~ '^[A-Za-z0-9][A-Za-z0-9 _.-]{1,14}[A-Za-z0-9]$' then
        raise exception 'invalid_username';
    end if;

    -- Rate limits: one write per player every 3 s, max 30 new players per minute overall
    select l.last_submit_at into v_last_submit from leaderboard l where l.player_id = p_player_id;
    if found then
        if v_last_submit > now() - interval '3 seconds' then
            raise exception 'rate_limited';
        end if;
    elsif (select count(*) from leaderboard l where l.created_at > now() - interval '1 minute') >= 30 then
        raise exception 'rate_limited';
    end if;

    begin
        insert into leaderboard as l (player_id, username, score)
        values (p_player_id, p_username, p_score)
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

    return v_best;
end;
$$;

revoke execute on function public.get_leaderboard(integer) from public;
revoke execute on function public.get_player(uuid) from public;
revoke execute on function public.submit_score(uuid, text, integer) from public;
grant execute on function public.get_leaderboard(integer) to anon, authenticated;
grant execute on function public.get_player(uuid) to anon, authenticated;
grant execute on function public.submit_score(uuid, text, integer) to anon, authenticated;
