import { type Card, createDeck, shuffle } from './cards.js'
import { type BonusId, DEAD_CARD_COUNT, type EffectId, nextEffects } from './effects.js'
import { type HandCategory, handCategory } from './handEvaluator.js'
import { evaluateShowdown, isSingleAdjacentSwap, type ShowdownResult } from './showdown.js'

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 10

export type Phase = 'lobby' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'
export type BettingPhase = 'preflop' | 'flop' | 'turn' | 'river'

const NEXT_PHASE: Partial<Record<Phase, Phase>> = { preflop: 'flop', flop: 'turn', turn: 'river', river: 'showdown' }
const BOARD_SIZE: Record<Phase, number> = { lobby: 0, preflop: 0, flop: 3, turn: 4, river: 5, showdown: 5 }

// Erreur "normale" de jeu. Sur un clic de bouton, seules celles marquées `shown` sont affichées au joueur :
// les autres viennent d'un clic qui n'a plus lieu d'être (deux joueurs en même temps, table pas encore à jour),
// et on ne fait juste rien.
export class GameError extends Error {
  constructor(message: string, readonly shown = false) {
    super(message)
  }
}

// Comme un jeton : face blanche (volable) ou retourné face noire (bloqué)
export interface RoundPosition {
  phase: BettingPhase
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

// Ce que les bonus ont donné pendant la manche (chacun ne sert qu'une fois)
export interface BonusUsage {
  swappedBy: string | null
  revealed: { playerId: string, card: Card } | null
  spyglass: { phase: BettingPhase, category: HandCategory } | null
  mastermind: { phase: BettingPhase, correctCount: number } | null
  highestRank: number | null
  lowestRank: number | null
  deadCards: Card[] | null
}

const NO_BONUS_USED: BonusUsage = { swappedBy: null, revealed: null, spyglass: null, mastermind: null, highestRank: null, lowestRank: null, deadCards: null }

export class Game {
  phase: Phase = 'lobby'
  players: Player[] = []
  board: Card[] = []
  result: ShowdownResult | null = null
  wins = 0
  losses = 0
  chaosMode = false
  effects: EffectId[] = [] // bonus / malus de la manche en cours
  bonusUsage: BonusUsage = { ...NO_BONUS_USED }
  step = 0 // change à chaque nouvelle manche et à chaque tour : un clic fait sur une étape passée est ignoré
  private lastSuccess: boolean | null = null
  private deck: Card[] = []

  constructor(
    private readonly newDeck: () => Card[] = () => shuffle(createDeck()),
    private readonly random: () => number = Math.random,
  ) {}

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

  get allLocked(): boolean {
    return this.players.every(player => player.locked)
  }

  hasEffect(id: EffectId): boolean {
    return this.effects.includes(id)
  }

  // Malus "Carte cachée" : la 1re carte du flop reste face cachée au flop et au turn, elle se retourne à la river
  get isFlopCardHidden(): boolean {
    return this.hasEffect('hiddenFlopCard') && (this.phase === 'flop' || this.phase === 'turn')
  }

  findPlayer(id: string): Player | undefined {
    return this.players.find(player => player.id === id)
  }

  requirePlayer(id: string): Player {
    const player = this.findPlayer(id)
    if (!player)
      throw new GameError('Tu ne joues pas à cette table.', true)
    return player
  }

  join(id: string, name: string): void {
    if (!this.isBetweenRounds)
      throw new GameError('Une manche est en cours, attends la fin pour rejoindre.')
    if (this.findPlayer(id))
      throw new GameError('Tu es déjà à la table.')
    if (this.players.length >= MAX_PLAYERS)
      throw new GameError(`La table est pleine (${MAX_PLAYERS} joueurs max).`, true)

    this.players.push({ id, name, hole: [], position: null, locked: false, history: [] })
  }

  leave(id: string): void {
    if (!this.isBetweenRounds)
      throw new GameError('Impossible de quitter en pleine manche, arrêtez la partie.')
    this.requirePlayer(id)

    this.players = this.players.filter(player => player.id !== id)
  }

  toggleChaos(): void {
    if (!this.isBetweenRounds)
      throw new GameError('Le mode chaos se change entre deux manches.')
    this.chaosMode = !this.chaosMode
  }

