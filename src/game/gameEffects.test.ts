import { beforeEach, describe, expect, it } from 'vitest'
import { parseCards } from './cards.js'
import { type EffectId } from './effects.js'
import { Game, GameError } from './game.js'
import { HandCategory } from './handEvaluator.js'

// Alice AA, Bob 72, tableau 9h Js 4c Kd 3h, puis des cartes en rab pour l'échange
const RIGGED_DECK = 'Ah Ad 7c 2s 9h Js 4c Kd 3h Qs Qd'

describe('Game avec bonus / malus', () => {
  let game: Game

  beforeEach(() => {
    game = new Game(() => parseCards(RIGGED_DECK), () => 0)
    game.join('alice', 'Alice')
    game.join('bob', 'Bob')
  })

  // la 1re manche n'a pas d'effet tiré : on les pose à la main avant de lancer
  const startWith = (...effects: EffectId[]) => {
    game.effects = effects
    game.start()
  }

  const placeAll = (alice: number, bob: number) => {
    game.takePosition('alice', alice)
    game.takePosition('bob', bob)
  }

  const playRound = (alice: number, bob: number) => {
    placeAll(alice, bob)
    game.advance()
  }

  it('start_ApresUneVictoire_TireUnMalus', () => {
    game.start()
    for (let i = 0; i < 4; i++) {
      playRound(1, 2)
    }

    game.start()

    expect(game.effects).toEqual(['noLock'])
  })

  it('start_ApresUneDefaite_TireUnBonus', () => {
    game.start()
    for (let i = 0; i < 4; i++) {
      playRound(2, 1)
    }

    game.start()

    expect(game.effects).toEqual(['swap'])
  })

  it('toggleChaos_PendantUneManche_Refuse', () => {
    game.start()
    expect(() => game.toggleChaos()).toThrow(GameError)
  })

  it('lock_MalusPasDeBlocage_Refuse', () => {
    startWith('noLock')
    game.takePosition('alice', 1)

    expect(() => game.lock('alice')).toThrow(GameError)
  })

  it('takePosition_MalusPasDeVolPositionPrise_Refuse', () => {
    startWith('noSteal')
    game.takePosition('alice', 1)

    expect(() => game.takePosition('bob', 1)).toThrow(GameError)
    expect(game.findPlayer('alice')?.position).toBe(1)
  })

  it('takePosition_MalusPasDeVolPositionRendue_PeutLaPrendre', () => {
    startWith('noSteal')
    game.takePosition('alice', 1)
    game.takePosition('alice', 1)

    game.takePosition('bob', 1)

    expect(game.findPlayer('bob')?.position).toBe(1)
  })

  it('start_MalusPasDePreflop_CommenceAuFlop', () => {
    startWith('noPreflop')

    expect(game.phase).toBe('flop')
    expect(game.board).toHaveLength(3)
    playRound(1, 2)
    expect(game.findPlayer('alice')?.history[0].phase).toBe('flop')
  })

  it('step_NouvelleMancheEtChaqueTour_Change', () => {
    const steps = [game.step]
    game.start()
    steps.push(game.step)
    playRound(1, 2)
    steps.push(game.step)
    placeAll(1, 2)
    steps.push(game.step) // prendre une position ne change pas d'étape

    expect(new Set(steps).size).toBe(3)
    expect(steps[2]).toBe(steps[3])
  })

  it('isFlopCardHidden_MalusCarteCachee_CacheeAuFlopEtAuTurnPuisRetourneeALaRiver', () => {
    startWith('hiddenFlopCard')

    expect(game.isFlopCardHidden).toBe(false)
    playRound(1, 2)
    expect(game.isFlopCardHidden).toBe(true)
    playRound(1, 2)
    expect(game.isFlopCardHidden).toBe(true)
    playRound(1, 2)
    expect(game.phase).toBe('river')
    expect(game.isFlopCardHidden).toBe(false)
  })

  it('timeout_JoueursPasPlaces_PrennentLesPositionsRestantesEtLeTourPasse', () => {
    startWith('timer')
    game.takePosition('bob', 1)

    game.timeout()

    expect(game.phase).toBe('flop')
    expect(game.findPlayer('alice')?.history[0].position).toBe(2)
  })

  it('swapCard_BonusEchange_RemplaceLaCarteUneSeuleFois', () => {
    startWith('swap')

    game.swapCard('bob', 0)

    expect(game.findPlayer('bob')?.hole).toEqual(parseCards('9h 2s'))
    expect(() => game.swapCard('alice', 0)).toThrow(GameError)
  })

  it('swapCard_SansLeBonus_Refuse', () => {
    game.start()
    expect(() => game.swapCard('bob', 0)).toThrow(GameError)
  })

  it('revealCard_BonusRevelation_GardeLaCarteMontree', () => {
    startWith('reveal')

    game.revealCard('alice', 1)

    expect(game.bonusUsage.revealed).toEqual({ playerId: 'alice', card: parseCards('Ad')[0] })
    expect(() => game.revealCard('bob', 0)).toThrow(GameError)
  })

  it('useSpyglass_AuPreflop_PaireEnMain', () => {
    startWith('spyglass')

    game.useSpyglass('alice')

    expect(game.bonusUsage.spyglass).toEqual({ phase: 'preflop', category: HandCategory.Pair })
    expect(() => game.useSpyglass('bob')).toThrow(GameError)
  })

  it('useSpyglass_AuFlop_PlusHauteCombinaisonAvecLeTableau', () => {
    // Bob touche le brelan de 7 au flop, mieux que la paire d'as d'Alice
    game = new Game(() => parseCards('Ah Ad 7c 7s 7h Js 4c Kd 3h'), () => 0)
    game.join('alice', 'Alice')
    game.join('bob', 'Bob')
    startWith('spyglass')
    playRound(1, 2)

    game.useSpyglass('bob')

    expect(game.bonusUsage.spyglass).toEqual({ phase: 'flop', category: HandCategory.ThreeOfAKind })
  })

  it('useCheck_ClassementBon_DitQueCaPasse', () => {
    startWith('check')
    playRound(1, 2)
    placeAll(1, 2)

    game.useCheck('alice')

    expect(game.bonusUsage.check).toEqual({ phase: 'flop', success: true })
  })

  it('useCheck_PasToutLeMondePlace_Refuse', () => {
    startWith('check')
    playRound(1, 2)
    game.takePosition('alice', 1)

    expect(() => game.useCheck('alice')).toThrow(GameError)
  })

  it('useMountain_BonusMontagne_AnnonceLaPlusHauteCarteEnMain', () => {
    startWith('mountain')

    game.useMountain('bob')

    expect(game.bonusUsage.highestRank).toBe(14)
    expect(() => game.useMountain('alice')).toThrow(GameError)
  })

  it('useBilge_BonusFondDeCale_AnnonceLaPlusBasseCarteEnMain', () => {
    startWith('bilge')

    game.useBilge('bob')

    expect(game.bonusUsage.lowestRank).toBe(2)
    expect(() => game.useBilge('alice')).toThrow(GameError)
  })

  it('finishRound_SecondeChanceInversionVoisins_Gagne', () => {
    startWith('secondChance')
    for (let i = 0; i < 4; i++) {
      playRound(2, 1)
    }

    expect(game.result?.success).toBe(true)
    expect(game.result?.rescued).toBe(true)
  })

  it('finishRound_InversionSansSecondeChance_Perd', () => {
    game.start()
    for (let i = 0; i < 4; i++) {
      playRound(2, 1)
    }

    expect(game.result?.success).toBe(false)
  })
})
