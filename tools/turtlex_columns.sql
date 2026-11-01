-- 🐢48x leaderboard columns (2026-11-01). Run once in Supabase SQL Editor before deploying.
alter table public.scores
  add column if not exists turtlex_best integer not null default 0,
  add column if not exists turtlex_top  integer not null default 0;