  start(): void {
    if (!this.isBetweenRounds)
      throw new GameError('Une manche est déjà en cours.')
    if (this.players.length < MIN_PLAYERS)
      throw new GameError(`Il faut au moins ${MIN_PLAYERS} joueurs.`)

    // bonus / malus selon la manche d'avant (aucun pour la toute première)
    if (this.lastSuccess !== null)
      this.effects = nextEffects(this.effects, this.lastSuccess, this.chaosMode, this.random)

    this.deck = this.newDeck()
    this.board = []
    this.result = null
    this.bonusUsage = { ...NO_BONUS_USED }
    for (const player of this.players) {
      player.hole = this.draw(2)
      player.position = null
      player.locked = false
      player.history = []
    }

    // malus "Pas de pré-flop" : on attaque directement au flop
    this.phase = this.hasEffect('noPreflop') ? 'flop' : 'preflop'
    this.board = this.draw(BOARD_SIZE[this.phase])
    this.step++
  }

  // Renvoie le joueur à qui on a piqué la position, s'il y en a un
  takePosition(playerId: string, position: number): Player | null {
    if (!this.isBetting)
      throw new GameError('Pas de position à prendre en ce moment.')
    if (!Number.isInteger(position) || position < 1 || position > this.players.length)
      throw new GameError('Position invalide.')
    const player = this.requirePlayer(playerId)
    if (player.locked)
      throw new GameError('Ta position est bloquée jusqu\'au tour suivant.')

    // re-cliquer sur sa propre position la rend
    if (player.position === position) {
      player.position = null
      return null
    }

    // sinon on la prend, quitte à la piquer à quelqu'un... sauf si elle est bloquée
    const holder = this.players.find(other => other.position === position) ?? null
    if (holder?.locked)
      throw new GameError(`La position ${position} est bloquée par ${holder.name}.`)
    if (holder && this.hasEffect('noSteal'))
      throw new GameError(`Malus « Pas de vol » : ${holder.name} doit d'abord rendre la position ${position}.`)

    // malus "Premier verrouillé" : le 1er jeton du tour est bloqué d'office (même avec "Pas de blocage").
    // Comme il ne peut plus bouger, personne n'est placé seulement avant ce 1er jeton.
    const isFirstOfRound = this.players.every(other => other.position === null)
    if (holder)
      holder.position = null
    player.position = position
    if (isFirstOfRound && this.hasEffect('firstLocked'))
      player.locked = true
    return holder
  }

  // Retourne son jeton : sa position est bloquée jusqu'au tour suivant, pas de retour en arrière
  lock(playerId: string): void {
    if (!this.isBetting)
      throw new GameError('Pas de position à bloquer en ce moment.')
    if (this.hasEffect('noLock'))
      throw new GameError('Malus « Pas de blocage » : impossible de bloquer cette manche.')
    const player = this.requirePlayer(playerId)
    if (player.position === null)
      throw new GameError('Prends d\'abord une position avant de la bloquer.', true)
    if (player.locked)
      throw new GameError('Ta position est déjà bloquée.')

    player.locked = true
  }

  advance(): void {
    const next = NEXT_PHASE[this.phase]
    if (!next)
      throw new GameError('Pas de tour à passer en ce moment.')
    if (!this.allPositioned)
      throw new GameError('Tout le monde doit avoir une position avant de passer au tour suivant.')

    const phase = this.phase as BettingPhase
    for (const player of this.players) {
      player.history.push({ phase, position: player.position!, locked: player.locked })
      player.position = null
      player.locked = false
    }
    this.phase = next
    this.step++
    this.board.push(...this.draw(BOARD_SIZE[next] - this.board.length))
    if (next === 'showdown')
      this.finishRound()
  }

  // Malus "Chrono" : temps écoulé, ceux qui ne sont pas placés prennent les positions restantes et on passe
  timeout(): void {
    if (!this.isBetting)
      return

    const taken = new Set(this.players.map(player => player.position))
    const free = this.players.map((_, i) => i + 1).filter(position => !taken.has(position))
    for (const player of this.players.filter(other => other.position === null)) {
      player.position = free.shift()!
    }
    this.advance()
  }

  // Bonus Échange / Révélation encore dispo ? (le premier qui clique le prend)
  requireCardBonus(kind: 'swap' | 'reveal'): void {
    this.requireBonus(kind)
    if (kind === 'swap' ? this.bonusUsage.swappedBy : this.bonusUsage.revealed)
      throw new GameError(kind === 'swap' ? 'L\'échange a déjà été utilisé cette manche.' : 'La révélation a déjà été utilisée cette manche.')
  }

  // Bonus "Échange" : remplace une de ses cartes par une neuve du paquet
  swapCard(playerId: string, cardIndex: number): void {
    this.requireCardBonus('swap')
    const player = this.requirePlayer(playerId)
    this.requireCardIndex(cardIndex)

    player.hole[cardIndex] = this.draw(1)[0]
    this.bonusUsage.swappedBy = player.id
  }

