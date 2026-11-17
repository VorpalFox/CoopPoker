import { type Card } from './cards.js'
import { compareHands, evaluateHand, type EvaluatedHand } from './handEvaluator.js'

export interface ShowdownPlayer {
  id: string
  name: string
  hole: Card[]
  position: number // position finale, 1 = meilleure main
}

export interface ShowdownEntry extends ShowdownPlayer {
  hand: EvaluatedHand
  bestRank: number // vraie place (les ex-aequo partagent une plage de places)
  worstRank: number
  correct: boolean
}

export interface ShowdownResult {
  success: boolean
  entries: ShowdownEntry[] // triées par position
}

export function evaluateShowdown(players: ShowdownPlayer[], board: Card[]): ShowdownResult {
  const hands = players.map(player => ({ player, hand: evaluateHand([...player.hole, ...board]) }))

  const entries = hands
    .map(({ player, hand }) => {
      // les ex-aequo peuvent se répartir leurs places dans n'importe quel ordre
      const betterCount = hands.filter(other => compareHands(other.hand, hand) > 0).length
      const tiedCount = hands.filter(other => compareHands(other.hand, hand) === 0).length
      const bestRank = betterCount + 1
      const worstRank = betterCount + tiedCount
      const correct = player.position >= bestRank && player.position <= worstRank
      return { ...player, hand, bestRank, worstRank, correct }
    })
    .sort((a, b) => a.position - b.position)

  return { success: entries.every(entry => entry.correct), entries }
}
