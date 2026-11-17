export const SUITS = ['s', 'h', 'd', 'c'] as const

export type Suit = (typeof SUITS)[number]

export interface Card {
  rank: number // 2 à 14 (14 = As)
  suit: Suit
}

const SUIT_SYMBOLS: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }
const RANK_LABELS: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }
const RANK_CHARS: Record<string, number> = { T: 10, J: 11, Q: 12, K: 13, A: 14 }

export function createDeck(): Card[] {
  return SUITS.flatMap(suit => Array.from({ length: 13 }, (_, i) => ({ rank: i + 2, suit })))
}

// Fisher-Yates, sans toucher au tableau d'origine
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function rankLabel(rank: number): string {
  return RANK_LABELS[rank] ?? String(rank)
}

export function formatCard(card: Card): string {
  return `${rankLabel(card.rank)}${SUIT_SYMBOLS[card.suit]}`
}

export function formatCards(cards: Card[]): string {
  return cards.map(formatCard).join(' ')
}

// Pratique pour les tests : 'As', 'Td', '7c'
export function parseCard(text: string): Card {
  const rankText = text.slice(0, -1).toUpperCase()
  const suit = text.slice(-1).toLowerCase() as Suit
  const rank = RANK_CHARS[rankText] ?? Number(rankText)
  if (!SUITS.includes(suit) || !(rank >= 2 && rank <= 14))
    throw new Error(`Carte invalide : ${text}`)

  return { rank, suit }
}

export function parseCards(text: string): Card[] {
  return text.trim().split(/\s+/).map(parseCard)
}