  // Bonus "Révélation" : montre une de ses cartes à toute la table
  revealCard(playerId: string, cardIndex: number): void {
    this.requireCardBonus('reveal')
    const player = this.requirePlayer(playerId)
    this.requireCardIndex(cardIndex)

    this.bonusUsage.revealed = { playerId: player.id, card: player.hole[cardIndex] }
  }

  // Bonus "Longue-vue" : la plus haute combinaison parmi toutes les mains, avec le tableau du moment
  useSpyglass(playerId: string): void {
    this.requireBonus('spyglass')
    this.requirePlayer(playerId)
    if (this.bonusUsage.spyglass)
      throw new GameError('La longue-vue a déjà été utilisée cette manche.')

    const best = Math.max(...this.hands.map(hole => handCategory([...hole, ...this.board])))
    this.bonusUsage.spyglass = { phase: this.phase as BettingPhase, category: best }
  }

  // Bonus "Mastermind" : combien de joueurs sont bien placés avec le tableau du moment, sans dire lesquels
  useMastermind(playerId: string): void {
    this.requireBonus('mastermind')
    this.requirePlayer(playerId)
    if (this.bonusUsage.mastermind)
      throw new GameError('Le mastermind a déjà été utilisé cette manche.')
    this.requireFlop('Le mastermind')
    if (!this.allPositioned)
      throw new GameError('Tout le monde doit avoir une position pour utiliser le mastermind.')

    const correctCount = this.currentShowdown().entries.filter(entry => entry.correct).length
    this.bonusUsage.mastermind = { phase: this.phase as BettingPhase, correctCount }
  }

  // Bonus "Montagne" : la plus haute carte en main, sans dire qui l'a
  useMountain(playerId: string): void {
    this.requireBonus('mountain')
    this.requirePlayer(playerId)
    if (this.bonusUsage.highestRank)
      throw new GameError('La montagne a déjà été utilisée cette manche.')

    this.bonusUsage.highestRank = Math.max(...this.holeCards.map(card => card.rank))
  }

  // Bonus "Fond de cale" : la plus basse carte en main, sans dire qui l'a
  useBilge(playerId: string): void {
    this.requireBonus('bilge')
    this.requirePlayer(playerId)
    if (this.bonusUsage.lowestRank)
      throw new GameError('Le fond de cale a déjà été utilisé cette manche.')

    this.bonusUsage.lowestRank = Math.min(...this.holeCards.map(card => card.rank))
  }

  // Bonus "Cartes mortes" : des cartes brûlées et montrées, qui ne sortiront plus
  useDeadCards(playerId: string): void {
    this.requireBonus('deadCards')
    this.requirePlayer(playerId)
    if (this.bonusUsage.deadCards)
      throw new GameError('Les cartes mortes ont déjà été brûlées cette manche.')

    this.bonusUsage.deadCards = this.draw(DEAD_CARD_COUNT)
  }

  // Classement avec le tableau du moment et les positions du tour en cours (0 pour qui n'est pas placé)
  private currentShowdown(): ShowdownResult {
    const current = this.players.map(player => ({ ...player, position: player.position ?? 0 }))
    return evaluateShowdown(current, this.board)
  }

  // Les mains de la table
  private get hands(): Card[][] {
    return this.players.map(player => player.hole)
  }

  private get holeCards(): Card[] {
    return this.hands.flat()
  }

  private finishRound(): void {
    // seules les positions du dernier tour comptent
    const finalPositions = this.players.map(player => ({ ...player, position: player.history.at(-1)!.position }))
    this.result = evaluateShowdown(finalPositions, this.board)

    // bonus "Seconde chance" : une seule inversion entre voisins est pardonnée
    if (!this.result.success && this.hasEffect('secondChance') && isSingleAdjacentSwap(this.result.entries))
      this.result = { ...this.result, success: true, rescued: true }

    this.lastSuccess = this.result.success
    if (this.result.success)
      this.wins++
    else
      this.losses++
  }

  private requireBonus(id: BonusId): void {
    if (!this.isBetting)
      throw new GameError('Pas de bonus à utiliser en ce moment.')
    if (!this.hasEffect(id))
      throw new GameError('Ce bonus n\'est pas actif cette manche.')
  }

  private requireFlop(bonusName: string): void {
    if (this.board.length < 3)
      throw new GameError(`${bonusName} est dispo à partir du flop.`)
  }

  private requireCardIndex(cardIndex: number): void {
    if (cardIndex !== 0 && cardIndex !== 1)
      throw new GameError('Carte invalide.')
  }

  private draw(count: number): Card[] {
    if (this.deck.length < count)
      throw new Error('Plus assez de cartes dans le paquet')
    return this.deck.splice(0, count)
  }
}
