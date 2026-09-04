-- qq schema: authors, quotes, likes, tags, and supporting RPCs.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
--
-- Content (authors, quotes, tags) is populated only by system processes
-- (the ZenQuotes ingestion cron, running as the service role) — end users
-- can read everything but can only write their own likes, as either a
-- device (no auth) or a signed-in account (see likes/profiles below).

create extension if not exists "pgcrypto";

create table authors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  bio text,
  portrait_url text,
  born_year int,
  died_year int,
  created_at timestamptz not null default now()
);

-- like_count / downloads_count are lifetime totals maintained by triggers
-- on likes/downloads (see below) — never written directly, always trust
-- them as-is rather than recomputing from the likes/downloads tables.
create table quotes (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  author_id uuid not null references authors(id) on delete cascade,
  source text not null default 'zenquotes' check (source in ('zenquotes', 'manual', 'github-jamesft-database-quotes-json')),
  created_at timestamptz not null default now(),
  like_count integer not null default 0,
  downloads_count integer not null default 0,
  unique (author_id, text)
);

-- Liked either as a device (no auth) or as a real account, never both.
-- device_id rows are self-reported and unverifiable (see RLS below);
-- user_id rows are owned by the authenticated caller.
create table likes (
  id uuid primary key default gen_random_uuid(),
  device_id text,
  user_id uuid references auth.users(id) on delete cascade,
  quote_id uuid not null references quotes(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (device_id is not null and user_id is null) or
    (device_id is null and user_id is not null)
  )
);

create unique index likes_device_quote_uidx on likes(device_id, quote_id) where device_id is not null;
create unique index likes_user_quote_uidx on likes(user_id, quote_id) where user_id is not null;

-- Downloaded either as a device or as a real account, never both (same
-- trust model as likes). One row per download event (not deduped, unlike
-- likes) so trending can window on recency and so each event can carry the
-- share-card style it was rendered with.
create table downloads (
  id uuid primary key default gen_random_uuid(),
  device_id text,
  user_id uuid references auth.users(id) on delete cascade,
  quote_id uuid not null references quotes(id) on delete cascade,
  style jsonb,
  created_at timestamptz not null default now(),
  check (
    (device_id is not null and user_id is null) or
    (device_id is null and user_id is not null)
  )
);

create table tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique
);

