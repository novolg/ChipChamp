import type { Card } from '../../engine/types';

const suits = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
const faces: Record<number, string> = { 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
export const cardLabel = (card: Card): string => `${faces[card.rank] ?? card.rank} of ${suits[card.suit]}`;
