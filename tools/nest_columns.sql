-- 🐢48 egg mode leaderboard columns (2026-10-31). Run once in Supabase SQL Editor before deploying.
alter table public.scores
  add column if not exists nest_best integer not null default 0,
  add column if not exists nest_top  integer not null default 0;
