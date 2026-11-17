import { describe, expect, it } from 'vitest'
import { parseCards } from './cards.js'
import { evaluateShowdown } from './showdown.js'

const BOARD = parseCards('2c 7d 9h Js 4c')

const player = (name: string, hole: string, position: number) => ({ id: name, name, hole: parseCards(hole), position })

describe('evaluateShowdown', () => {
  it('evaluateShowdown_ClassementParfait_Gagne', () => {
    const result = evaluateShowdown([
      player('Paire', 'Ah Ad', 1),
      player('Hauteur', 'Kh 3d', 2),
    ], BOARD)

    expect(result.success).toBe(true)
  })

  it('evaluateShowdown_PositionsInversees_PerdEtDonneLesVraiesPlaces', () => {
    const result = evaluateShowdown([
      player('Paire', 'Ah Ad', 2),
      player('Hauteur', 'Kh 3d', 1),
    ], BOARD)

    expect(result.success).toBe(false)
    expect(result.entries.map(entry => [entry.name, entry.bestRank])).toEqual([['Hauteur', 2], ['Paire', 1]])
  })

  it('evaluateShowdown_ExAequo_NImporteQuelOrdreAccepte', () => {
    // mêmes valeurs, couleurs différentes : égalité parfaite entre les deux
    const players = (first: number, second: number) => [
      player('A', 'Ah Kh', first),
      player('B', 'Ad Kd', second),
      player('C', '3s 5s', 3),
    ]

    expect(evaluateShowdown(players(1, 2), BOARD).success).toBe(true)
    expect(evaluateShowdown(players(2, 1), BOARD).success).toBe(true)
  })

  it('evaluateShowdown_ExAequoMalPlaces_Perd', () => {
    const result = evaluateShowdown([
      player('A', 'Ah Kh', 1),
      player('B', 'Ad Kd', 3),
      player('C', '3s 5s', 2),
    ], BOARD)

    expect(result.success).toBe(false)
  })

  it('evaluateShowdown_ResultatTrieParPosition', () => {
    const result = evaluateShowdown([
      player('C', '3s 5s', 3),
      player('A', 'Ah Ad', 1),
      player('B', 'Kh Qd', 2),
    ], BOARD)

    expect(result.entries.map(entry => entry.name)).toEqual(['A', 'B', 'C'])
  })
})
