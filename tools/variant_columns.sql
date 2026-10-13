-- Fib, Threes and Turtle leaderboard columns (2026-10-12). Run once in Supabase SQL Editor before deploying.
alter table public.scores
  add column if not exists fib_best    integer not null default 0,
  add column if not exists fib_top     integer not null default 0,
  add column if not exists threes_best integer not null default 0,
  add column if not exists threes_top  integer not null default 0,
  add column if not exists turtle_best integer not null default 0,
  add column if not exists turtle_top  integer not null default 0;
