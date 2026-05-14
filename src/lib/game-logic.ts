import type { DiceRoll, Hand, HandType } from '@/types/game';

export function evaluateRoll(dice: DiceRoll): Hand | null {
  const sorted = [...dice].sort((a, b) => a - b) as DiceRoll;
  const [a, b, c] = sorted;

  if (a === 1 && b === 1 && c === 1) return { type: 'pinzoro' };
  if (a === 1 && b === 2 && c === 3) return { type: 'hifumi' };
  if (a === 4 && b === 5 && c === 6) return { type: 'shigoro' };
  if (a === b && b === c) return { type: 'zoro', value: a };
  if (a === b) return { type: 'meari', value: c };
  if (b === c) return { type: 'meari', value: a };
  if (a === c) return { type: 'meari', value: b };
  return null;
}

export function handStrength(hand: Hand): number {
  switch (hand.type) {
    case 'pinzoro': return 1000;
    case 'zoro':    return 600 + (hand.value ?? 0);
    case 'shigoro': return 500;
    case 'meari':   return 100 + (hand.value ?? 0);
    case 'menashi': return 2;
    case 'hifumi':  return 1;
  }
}

export function resolveFinalHand(rolls: DiceRoll[]): Hand | null {
  for (const roll of rolls) {
    const hand = evaluateRoll(roll);
    if (hand !== null) return hand;
  }
  if (rolls.length >= 3) return { type: 'menashi' };
  return null;
}

export function rollDice(): DiceRoll {
  return [
    Math.ceil(Math.random() * 6),
    Math.ceil(Math.random() * 6),
    Math.ceil(Math.random() * 6),
  ];
}

export function handLabel(hand: Hand): string {
  switch (hand.type) {
    case 'pinzoro': return 'ピンゾロ ✨';
    case 'zoro':    return `ゾロ目 ${hand.value}`;
    case 'shigoro': return 'シゴロ (4-5-6)';
    case 'meari':   return `目あり ${hand.value}`;
    case 'menashi': return '目なし';
    case 'hifumi':  return 'ヒフミ (1-2-3)';
  }
}

export function handTypeLabel(type: HandType): string {
  const map: Record<HandType, string> = {
    pinzoro: 'ピンゾロ', zoro: 'ゾロ目', shigoro: 'シゴロ',
    meari: '目あり', menashi: '目なし', hifumi: 'ヒフミ',
  };
  return map[type];
}

export function formatMoney(amount: number): string {
  return amount.toLocaleString('ja-JP') + ' ソツー';
}
