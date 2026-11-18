import { type Card } from './cards.js'

export enum HandCategory {
  HighCard,
  Pair,
  TwoPair,
  ThreeOfAKind,
  Straight,
  Flush,
  FullHouse,
  FourOfAKind,
  StraightFlush,
}

export const HAND_NAMES: Record<HandCategory, string> = {
  [HandCategory.HighCard]: 'Carte haute',
  [HandCategory.Pair]: 'Paire',
  [HandCategory.TwoPair]: 'Double paire',
  [HandCategory.ThreeOfAKind]: 'Brelan',
  [HandCategory.Straight]: 'Quinte',
  [HandCategory.Flush]: 'Couleur',
  [HandCategory.FullHouse]: 'Full',
  [HandCategory.FourOfAKind]: 'Carré',
  [HandCategory.StraightFlush]: 'Quinte flush',
}

export interface EvaluatedHand {
  category: HandCategory
  score: number[] // [catégorie, départages...] comparés dans l'ordre
  cards: Card[] // les 5 cartes retenues
}

// Meilleure main de 5 cartes parmi 5 à 7
export function evaluateHand(cards: Card[]): EvaluatedHand {
  if (cards.length < 5)
    throw new Error(`Il faut au moins 5 cartes pour évaluer une main (reçu ${cards.length})`)

  return combinations(cards, 5)
    .map(evaluateFive)
    .reduce((best, hand) => (compareHands(hand, best) > 0 ? hand : best))
}

// Combinaison de 2 à 7 cartes : sous 5 cartes (pré-flop), il n'y a que la paire ou la carte haute
export function handCategory(cards: Card[]): HandCategory {
  if (cards.length >= 5)
    return evaluateHand(cards).category
  return new Set(cards.map(card => card.rank)).size < cards.length ? HandCategory.Pair : HandCategory.HighCard
}

// > 0 si a bat b, 0 si égalité parfaite
export function compareHands(a: EvaluatedHand, b: EvaluatedHand): number {
  for (let i = 0; i < Math.max(a.score.length, b.score.length); i++) {
    const diff = (a.score[i] ?? 0) - (b.score[i] ?? 0)
    if (diff !== 0)
      return diff
  }
  return 0
}

function evaluateFive(cards: Card[]): EvaluatedHand {
  // rangs groupés : d'abord par nombre d'exemplaires, puis par hauteur (ex. full KKK22 → [13, 2])
  const counts = new Map<number, number>()
  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1)
  }
  const groups = [...counts.entries()].sort(([rankA, countA], [rankB, countB]) => countB - countA || rankB - rankA)
  const groupedRanks = groups.map(([rank]) => rank)
  const groupSizes = groups.map(([, count]) => count)

  const isFlush = cards.every(card => card.suit === cards[0].suit)
  const straightHigh = findStraightHigh(groupedRanks)
  const category = categorize(groupSizes, isFlush, straightHigh)
  const score = straightHigh ? [category, straightHigh] : [category, ...groupedRanks]
  const sortedCards = [...cards].sort((a, b) => groupedRanks.indexOf(a.rank) - groupedRanks.indexOf(b.rank))

  return { category, score, cards: sortedCards }
}

// Hauteur de la quinte, 0 s'il n'y en a pas. La roue A-2-3-4-5 vaut une quinte à 5.
function findStraightHigh(distinctRanksDesc: number[]): number {
  if (distinctRanksDesc.length !== 5)
    return 0
  if (distinctRanksDesc[0] - distinctRanksDesc[4] === 4)
    return distinctRanksDesc[0]
  if (distinctRanksDesc.join() === '14,5,4,3,2')
    return 5
  return 0
}

function categorize(groupSizes: number[], isFlush: boolean, straightHigh: number): HandCategory {
  if (straightHigh && isFlush)
    return HandCategory.StraightFlush
  if (groupSizes[0] === 4)
    return HandCategory.FourOfAKind
  if (groupSizes[0] === 3 && groupSizes[1] === 2)
    return HandCategory.FullHouse
  if (isFlush)
    return HandCategory.Flush
  if (straightHigh)
    return HandCategory.Straight
  if (groupSizes[0] === 3)
    return HandCategory.ThreeOfAKind
  if (groupSizes[0] === 2 && groupSizes[1] === 2)
    return HandCategory.TwoPair
  if (groupSizes[0] === 2)
    return HandCategory.Pair
  return HandCategory.HighCard
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0)
    return [[]]
  if (items.length < size)
    return []

  const [first, ...rest] = items
  return [
    ...combinations(rest, size - 1).map(combo => [first, ...combo]),
    ...combinations(rest, size),
  ]
}
