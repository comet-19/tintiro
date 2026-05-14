export type DiceRoll = [number, number, number];

export type HandType =
  | 'pinzoro'   // 1-1-1  最強 (ピンゾロ)
  | 'zoro'      // x-x-x (x=2〜6)
  | 'shigoro'   // 4-5-6
  | 'meari'     // ペア + 目
  | 'menashi'   // 3回振っても目なし
  | 'hifumi';   // 1-2-3  最弱

export interface Hand {
  type: HandType;
  value?: number;  // zoro: 2〜6, meari: 1〜6
}

export interface Profile {
  id: string;
  username: string;
  money: number;
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: string;
  name: string;
  status: 'waiting' | 'playing' | 'finished';
  max_players: number;
  current_banker_seat: number;
  current_round: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RoomPlayer {
  id: string;
  room_id: string;
  player_id: string;
  seat_index: number;
  is_active: boolean;
  joined_at: string;
  profile?: Profile;
}

export interface Round {
  id: string;
  room_id: string;
  round_number: number;
  banker_id: string;
  status: 'betting' | 'rolling' | 'settling' | 'done';
  banker_rolls: DiceRoll[] | null;
  banker_hand: HandType | null;
  banker_hand_value: number | null;
  created_at: string;
}

export interface Bet {
  id: string;
  round_id: string;
  player_id: string;
  amount: number;
  rolls: DiceRoll[] | null;
  hand: HandType | null;
  hand_value: number | null;
  result: 'win' | 'lose' | 'draw' | null;
  settled_at: string | null;
}
