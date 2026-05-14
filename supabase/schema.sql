-- ============================================================
-- チンチロバトル — Supabase Schema
-- Supabase Dashboard の SQL Editor で実行してください
-- ============================================================

-- profiles (auth.users に連動)
create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text not null unique,
  money bigint not null default 1000000,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table profiles enable row level security;
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on profiles for update using (auth.uid() = id);

-- rooms
create table if not exists rooms (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  max_players int not null default 5 check (max_players between 2 and 5),
  current_banker_seat int not null default 0,
  current_round int not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table rooms enable row level security;
create policy "rooms_select" on rooms for select using (true);
create policy "rooms_insert" on rooms for insert with check (auth.uid() = created_by);

-- room_players (テーブルの座席)
create table if not exists room_players (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references rooms(id) on delete cascade not null,
  player_id uuid references profiles(id) not null,
  seat_index int not null check (seat_index between 0 and 4),
  is_active boolean not null default true,
  joined_at timestamptz default now(),
  unique(room_id, player_id),
  unique(room_id, seat_index)
);

alter table room_players enable row level security;
create policy "room_players_select" on room_players for select using (true);
create policy "room_players_insert" on room_players for insert with check (auth.uid() = player_id);
create policy "room_players_update" on room_players for update using (auth.uid() = player_id);
create policy "room_players_delete" on room_players for delete using (auth.uid() = player_id);

-- rooms の update ポリシー（room_players が存在してから追加）
create policy "rooms_update" on rooms for update using (
  exists (select 1 from room_players where room_id = rooms.id and player_id = auth.uid() and is_active = true)
);

-- rounds
create table if not exists rounds (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references rooms(id) on delete cascade not null,
  round_number int not null,
  banker_id uuid references profiles(id) not null,
  status text not null default 'betting'
    check (status in ('betting', 'rolling', 'settling', 'done')),
  banker_rolls jsonb,
  banker_hand text,
  banker_hand_value int,
  created_at timestamptz default now()
);

alter table rounds enable row level security;
create policy "rounds_select" on rounds for select using (true);
create policy "rounds_all" on rounds for all using (
  exists (select 1 from room_players where room_id = rounds.room_id and player_id = auth.uid() and is_active = true)
);

-- bets (子1人 × 1ラウンド)
create table if not exists bets (
  id uuid default gen_random_uuid() primary key,
  round_id uuid references rounds(id) on delete cascade not null,
  player_id uuid references profiles(id) not null,
  amount bigint not null check (amount >= 10000),
  rolls jsonb,
  hand text,
  hand_value int,
  result text check (result in ('win', 'lose', 'draw') or result is null),
  settled_at timestamptz,
  unique(round_id, player_id)
);

alter table bets enable row level security;
create policy "bets_select" on bets for select using (true);
create policy "bets_insert" on bets for insert with check (auth.uid() = player_id);
create policy "bets_update" on bets for update using (auth.uid() = player_id);

-- ============================================================
-- ラウンド精算 RPC
-- ============================================================
create or replace function settle_round(p_round_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_round rounds%rowtype;
  v_bet   bets%rowtype;
  v_multiplier int;
begin
  select * into v_round from rounds where id = p_round_id;

  if v_round.banker_id != auth.uid() then
    raise exception 'Only the banker can settle the round';
  end if;

  for v_bet in select * from bets where round_id = p_round_id loop
    v_multiplier := case when v_round.banker_hand = 'pinzoro' then 2 else 1 end;

    if v_bet.hand_value > v_round.banker_hand_value then
      update bets set result = 'win', settled_at = now() where id = v_bet.id;
      update profiles set money = money + v_bet.amount   where id = v_bet.player_id;
      update profiles set money = money - v_bet.amount   where id = v_round.banker_id;
    elsif v_bet.hand_value < v_round.banker_hand_value then
      update bets set result = 'lose', settled_at = now() where id = v_bet.id;
      update profiles set money = money + v_bet.amount * v_multiplier where id = v_round.banker_id;
      update profiles set money = money - v_bet.amount * v_multiplier where id = v_bet.player_id;
    else
      update bets set result = 'draw', settled_at = now() where id = v_bet.id;
    end if;
  end loop;

  update rounds set status = 'done' where id = p_round_id;
end;
$$;

-- ============================================================
-- ユーザー登録時にプロフィール自動作成
-- ============================================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into profiles (id, username)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- Realtime 有効化
-- ============================================================
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table room_players;
alter publication supabase_realtime add table rounds;
alter publication supabase_realtime add table bets;
alter publication supabase_realtime add table profiles;
