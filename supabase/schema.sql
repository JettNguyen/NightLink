-- ============================================================
-- NightLink — Supabase PostgreSQL Schema
-- Run this in the Supabase SQL editor (Dashboard → SQL editor)
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- PROFILES (mirrors auth.users, one row per user)
-- ============================================================
create table if not exists public.profiles (
  id                   uuid primary key references auth.users on delete cascade,
  email                text,
  display_name         text not null default 'Dreamer',
  username             text unique not null,
  normalized_username  text unique not null,
  photo_url            text,
  avatar_icon          text,
  avatar_background    text,
  avatar_color         text,
  is_anonymous         boolean not null default false,
  settings             jsonb not null default '{}',
  subscription         jsonb not null default '{"tier":"free"}',
  ai_usage             jsonb not null default '{"monthYear":"","monthlyCount":0,"creditBalance":0}',
  feed_seen_at_ms      bigint,
  fcm_tokens           text[] not null default '{}',
  following_ids        uuid[] not null default '{}',
  follower_ids         uuid[] not null default '{}',
  allow_anonymous_sharing boolean not null default true,
  premium_emails       text[] not null default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ============================================================
-- DREAMS
-- ============================================================
create table if not exists public.dreams (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles(id) on delete cascade,
  title                text not null default '',
  content              text not null default '',
  visibility           text not null default 'private'
                         check (visibility in ('private','public','following','anonymous')),
  ai_generated         boolean not null default false,
  ai_title             text,
  ai_insights          text,
  tags                 jsonb not null default '[]',
  reaction_counts      jsonb not null default '{}',
  viewer_reactions     jsonb not null default '{}',
  excluded_viewer_ids  uuid[] not null default '{}',
  tagged_user_ids      uuid[] not null default '{}',
  tagged_users         jsonb not null default '[]',
  author_username      text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists dreams_user_id_created_at_idx on public.dreams (user_id, created_at desc);
create index if not exists dreams_visibility_created_at_idx on public.dreams (visibility, created_at desc);

-- ============================================================
-- COMMENTS
-- ============================================================
create table if not exists public.comments (
  id                     uuid primary key default gen_random_uuid(),
  dream_id               uuid not null references public.dreams(id) on delete cascade,
  dream_owner_id         uuid references public.profiles(id),
  user_id                uuid not null references public.profiles(id) on delete cascade,
  author_display_name    text,
  author_username        text,
  dream_owner_username   text,
  dream_title_snapshot   text,
  content                text not null,
  parent_comment_id      uuid references public.comments(id),
  parent_comment_user_id uuid references public.profiles(id),
  mentions               uuid[] not null default '{}',
  mention_handles        text[] not null default '{}',
  activity_target_ids    uuid[] not null default '{}',
  heart_count            integer not null default 0,
  heart_user_ids         uuid[] not null default '{}',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists comments_dream_id_created_at_idx on public.comments (dream_id, created_at asc);

-- ============================================================
-- ACTIVITY (inbox per user)
-- ============================================================
create table if not exists public.activity (
  id                   uuid primary key default gen_random_uuid(),
  target_user_id       uuid not null references public.profiles(id) on delete cascade,
  actor_id             uuid references public.profiles(id),
  actor_display_name   text,
  actor_username       text,
  type                 text not null
                         check (type in ('reaction','commentReaction','mention','reply','comment')),
  emoji                text,
  dream_id             uuid references public.dreams(id),
  dream_owner_id       uuid references public.profiles(id),
  dream_title_snapshot text,
  comment_id           uuid references public.comments(id),
  read                 boolean not null default false,
  read_at              timestamptz,
  created_at           timestamptz not null default now()
);

create index if not exists activity_target_user_id_created_at_idx on public.activity (target_user_id, created_at desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.dreams    enable row level security;
alter table public.comments  enable row level security;
alter table public.activity  enable row level security;

-- profiles: anyone can read (needed for usernames, search); only owner can update
drop policy if exists "profiles_read" on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_read"   on public.profiles for select using (true);
create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

-- dreams: owner can do anything; others can read non-private (app enforces fine-grained access)
drop policy if exists "dreams_owner" on public.dreams;
drop policy if exists "dreams_read" on public.dreams;
create policy "dreams_owner"    on public.dreams for all    using (auth.uid() = user_id);
create policy "dreams_read"     on public.dreams for select using (visibility != 'private');

-- comments: owner or dream-owner can delete; anyone authed can read/insert
drop policy if exists "comments_read" on public.comments;
drop policy if exists "comments_insert" on public.comments;
drop policy if exists "comments_delete" on public.comments;
create policy "comments_read"   on public.comments for select using (auth.uid() is not null);
create policy "comments_insert" on public.comments for insert with check (auth.uid() = user_id);
create policy "comments_delete" on public.comments for delete
  using (auth.uid() = user_id or auth.uid() = dream_owner_id);

-- activity: only target user can read; anyone authed can insert (push-style)
drop policy if exists "activity_read" on public.activity;
drop policy if exists "activity_insert" on public.activity;
drop policy if exists "activity_update" on public.activity;
drop policy if exists "activity_delete" on public.activity;
create policy "activity_read"   on public.activity for select using (auth.uid() = target_user_id);
create policy "activity_insert" on public.activity for insert with check (auth.uid() is not null);
create policy "activity_update" on public.activity for update using (auth.uid() = target_user_id);
create policy "activity_delete" on public.activity for delete using (auth.uid() = target_user_id);

-- ============================================================
-- PL/pgSQL FUNCTIONS
-- ============================================================

-- Atomically toggle a dream reaction and update counts
create or replace function toggle_dream_reaction(
  p_dream_id uuid,
  p_user_id  uuid,
  p_emoji    text  -- pass null to remove existing reaction
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_reactions jsonb;
  v_counts    jsonb;
  v_prev      text;
  v_next      text;
begin
  select viewer_reactions, reaction_counts
  into   v_reactions, v_counts
  from   public.dreams
  where  id = p_dream_id
  for update;

  if not found then
    raise exception 'Dream not found';
  end if;

  v_reactions := coalesce(v_reactions, '{}'::jsonb);
  v_counts    := coalesce(v_counts,    '{}'::jsonb);
  v_prev      := v_reactions ->> p_user_id::text;

  -- Remove previous reaction
  if v_prev is not null then
    v_reactions := v_reactions - p_user_id::text;
    v_counts    := jsonb_set(v_counts, array[v_prev],
      to_jsonb(greatest(0, coalesce((v_counts ->> v_prev)::int, 0) - 1)));
  end if;

  -- Add new reaction
  v_next := null;
  if p_emoji is not null and p_emoji != '' then
    v_reactions := jsonb_set(v_reactions, array[p_user_id::text], to_jsonb(p_emoji));
    v_counts    := jsonb_set(v_counts, array[p_emoji],
      to_jsonb(coalesce((v_counts ->> p_emoji)::int, 0) + 1));
    v_next := p_emoji;
  end if;

  update public.dreams
  set    viewer_reactions = v_reactions,
         reaction_counts  = v_counts,
         updated_at       = now()
  where  id = p_dream_id;

  return jsonb_build_object('prev', v_prev, 'next', v_next, 'changed', true);
end;
$$;

-- Atomically toggle a comment heart
create or replace function toggle_comment_heart(
  p_comment_id uuid,
  p_user_id    uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_hearts      uuid[];
  v_count       int;
  v_already     boolean;
  v_added       boolean;
begin
  select heart_user_ids, heart_count
  into   v_hearts, v_count
  from   public.comments
  where  id = p_comment_id
  for update;

  if not found then
    raise exception 'Comment not found';
  end if;

  v_hearts  := coalesce(v_hearts, '{}');
  v_count   := coalesce(v_count, 0);
  v_already := p_user_id = any(v_hearts);

  if v_already then
    v_hearts := array_remove(v_hearts, p_user_id);
    v_count  := greatest(0, v_count - 1);
    v_added  := false;
  else
    v_hearts := array_append(v_hearts, p_user_id);
    v_count  := v_count + 1;
    v_added  := true;
  end if;

  update public.comments
  set    heart_user_ids = v_hearts,
         heart_count    = v_count,
         updated_at     = now()
  where  id = p_comment_id;

  return jsonb_build_object('added', v_added, 'heartCount', v_count);
end;
$$;

-- Atomically check and increment AI usage quota
create or replace function check_and_increment_ai_quota(
  p_user_id    uuid,
  p_month_year text,
  p_free_limit int default 1
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_usage         jsonb;
  v_tier          text;
  v_stored_month  text;
  v_monthly_count int;
  v_credits       int;
  v_is_new_month  boolean;
begin
  select ai_usage, coalesce(subscription->>'tier', 'free')
  into   v_usage, v_tier
  from   public.profiles
  where  id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'no_user');
  end if;

  v_usage        := coalesce(v_usage, '{}'::jsonb);
  v_stored_month := coalesce(v_usage->>'monthYear', '');
  v_is_new_month := v_stored_month != p_month_year;
  v_monthly_count:= case when v_is_new_month then 0
                         else coalesce((v_usage->>'monthlyCount')::int, 0) end;
  v_credits      := coalesce((v_usage->>'creditBalance')::int, 0);

  if v_tier = 'premium' then
    update public.profiles
    set    ai_usage = v_usage
                   || jsonb_build_object('monthYear', p_month_year,
                                         'monthlyCount', v_monthly_count + 1)
    where  id = p_user_id;
    return jsonb_build_object('allowed', true, 'tier', 'premium',
                              'remainingFree', null, 'creditBalance', v_credits);
  end if;

  -- Free tier
  if v_monthly_count >= p_free_limit then
    if v_credits <= 0 then
      return jsonb_build_object('allowed', false, 'tier', 'free',
                                'remainingFree', 0, 'creditBalance', 0);
    end if;
    update public.profiles
    set    ai_usage = v_usage
                   || jsonb_build_object('monthYear', p_month_year,
                                         'monthlyCount', v_monthly_count,
                                         'creditBalance', v_credits - 1)
    where  id = p_user_id;
    return jsonb_build_object('allowed', true, 'usedCredit', true, 'tier', 'free',
                              'remainingFree', 0, 'creditBalance', v_credits - 1);
  end if;

  update public.profiles
  set    ai_usage = v_usage
                 || jsonb_build_object('monthYear', p_month_year,
                                       'monthlyCount', v_monthly_count + 1,
                                       'creditBalance', v_credits)
  where  id = p_user_id;

  return jsonb_build_object('allowed', true, 'tier', 'free',
                            'remainingFree', p_free_limit - v_monthly_count - 1,
                            'creditBalance', v_credits);
end;
$$;

-- ============================================================
-- REALTIME — enable on tables that need live updates
-- (Run these in Supabase Dashboard → Database → Replication)
-- alter publication supabase_realtime add table public.dreams;
-- alter publication supabase_realtime add table public.comments;
-- alter publication supabase_realtime add table public.activity;
-- alter publication supabase_realtime add table public.profiles;
-- ============================================================
