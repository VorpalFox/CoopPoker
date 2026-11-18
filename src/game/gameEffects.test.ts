import { beforeEach, describe, expect, it } from 'vitest'
import { parseCards } from './cards.js'
import { type EffectId } from './effects.js'
import { Game, GameError, GHOST_ID } from './game.js'
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

  it('takePosition_MalusPremierVerrouille_LePremierEstBloqueJusquAuTourSuivant', () => {
    startWith('firstLocked', 'noLock')
    game.takePosition('alice', 1)
    game.takePosition('bob', 2)

    expect(game.findPlayer('alice')?.locked).toBe(true)
    expect(game.findPlayer('bob')?.locked).toBe(false)
    expect(() => game.takePosition('bob', 1)).toThrow(GameError)
    expect(() => game.takePosition('alice', 1)).toThrow(GameError)

    game.advance()
    game.takePosition('bob', 1)

    expect(game.findPlayer('bob')?.locked).toBe(true)
    expect(game.findPlayer('alice')?.locked).toBe(false)
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

  it('advance_MalusPasDeTurn_PasseDuFlopALaRiver', () => {
    startWith('noTurn')
    playRound(1, 2)

    playRound(1, 2)

    expect(game.phase).toBe('river')
    expect(game.board).toHaveLength(5)
    playRound(1, 2)
    expect(game.phase).toBe('showdown')
    expect(game.findPlayer('alice')?.history.map(round => round.phase)).toEqual(['preflop', 'flop', 'river'])
  })

  it('advance_MalusPasDeTurnEtPasDePreflop_SeulementFlopEtRiver', () => {
    startWith('noPreflop', 'noTurn')

    playRound(1, 2)
    playRound(1, 2)

    expect(game.phase).toBe('showdown')
    expect(game.findPlayer('alice')?.history.map(round => round.phase)).toEqual(['flop', 'river'])
    expect(game.result?.success).toBe(true)
  })

  it('advance_MalusRiviereAgitee_RemplaceUneCarteALaRiver', () => {
    startWith('roughRiver')
    playRound(1, 2)
    playRound(1, 2)
    expect(game.riverSwap).toBeNull()

    playRound(1, 2)

    // hasard figé à 0 : c'est la 1re carte qui part, remplacée par la carte d'après la river
    expect(game.board).toEqual(parseCards('Qs Js 4c Kd 3h'))
    expect(game.riverSwap).toEqual({ index: 0, old: parseCards('9h')[0], replacement: parseCards('Qs')[0] })
  })

  // Fantôme 9h Js, tableau 4c Kd 3h Qs Qd : Alice double paire, Fantôme paire de Q hauteur J, Bob paire de Q hauteur 7
  it('finishRound_MalusFantomeTrouALaBonnePlace_Gagne', () => {
    startWith('ghost')
    expect(game.ghostHole).toEqual(parseCards('9h Js'))
    expect(game.positionCount).toBe(3)

    for (let i = 0; i < 4; i++) {
      playRound(1, 3)
    }

    expect(game.result?.success).toBe(true)
    expect(game.result?.entries.map(entry => [entry.id, entry.position])).toEqual([['alice', 1], [GHOST_ID, 2], ['bob', 3]])
  })

  it('finishRound_MalusFantomeTrouMalPlace_Perd', () => {
    startWith('ghost')

    for (let i = 0; i < 4; i++) {
      playRound(1, 2)
    }

    expect(game.result?.success).toBe(false)
    expect(game.result?.entries.find(entry => entry.id === GHOST_ID)).toMatchObject({ position: 3, bestRank: 2, correct: false })
  })

  it('timeout_MalusFantome_LaissePositionVidePourLeFantome', () => {
    startWith('ghost', 'timer')
    game.takePosition('bob', 3)

    game.timeout()

    expect(game.findPlayer('alice')?.history[0].position).toBe(1)
  })

  it('spyTargets_MalusFantome_OnPeutEspionnerLeFantome', () => {
    startWith('ghost', 'spy')

    expect(game.spyTargets('bob').map(seat => seat.id)).toEqual(['alice', GHOST_ID])
    game.useSpy('bob', GHOST_ID)

    expect(game.bonusUsage.spied?.card).toEqual(parseCards('9h')[0])
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

  it('useMastermind_ClassementBon_ToutLeMondeBienPlace', () => {
    startWith('mastermind')
    playRound(1, 2)
    placeAll(1, 2)

    game.useMastermind('alice')

    expect(game.bonusUsage.mastermind).toEqual({ phase: 'flop', correctCount: 2 })
    expect(() => game.useMastermind('bob')).toThrow(GameError)
  })

  it('useMastermind_ClassementInverse_PersonneBienPlace', () => {
    startWith('mastermind')
    playRound(1, 2)
    placeAll(2, 1)

    game.useMastermind('alice')

    expect(game.bonusUsage.mastermind?.correctCount).toBe(0)
  })

  it('useMastermind_AvantLeFlop_Refuse', () => {
    startWith('mastermind')
    placeAll(1, 2)

    expect(() => game.useMastermind('alice')).toThrow(GameError)
  })

  it('useMastermind_PasToutLeMondePlace_Refuse', () => {
    startWith('mastermind')
    playRound(1, 2)
    game.takePosition('alice', 1)

    expect(() => game.useMastermind('alice')).toThrow(GameError)
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

  it('useDeadCards_BonusCartesMortes_BruleQuatreCartesQuiNeSortentPlus', () => {
    startWith('deadCards')

    game.useDeadCards('alice')
    playRound(1, 2)

    expect(game.bonusUsage.deadCards).toEqual(parseCards('9h Js 4c Kd'))
    expect(game.board).toEqual(parseCards('3h Qs Qd'))
    expect(() => game.useDeadCards('bob')).toThrow(GameError)
  })

  it('useCompass_JoueurBienPlace_LeDit', () => {
    startWith('compass')
    playRound(1, 2)
    game.takePosition('bob', 2)

    game.useCompass('alice', 'bob')

    expect(game.bonusUsage.compass).toEqual({ phase: 'flop', playerId: 'bob', position: 2, correct: true })
    expect(() => game.useCompass('alice', 'bob')).toThrow(GameError)
  })

  it('useCompass_JoueurMalPlace_LeDit', () => {
    startWith('compass')
    playRound(1, 2)
    game.takePosition('bob', 1)

    game.useCompass('bob', 'bob')

    expect(game.bonusUsage.compass?.correct).toBe(false)
  })

  it('useCompass_JoueurPasPlace_Refuse', () => {
    startWith('compass')
    playRound(1, 2)
    game.takePosition('bob', 1)

    expect(game.compassTargets().map(player => player.id)).toEqual(['bob'])
    expect(() => game.useCompass('bob', 'alice')).toThrow(GameError)
  })

  it('compassTargets_AvantLeFlop_Refuse', () => {
    startWith('compass')
    placeAll(1, 2)

    expect(() => game.compassTargets()).toThrow(GameError)
  })

  it('useSpy_BonusEspion_MontreUneCarteDuJoueurChoisi', () => {
    startWith('spy')

    expect(game.spyTargets('alice').map(player => player.id)).toEqual(['bob'])
    game.useSpy('alice', 'bob')

    // hasard figé à 0 : la 1re carte de Bob
    expect(game.bonusUsage.spied).toEqual({ byId: 'alice', targetId: 'bob', card: parseCards('7c')[0] })
    expect(() => game.useSpy('bob', 'alice')).toThrow(GameError)
  })

  it('useSpy_SoiMeme_Refuse', () => {
    startWith('spy')
    expect(() => game.useSpy('alice', 'alice')).toThrow(GameError)
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
