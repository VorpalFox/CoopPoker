import { describe, expect, it } from 'vitest'
import { parseCards } from './cards.js'
import { compareHands, evaluateHand, HandCategory } from './handEvaluator.js'

const hand = (cards: string) => evaluateHand(parseCards(cards))

describe('evaluateHand', () => {
  it.each([
    ['2h 7d 9c Js Kh 3d 4c', HandCategory.HighCard],
    ['Ah Ad 9c Js Kh 3d 4c', HandCategory.Pair],
    ['Ah Ad 9c 9s Kh 3d 4c', HandCategory.TwoPair],
    ['Ah Ad Ac 9s Kh 3d 4c', HandCategory.ThreeOfAKind],
    ['5h 6d 7c 8s 9h Kd Ac', HandCategory.Straight],
    ['2h 7h 9h Jh Kh 3d 4c', HandCategory.Flush],
    ['Ah Ad Ac 9s 9h 3d 4c', HandCategory.FullHouse],
    ['Ah Ad Ac As Kh 3d 4c', HandCategory.FourOfAKind],
    ['5h 6h 7h 8h 9h Kd Ac', HandCategory.StraightFlush],
  ])('evaluateHand_%s_Categorie', (cards, expected) => {
    expect(hand(cards).category).toBe(expected)
  })

  it('evaluateHand_Roue_QuinteHauteurCinq', () => {
    const wheel = hand('Ah 2d 3c 4s 5h Kd Qc')
    expect(wheel.category).toBe(HandCategory.Straight)
    expect(wheel.score).toEqual([HandCategory.Straight, 5])
  })

  it('evaluateHand_SeptCartes_GardeLaMeilleureCombinaison', () => {
    // couleur à cœur cachée derrière une quinte
    expect(hand('4h 5d 6h 7h 8c Kh 2h').category).toBe(HandCategory.Flush)
  })

  it('evaluateHand_MoinsDeCinqCartes_Leve', () => {
    expect(() => hand('Ah Kd')).toThrow()
  })
})

describe('compareHands', () => {
  it('compareHands_RoueContreQuinteASix_RoueMoinsForte', () => {
    expect(compareHands(hand('Ah 2d 3c 4s 5h'), hand('2h 3d 4c 5s 6h'))).toBeLessThan(0)
  })

  it('compareHands_MemePaireKickerDifferent_KickerDepartage', () => {
    expect(compareHands(hand('Kh Kd Ac 7s 3h'), hand('Kc Ks Qc 7d 3c'))).toBeGreaterThan(0)
  })

  it('compareHands_DoublePaire_PaireHauteDAbord', () => {
    expect(compareHands(hand('Ah Ad 2c 2s 3h'), hand('Kc Ks Qc Qd Ac'))).toBeGreaterThan(0)
  })

  it('compareHands_FullBrelanPlusFort_Gagne', () => {
    expect(compareHands(hand('3h 3d 3c 2s 2h'), hand('2c 2d 2h Ac Ad'))).toBeGreaterThan(0)
  })

  it('compareHands_MemesValeursCouleursDifferentes_Egalite', () => {
    expect(compareHands(hand('Ah Kd 9c 7s 3h'), hand('Ac Kh 9d 7c 3d'))).toBe(0)
  })
})
