import { type Card, createDeck, shuffle } from './cards.js'
import { evaluateShowdown, type ShowdownResult } from './showdown.js'

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 10

export type Phase = 'lobby' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'

const NEXT_PHASE: Partial<Record<Phase, Phase>> = { preflop: 'flop', flop: 'turn', turn: 'river', river: 'showdown' }
const BOARD_SIZE: Record<Phase, number> = { lobby: 0, preflop: 0, flop: 3, turn: 4, river: 5, showdown: 5 }

// Erreur "normale" de jeu, affichée telle quelle au joueur
export class GameError extends Error {}

// Comme un jeton : face blanche (volable) ou retourné face noire (bloqué)
export interface RoundPosition {
  position: number
  locked: boolean
}

export interface Player {
  id: string
  name: string
  hole: Card[]
  position: number | null // position du tour en cours
  locked: boolean // position du tour en cours bloquée, plus personne ne peut la voler
  history: RoundPosition[] // positions des tours précédents
}

export class Game {
  phase: Phase = 'lobby'
  players: Player[] = []
  board: Card[] = []
  result: ShowdownResult | null = null
  wins = 0
  losses = 0
  private deck: Card[] = []

  constructor(private readonly newDeck: () => Card[] = () => shuffle(createDeck())) {}

  get isBetting(): boolean {
    return NEXT_PHASE[this.phase] !== undefined
  }

  // entre deux manches on peut rejoindre / quitter la table
  get isBetweenRounds(): boolean {
    return this.phase === 'lobby' || this.phase === 'showdown'
  }

  get allPositioned(): boolean {
    return this.players.every(player => player.position !== null)
  }

  findPlayer(id: string): Player | undefined {
    return this.players.find(player => player.id === id)
  }

  requirePlayer(id: string): Player {
    const player = this.findPlayer(id)
    if (!player)
      throw new GameError('Tu ne joues pas à cette table.')
    return player
  }

  join(id: string, name: string): void {
    if (!this.isBetweenRounds)
      throw new GameError('Une manche est en cours, attends la fin pour rejoindre.')
    if (this.findPlayer(id))
      throw new GameError('Tu es déjà à la table.')
    if (this.players.length >= MAX_PLAYERS)
      throw new GameError(`La table est pleine (${MAX_PLAYERS} joueurs max).`)

    this.players.push({ id, name, hole: [], position: null, locked: false, history: [] })
  }

  leave(id: string): void {
    if (!this.isBetweenRounds)
      throw new GameError('Impossible de quitter en pleine manche, arrêtez la partie.')
    this.requirePlayer(id)

    this.players = this.players.filter(player => player.id !== id)
  }

  start(): void {
    if (!this.isBetweenRounds)
      throw new GameError('Une manche est déjà en cours.')
    if (this.players.length < MIN_PLAYERS)
      throw new GameError(`Il faut au moins ${MIN_PLAYERS} joueurs.`)

    this.deck = this.newDeck()
    this.board = []
    this.result = null
    for (const player of this.players) {
      player.hole = this.draw(2)
      player.position = null
      player.locked = false
      player.history = []
    }
    this.phase = 'preflop'
  }

  // Renvoie le joueur à qui on a piqué la position, s'il y en a un
  takePosition(playerId: string, position: number): Player | null {
    if (!this.isBetting)
      throw new GameError('Pas de position à prendre en ce moment.')
    if (!Number.isInteger(position) || position < 1 || position > this.players.length)
      throw new GameError('Position invalide.')
    const player = this.requirePlayer(playerId)

    // re-cliquer sur sa position bloquée la débloque (sans la rendre)
    if (player.locked && player.position === position) {
      player.locked = false
      return null
    }
    if (player.locked)
      throw new GameError('Ta position est bloquée, clique dessus pour la débloquer d\'abord.')

    // re-cliquer sur sa propre position la rend
    if (player.position === position) {
      player.position = null
      return null
    }

    // sinon on la prend, quitte à la piquer à quelqu'un... sauf si elle est bloquée
    const holder = this.players.find(other => other.position === position) ?? null
    if (holder?.locked)
      throw new GameError(`La position ${position} est bloquée par ${holder.name}.`)
    if (holder)
      holder.position = null
    player.position = position
    return holder
  }

  // Retourne son jeton : bloque sa position (ou la débloque si elle l'était déjà)
  toggleLock(playerId: string): void {
    if (!this.isBetting)
      throw new GameError('Pas de position à bloquer en ce moment.')
    const player = this.requirePlayer(playerId)
    if (player.position === null)
      throw new GameError('Prends d\'abord une position avant de la bloquer.')

    player.locked = !player.locked
  }

  advance(): void {
    const next = NEXT_PHASE[this.phase]
    if (!next)
      throw new GameError('Pas de tour à passer en ce moment.')
    if (!this.allPositioned)
      throw new GameError('Tout le monde doit avoir une position avant de passer au tour suivant.')

    for (const player of this.players) {
      player.history.push({ position: player.position!, locked: player.locked })
      player.position = null
      player.locked = false
    }
    this.phase = next
    this.board.push(...this.draw(BOARD_SIZE[next] - this.board.length))
    if (next === 'showdown')
      this.finishRound()
  }

  private finishRound(): void {
    // seules les positions du dernier tour comptent
    const finalPositions = this.players.map(player => ({ ...player, position: player.history.at(-1)!.position }))
    this.result = evaluateShowdown(finalPositions, this.board)
    if (this.result.success)
      this.wins++
    else
      this.losses++
  }

  private draw(count: number): Card[] {
    if (this.deck.length < count)
      throw new Error('Plus assez de cartes dans le paquet')
    return this.deck.splice(0, count)
  }
}
