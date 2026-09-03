-- qq schema: authors, quotes, likes, tags, and supporting RPCs.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
--
-- Content (authors, quotes, tags) is populated only by system processes
-- (the ZenQuotes ingestion cron, running as the service role) — end users
-- can read everything but can only write their own likes.

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

create table quotes (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  author_id uuid not null references authors(id) on delete cascade,
  source text not null default 'zenquotes' check (source in ('zenquotes', 'manual')),
  created_at timestamptz not null default now(),
  unique (author_id, text)
);

create table likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  quote_id uuid not null references quotes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, quote_id)
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

create index quotes_author_id_idx on quotes(author_id);
create index likes_quote_id_idx on likes(quote_id);
create index quote_tags_tag_id_idx on quote_tags(tag_id);

-- RLS
alter table authors enable row level security;
alter table quotes enable row level security;
alter table likes enable row level security;
alter table tags enable row level security;
alter table quote_tags enable row level security;

-- Content is publicly readable; only the service role (ingestion cron) writes it.
create policy "authors are publicly readable" on authors for select using (true);
create policy "quotes are publicly readable" on quotes for select using (true);
create policy "tags are publicly readable" on tags for select using (true);
create policy "quote_tags are publicly readable" on quote_tags for select using (true);

-- Likes are the only user-writable data.
create policy "likes are publicly readable" on likes for select using (true);

create policy "users can like as themselves" on likes
  for insert to authenticated with check (user_id = auth.uid());

create policy "users can unlike their own likes" on likes
  for delete to authenticated using (user_id = auth.uid());

-- Trending: quotes ranked by likes in the last 7 days.
create or replace function trending_quotes(max_rows int default 25)
returns table (id uuid, like_count bigint)
language sql stable as $$
  select l.quote_id as id, count(*) as like_count
  from likes l
  where l.created_at > now() - interval '7 days'
  group by l.quote_id
  order by like_count desc
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

grant execute on function trending_quotes(int) to anon, authenticated;
grant execute on function get_or_create_author(text) to service_role;
grant execute on function add_quote_tags(uuid, text[]) to service_role;
grant execute on function random_quote() to anon, authenticated;
