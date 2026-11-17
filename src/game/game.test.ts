import { beforeEach, describe, expect, it } from 'vitest'
import { parseCards } from './cards.js'
import { Game, GameError } from './game.js'

// Paquet truqué : Alice reçoit AA, Bob 72, puis le tableau
const RIGGED_DECK = 'Ah Ad 7c 2s 9h Js 4c Kd 3h'

describe('Game', () => {
  let game: Game

  beforeEach(() => {
    game = new Game(() => parseCards(RIGGED_DECK))
    game.join('alice', 'Alice')
    game.join('bob', 'Bob')
  })

  const playRound = (alice: number, bob: number) => {
    game.takePosition('alice', alice)
    game.takePosition('bob', bob)
    game.advance()
  }

  it('start_DeuxJoueurs_DistribueDeuxCartesChacun', () => {
    game.start()

    expect(game.phase).toBe('preflop')
    expect(game.players.map(player => player.hole.length)).toEqual([2, 2])
    expect(game.board).toHaveLength(0)
  })

  it('start_UnSeulJoueur_Refuse', () => {
    game.leave('bob')
    expect(() => game.start()).toThrow(GameError)
  })

  it('join_PendantUneManche_Refuse', () => {
    game.start()
    expect(() => game.join('carol', 'Carol')).toThrow(GameError)
  })

  it('takePosition_PositionDejaPrise_LaVoleAuDetenteur', () => {
    game.start()
    game.takePosition('alice', 1)

    const robbed = game.takePosition('bob', 1)

    expect(robbed?.id).toBe('alice')
    expect(game.findPlayer('alice')?.position).toBeNull()
    expect(game.findPlayer('bob')?.position).toBe(1)
  })

  it('takePosition_SaProprePosition_LaRend', () => {
    game.start()
    game.takePosition('alice', 1)
    game.takePosition('alice', 1)

    expect(game.findPlayer('alice')?.position).toBeNull()
  })

  it('takePosition_HorsBornes_Refuse', () => {
    game.start()
    expect(() => game.takePosition('alice', 3)).toThrow(GameError)
  })

  it('advance_QuelquUnSansPosition_Refuse', () => {
    game.start()
    game.takePosition('alice', 1)
    expect(() => game.advance()).toThrow(GameError)
  })

  it('advance_ChaqueTour_RetourneLesCartesEtGardeLHistorique', () => {
    game.start()

    playRound(2, 1)
    expect(game.phase).toBe('flop')
    expect(game.board).toHaveLength(3)
    playRound(1, 2)
    expect(game.board).toHaveLength(4)
    playRound(1, 2)
    expect(game.phase).toBe('river')
    expect(game.board).toHaveLength(5)
    expect(game.findPlayer('alice')?.history.map(round => round.position)).toEqual([2, 1, 1])
  })

  it('toggleLock_PositionBloquee_PlusPersonneNePeutLaVoler', () => {
    game.start()
    game.takePosition('alice', 1)
    game.toggleLock('alice')

    expect(() => game.takePosition('bob', 1)).toThrow(GameError)
    expect(game.findPlayer('alice')?.position).toBe(1)
  })

  it('toggleLock_PositionBloquee_LeDetenteurNePeutPlusEnChanger', () => {
    game.start()
    game.takePosition('alice', 1)
    game.toggleLock('alice')

    expect(() => game.takePosition('alice', 2)).toThrow(GameError)
  })

  it('takePosition_SaPositionBloquee_LaDebloqueSansLaRendre', () => {
    game.start()
    game.takePosition('alice', 1)
    game.toggleLock('alice')

    game.takePosition('alice', 1)

    expect(game.findPlayer('alice')?.position).toBe(1)
    expect(game.findPlayer('alice')?.locked).toBe(false)
  })

  it('toggleLock_DeuxiemeClic_Debloque', () => {
    game.start()
    game.takePosition('alice', 1)
    game.toggleLock('alice')
    game.toggleLock('alice')

    game.takePosition('bob', 1)

    expect(game.findPlayer('bob')?.position).toBe(1)
  })

  it('toggleLock_SansPosition_Refuse', () => {
    game.start()
    expect(() => game.toggleLock('alice')).toThrow(GameError)
  })

  it('advance_PositionBloquee_GardeeDansLHistoriqueEtDebloqueeAuTourSuivant', () => {
    game.start()
    game.takePosition('alice', 1)
    game.toggleLock('alice')
    game.takePosition('bob', 2)

    game.advance()

    expect(game.findPlayer('alice')?.history).toEqual([{ position: 1, locked: true }])
    expect(game.findPlayer('bob')?.history).toEqual([{ position: 2, locked: false }])
    expect(game.findPlayer('alice')?.locked).toBe(false)
  })

  it('advance_DernierTourBienPlace_Gagne', () => {
    game.start()
    // les tours intermédiaires ne comptent pas, seul le dernier compte
    playRound(2, 1)
    playRound(2, 1)
    playRound(2, 1)
    playRound(1, 2)

    expect(game.phase).toBe('showdown')
    expect(game.result?.success).toBe(true)
    expect(game.wins).toBe(1)
  })

  it('advance_DernierTourMalPlace_Perd', () => {
    game.start()
    playRound(1, 2)
    playRound(1, 2)
    playRound(1, 2)
    playRound(2, 1)

    expect(game.result?.success).toBe(false)
    expect(game.losses).toBe(1)
  })

  it('start_ApresAbattage_NouvelleManche', () => {
    game.start()
    for (let i = 0; i < 4; i++) {
      playRound(1, 2)
    }

    game.start()

    expect(game.phase).toBe('preflop')
    expect(game.result).toBeNull()
    expect(game.findPlayer('alice')?.history).toEqual([])
  })
})