create table quote_tags (
  quote_id uuid not null references quotes(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (quote_id, tag_id)
);

-- The (date -> quote) pairing for the "quote of the day" feed. Assigned
-- once per date (see ensure_quote_of_the_day() below) and never
-- recomputed, so it stays stable even as quotes are added/removed later —
-- a hash-based pick would silently reorder every existing date's pairing
-- whenever the quotes table changed.
create table quote_of_the_day (
  date date primary key,
  quote_id uuid not null references quotes(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Keep quotes.like_count / quotes.downloads_count in sync with the
-- likes/downloads tables. This lets the frontend trust the columns
-- directly instead of counting joined rows or calling an RPC per fetch.
-- security definer is required: quotes has no update policy for
-- anon/authenticated, so without it the trigger's own UPDATE is silently
-- dropped by RLS (0 rows affected, no error) whenever a normal user's
-- like/download fires it.
create or replace function trg_likes_adjust_quote_count()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    update quotes set like_count = like_count + 1 where id = new.quote_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update quotes set like_count = like_count - 1 where id = old.quote_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger likes_adjust_quote_count
after insert or delete on likes
for each row execute function trg_likes_adjust_quote_count();

create or replace function trg_downloads_adjust_quote_count()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    update quotes set downloads_count = downloads_count + 1 where id = new.quote_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update quotes set downloads_count = downloads_count - 1 where id = old.quote_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger downloads_adjust_quote_count
after insert or delete on downloads
for each row execute function trg_downloads_adjust_quote_count();

create index quotes_author_id_idx on quotes(author_id);
create index likes_quote_id_idx on likes(quote_id);
create index downloads_quote_id_idx on downloads(quote_id);
create index downloads_device_id_idx on downloads(device_id) where device_id is not null;
create index downloads_user_id_idx on downloads(user_id) where user_id is not null;
create index quote_tags_tag_id_idx on quote_tags(tag_id);

-- RLS
alter table authors enable row level security;
alter table quotes enable row level security;
alter table likes enable row level security;
alter table tags enable row level security;
alter table quote_tags enable row level security;
alter table downloads enable row level security;
alter table quote_of_the_day enable row level security;

-- Content is publicly readable; only the service role (ingestion cron) writes it.
create policy "authors are publicly readable" on authors for select using (true);
create policy "quotes are publicly readable" on quotes for select using (true);
create policy "tags are publicly readable" on tags for select using (true);
create policy "quote_tags are publicly readable" on quote_tags for select using (true);

-- quote_of_the_day is only ever written via ensure_quote_of_the_day()
-- (security definer), never directly by clients.
create policy "quote_of_the_day is publicly readable" on quote_of_the_day for select using (true);

-- Likes are the only user-writable data. Two identities are accepted:
-- a signed-in user (verified via auth.uid()) or a device_id (a
-- client-generated, unverified string — open to anyone since there's
-- nothing to check it against). device_id rows stay spoofable by design;
-- user_id rows are real ownership once a caller is authenticated.
create policy "likes are publicly readable" on likes for select using (true);

create policy "anyone can like as a device" on likes
  for insert to anon, authenticated with check (device_id is not null and user_id is null);

create policy "anyone can unlike as a device" on likes
  for delete to anon, authenticated using (device_id is not null and user_id is null);

create policy "users can like as themselves" on likes
  for insert to authenticated with check (user_id = auth.uid());

create policy "users can unlike their own likes" on likes
  for delete to authenticated using (user_id = auth.uid());

-- Downloads are the other user-writable data, same trust model as likes.
-- Append-only — no delete/update policies, since there's no "undo a
-- download" concept.
create policy "downloads are publicly readable" on downloads for select using (true);

create policy "anyone can record a download as a device" on downloads
  for insert to anon, authenticated with check (device_id is not null and user_id is null);

create policy "users can record a download as themselves" on downloads
  for insert to authenticated with check (user_id = auth.uid());

-- Trending: quotes ranked by a blend of likes and downloads in the last 7
-- days. Likes are weighted more heavily since they're a more deliberate
-- signal, but downloads alone can still surface a quote that has no likes
-- yet.
--
-- Returns full quote content (author, tags) in the same round trip so
-- clients don't need a second `quotes` select just to render the list —
-- see fetchTrending() in src/lib/api/quotes.ts. The 7-day windowed
-- counts are exposed separately from the lifetime like_count/
-- downloads_count columns already on `quotes` (named recent_like_count/
-- recent_download_count here to avoid confusion between the two) since
-- only the sort uses the windowed numbers; cards still display lifetime
-- counts. liked_by_me is resolved server-side from p_device_id (or
-- auth.uid() when signed in) instead of shipping the full likes table
-- rows down to the client to compute it themselves.
--
-- Ranking uses an exponentially time-decayed score per event (half-life
-- 24h) rather than a flat count over the 7-day window, so a quote that
-- got most of its likes/downloads in the last few hours outranks one
-- with the same 7-day total spread evenly across the week. recent_like_
-- count/recent_download_count stay as plain counts (still shown/used
-- elsewhere) — only the `order by` uses the decayed score.
drop function if exists trending_quotes(int);
drop function if exists trending_quotes(int, text);

create or replace function trending_quotes(max_rows int default 25, p_device_id text default null)
returns table (
  id uuid,
  text text,
  author_id uuid,
  created_at timestamptz,
  like_count integer,
  downloads_count integer,
  recent_like_count bigint,
  recent_download_count bigint,
  liked_by_me boolean,
  author_name text,
  author_slug text,
  tags jsonb
)
language sql stable as $$
  select
    q.id,
    q.text,
    q.author_id,
    q.created_at,
    q.like_count,
    q.downloads_count,
    coalesce(l.like_count, 0) as recent_like_count,
    coalesce(d.download_count, 0) as recent_download_count,
    exists (
      select 1 from likes lm
      where lm.quote_id = q.id
        and (
          (auth.uid() is not null and lm.user_id = auth.uid()) or
          (auth.uid() is null and p_device_id is not null and lm.device_id = p_device_id)
        )
    ) as liked_by_me,
    a.name as author_name,
    a.slug as author_slug,
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug))
       from quote_tags qt join tags t on t.id = qt.tag_id
       where qt.quote_id = q.id),
      '[]'::jsonb
    ) as tags
  from quotes q
  join authors a on a.id = q.author_id
  left join (
    select quote_id, count(*) as like_count
    from likes
    where created_at > now() - interval '7 days'
    group by quote_id
  ) l on l.quote_id = q.id
  left join (
    select quote_id, count(*) as download_count
    from downloads
    where created_at > now() - interval '7 days'
    group by quote_id
  ) d on d.quote_id = q.id
  left join (
    select quote_id,
      sum(exp(-extract(epoch from (now() - created_at)) / 86400 * ln(2) / 1)) as score
    from likes
    where created_at > now() - interval '7 days'
    group by quote_id
  ) ls on ls.quote_id = q.id
  left join (
    select quote_id,
      sum(exp(-extract(epoch from (now() - created_at)) / 86400 * ln(2) / 1)) as score
    from downloads
    where created_at > now() - interval '7 days'
    group by quote_id
  ) ds on ds.quote_id = q.id
  where coalesce(l.like_count, 0) > 0 or coalesce(d.download_count, 0) > 0
  order by coalesce(ls.score, 0) * 3 + coalesce(ds.score, 0) desc
  limit max_rows
$$;

-- Find-or-create an author by name. Used only by the ZenQuotes ingestion
-- job (service role) and the seed script.
create or replace function get_or_create_author(author_name text)
returns authors
language plpgsql as $$
declare
  result authors;
  new_slug text;
  suffix int := 1;
begin
  select * into result from authors where lower(name) = lower(author_name) limit 1;
  if found then
    return result;
  end if;

  new_slug := lower(regexp_replace(trim(author_name), '[^a-zA-Z0-9]+', '-', 'g'));
  while exists (select 1 from authors where slug = new_slug || case when suffix > 1 then '-' || suffix else '' end) loop
    suffix := suffix + 1;
  end loop;
  if suffix > 1 then
    new_slug := new_slug || '-' || suffix;
  end if;

  insert into authors (name, slug) values (author_name, new_slug)
  returning * into result;
  return result;
end;
$$;

-- Attach a set of tag names to a quote, creating tags as needed. Used only
-- by the ingestion job (service role) and the seed script.
create or replace function add_quote_tags(target_quote_id uuid, tag_names text[])
returns void
language plpgsql as $$
declare
  tag_name text;
  tag_slug text;
  tag_id uuid;
begin
  foreach tag_name in array tag_names loop
    tag_name := trim(tag_name);
    if tag_name = '' then
      continue;
    end if;

    select id into tag_id from tags where lower(name) = lower(tag_name) limit 1;
    if not found then
      tag_slug := lower(regexp_replace(tag_name, '[^a-zA-Z0-9]+', '-', 'g'));
      insert into tags (name, slug) values (tag_name, tag_slug)
      on conflict (slug) do update set name = excluded.name
      returning id into tag_id;
    end if;

    insert into quote_tags (quote_id, tag_id) values (target_quote_id, tag_id)
    on conflict do nothing;
  end loop;
end;
$$;

-- One random quote, for daily notifications.
create or replace function random_quote()
returns table (text text, author_name text)
language sql stable as $$
  select q.text, a.name as author_name
  from quotes q
  join authors a on a.id = q.author_id
  order by random()
  limit 1
$$;

-- Assigns a quote for p_date in quote_of_the_day if one isn't already
-- assigned, then returns its id. Picks randomly among quotes not yet used
-- for any date, so picks don't repeat until every quote has had a turn;
-- falls back to any quote once the pool is exhausted. security definer
-- since only the system assigns pairings (quote_of_the_day has no insert
-- policy for anon/authenticated). Not stable — it writes.
--
-- Not client-callable — see supabase/cron.sql, which runs this a few
-- hours ahead of each date via pg_cron so the row always already exists
-- by the time any client asks. Clients read quote_of_the_day directly
-- (a plain public-select table, no RPC needed) via
-- fetchQuoteOfDayRange() in src/lib/api/quotes.ts.
create or replace function ensure_quote_of_the_day(p_date date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_quote_id uuid;
begin
  select quote_id into v_quote_id from quote_of_the_day where date = p_date;
  if v_quote_id is not null then
    return v_quote_id;
  end if;

  select q.id into v_quote_id
  from quotes q
  where q.id not in (select quote_id from quote_of_the_day)
  order by random()
  limit 1;

  if v_quote_id is null then
    select q.id into v_quote_id from quotes q order by random() limit 1;
  end if;

  insert into quote_of_the_day (date, quote_id) values (p_date, v_quote_id)
  on conflict (date) do nothing;

  select quote_id into v_quote_id from quote_of_the_day where date = p_date;
  return v_quote_id;
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default on function creation —
-- revoke it explicitly so this stays cron/service-role-only, matching the
-- "no client-writable content" model everywhere else in this schema.
revoke execute on function ensure_quote_of_the_day(date) from public;

-- A batch of randomly-ordered quote ids, for the "random" feed tab (as
-- opposed to quote_of_the_day(), which is stable for the whole day).
create or replace function random_quotes(max_rows int default 50)
returns table (id uuid)
language sql stable as $$
  select q.id from quotes q order by random() limit max_rows
$$;

grant execute on function random_quotes(int) to anon, authenticated;

-- Called once right after a device signs in for the first time: moves that
-- device's likes and downloads onto the now-authenticated account (skipping
-- likes on quotes the account already liked, to avoid the unique-index
-- conflict — downloads have no such constraint since they're not deduped).
create or replace function merge_device_into_account(p_device_id text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update likes set device_id = null, user_id = auth.uid()
  where device_id = p_device_id
    and quote_id not in (select quote_id from likes where user_id = auth.uid());
  delete from likes where device_id = p_device_id;

  update downloads set device_id = null, user_id = auth.uid()
  where device_id = p_device_id;
end;
$$;

grant execute on function merge_device_into_account(text) to authenticated;

grant execute on function trending_quotes(int, text) to anon, authenticated;
grant execute on function get_or_create_author(text) to service_role;
grant execute on function add_quote_tags(uuid, text[]) to service_role;
grant execute on function random_quote() to anon, authenticated;
