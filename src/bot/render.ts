import { ActionRowBuilder, type BaseMessageOptions, ButtonBuilder, ButtonStyle, EmbedBuilder, escapeMarkdown } from 'discord.js'
import { type Card, formatCard, formatCards, isRed, rankLabel, rankName, suitText } from '../game/cards.js'
import { EFFECTS, type EffectId, type EffectKind } from '../game/effects.js'
import { type Game, MAX_PLAYERS, MIN_PLAYERS, type Phase, type Player } from '../game/game.js'
import { HAND_NAMES } from '../game/handEvaluator.js'
import { type ShowdownEntry } from '../game/showdown.js'

export const BUTTON_PREFIX = 'cp'
export const STEP_SEPARATOR = '#'
export const BUTTON_IDS = {
  join: `${BUTTON_PREFIX}:join`,
  leave: `${BUTTON_PREFIX}:leave`,
  start: `${BUTTON_PREFIX}:start`,
  chaos: `${BUTTON_PREFIX}:chaos`,
  cards: `${BUTTON_PREFIX}:cards`,
  lock: `${BUTTON_PREFIX}:lock`,
  next: `${BUTTON_PREFIX}:next`,
  replay: `${BUTTON_PREFIX}:replay`,
  help: `${BUTTON_PREFIX}:help`,
  swap: `${BUTTON_PREFIX}:swap`,
  reveal: `${BUTTON_PREFIX}:reveal`,
  spyglass: `${BUTTON_PREFIX}:spyglass`,
  mastermind: `${BUTTON_PREFIX}:mastermind`,
  compass: `${BUTTON_PREFIX}:compass`,
  spy: `${BUTTON_PREFIX}:spy`,
  mountain: `${BUTTON_PREFIX}:mountain`,
  bilge: `${BUTTON_PREFIX}:bilge`,
  deadCards: `${BUTTON_PREFIX}:deadCards`,
}
export const POSITION_BUTTON_ID = (position: number) => `${BUTTON_PREFIX}:pos:${position}`
// Choix de la carte à échanger / montrer (cp:swap:0, cp:reveal:1...)
export const CARD_CHOICE_ID = (kind: CardChoiceKind, cardIndex: number) => `${BUTTON_PREFIX}:${kind}:${cardIndex}`
// Choix du joueur visé (cp:compass:<id du joueur>)
export const PLAYER_CHOICE_ID = (kind: PlayerChoiceKind, playerId: string) => `${BUTTON_PREFIX}:${kind}:${playerId}`

export type CardChoiceKind = 'swap' | 'reveal'
export type PlayerChoiceKind = 'compass' | 'spy'

const PLAYER_CHOICE_QUESTIONS: Record<PlayerChoiceKind, string> = {
  compass: '🧭 Quel joueur veux-tu vérifier ?',
  spy: '🕵️ Quel joueur veux-tu espionner ?',
}

const PHASE_LABELS: Record<Phase, string> = {
  lobby: 'Salle d\'attente',
  preflop: 'Pré-flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Abattage',
}

const HISTORY_NAME_WIDTH = 12
const HISTORY_CELL_WIDTH = 8 // largeur de 'Pré-flop', le plus long libellé

const RULES = [
  '• Chacun reçoit 2 cartes (bouton 🂠 Mes cartes), puis 4 tours : pré-flop, flop, turn, river.',
  '• À chaque tour, prenez une position : **1 = meilleure main**.',
  '• On peut voler une position, sauf si elle est bloquée (jusqu\'au tour suivant).',
  '• Après la river, **tout le monde gagne si le classement est parfait**.',
].join('\n')

const HAND_RANKING = [
  '**Quinte flush** · 5 cartes qui se suivent, même couleur `9♥ 10♥ J♥ Q♥ K♥`',
  '**Carré** · 4 cartes de même valeur `7♠ 7♥ 7♦ 7♣`',
  '**Full** · un brelan + une paire `Q♠ Q♥ Q♦ 4♣ 4♥`',
  '**Couleur** · 5 cartes de même couleur `2♦ 6♦ 9♦ J♦ K♦`',
  '**Quinte** · 5 cartes qui se suivent `5♣ 6♥ 7♠ 8♦ 9♣`',
  '**Brelan** · 3 cartes de même valeur `8♠ 8♥ 8♦`',
  '**Double paire** · `J♠ J♦ 3♣ 3♥`',
  '**Paire** · `A♥ A♣`',
  '**Carte haute** · rien de tout ça',
  '',
  'À combinaison égale, la plus haute carte départage, puis la suivante…',
  'L\'as compte aussi pour 1 dans la quinte.',
].join('\n').replace(/[♠♥♦♣]/g, suit => `${suit}️`) // couleurs émoji, comme les vraies cartes

const COLORS = { lobby: 0x5865f2, betting: 0x2b8a3e, info: 0x868e96, win: 0xf59f00, loss: 0xe03131 }
const BUTTONS_PER_ROW = 5
const MAX_ROWS = 5 // limite de Discord par message
const BOARD_SLOTS = 5
const CARD_WIDTH = 4 // intérieur d'une carte, assez pour " 10 "
const ANSI_RED = '\u001b[31m'
const ANSI_RESET = '\u001b[0m'

interface TableOptions {
  withButtons?: boolean
  deadline?: number | null // fin du tour en ms (malus Chrono)
}

export function renderTable(game: Game, { withButtons = true, deadline = null }: TableOptions = {}): BaseMessageOptions {
  return {
    embeds: [tableEmbed(game, withButtons, deadline)],
    components: withButtons ? stamped(tableButtons(game), game.step) : [],
  }
}

// Ajoute l'étape de la partie aux boutons de la table (cp:next#12) : un clic fait sur une étape passée,
// typiquement un 2e "Tour suivant" en même temps, sera ignoré. "Mes cartes" marche à tout moment.
function stamped(rows: ActionRowBuilder<ButtonBuilder>[], step: number): ActionRowBuilder<ButtonBuilder>[] {
  for (const component of rows.flatMap(r => r.components)) {
    const id = 'custom_id' in component.data ? component.data.custom_id : undefined
    if (id && id !== BUTTON_IDS.cards)
      component.setCustomId(`${id}${STEP_SEPARATOR}${step}`)
  }
  return rows
}

// Message du haut : les infos fixes de la manche (règles, n° de manche, score, bonus / malus)
export function renderInfo(game: Game): BaseMessageOptions {
  const chaos = game.chaosMode ? ' · 🌀 Chaos' : ''
  const embed = rulesEmbed(COLORS.info).setTitle(`🃏 Poker coopératif · Manche ${handNumber(game)}${chaos}`)
  addEffects(embed, game.effects, 'malus', '😈 Malus')
  addEffects(embed, game.effects, 'bonus', '😇 Bonus')
  if (game.wins + game.losses > 0)
    embed.addFields({ name: 'Score', value: `${game.wins} 🎉 / ${game.losses} 💥` })
  return { embeds: [embed], components: [row(helpButton())] }
}

// Réponse privée du bouton "Détails des combinaisons"
export function renderHandRanking(): BaseMessageOptions {
  return { content: `## 🏆 Combinaisons, de la plus forte à la plus faible\n${HAND_RANKING}` }
}

// Cartes d'un joueur, en message caché (bouton "Mes cartes")
export function renderHoleCards(player: Player): BaseMessageOptions {
  return { content: `Tes cartes :\n${asciiCards(player.hole)}`, components: [] }
}

// Réponse privée des bonus Échange / Révélation : on choisit la carte
export function renderCardChoice(player: Player, kind: CardChoiceKind): BaseMessageOptions {
  const question = kind === 'swap' ? '🔄 Quelle carte veux-tu échanger ?' : '👁️ Quelle carte veux-tu montrer à la table ?'
  const buttons = player.hole.map((card, i) => button(CARD_CHOICE_ID(kind, i), formatCard(card), ButtonStyle.Primary))
  return { content: question, components: [row(...buttons)] }
}

// Réponse privée des bonus Boussole / Espion : on choisit le joueur
export function renderPlayerChoice(kind: PlayerChoiceKind, targets: { id: string, name: string }[]): BaseMessageOptions {
  const buttons = targets.map(target => button(PLAYER_CHOICE_ID(kind, target.id), truncate(target.name, 40), ButtonStyle.Primary))
  return { content: PLAYER_CHOICE_QUESTIONS[kind], components: rows(buttons) }
}

// Numéro de la manche en cours (ou qui vient de se finir à l'abattage)
export function handNumber(game: Game): number {
  return game.wins + game.losses + (game.phase === 'showdown' ? 0 : 1)
}

function tableEmbed(game: Game, withFooter: boolean, deadline: number | null): EmbedBuilder {
  switch (game.phase) {
    case 'lobby':
      return lobbyEmbed(game)
    case 'showdown':
      return showdownEmbed(game)
    default:
      return bettingEmbed(game, withFooter, deadline)
  }
}

function rulesEmbed(color: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle('🃏 Poker coopératif')
    .setDescription(RULES)
}

function lobbyEmbed(game: Game): EmbedBuilder {
  const players = game.players.map(player => `• ${playerName(player)}`).join('\n')
  return rulesEmbed(COLORS.lobby)
    .addFields({ name: `Joueurs (${game.players.length}/${MAX_PLAYERS})`, value: players || '_Personne pour l\'instant_' })
}

// Les positions en cours sont sur les boutons, la table montre le tableau, l'historique et les bonus utilisés
function bettingEmbed(game: Game, withFooter: boolean, deadline: number | null): EmbedBuilder {
  // <t:...:R> : Discord affiche un compte à rebours ("dans 40 secondes") qui se met à jour tout seul
  const timer = deadline ? `\n⏱️ Fin du tour <t:${Math.ceil(deadline / 1000)}:R>` : ''
  const embed = new EmbedBuilder()
    .setColor(COLORS.betting)
    .setTitle(`🃏 ${PHASE_LABELS[game.phase]}`)
    .setDescription(`${boardText(game)}${riverSwapText(game)}${timer}`)
  if (!game.hasEffect('hiddenHistory'))
    addHistory(embed, game)
  addBonusUsage(embed, game)

  if (!withFooter)
    return embed
  return embed.setFooter({
    text: game.allPositioned
      ? 'Tout le monde est placé'
      : 'Prenez une position',
  })
}

function showdownEmbed(game: Game): EmbedBuilder {
  const result = game.result!
  const title = result.rescued
    ? '🍀 Une inversion pardonnée, manche gagnée !'
    : result.success ? '🎉 Classement parfait, manche gagnée !' : '💥 Classement raté, manche perdue...'
  const embed = new EmbedBuilder()
    .setColor(result.success ? COLORS.win : COLORS.loss)
    .setTitle(title)
    .setDescription(`${boardText(game)}${riverSwapText(game)}`)
    .addFields({ name: 'Résultat', value: result.entries.map(showdownLine).join('\n') })
  addHistory(embed, game)
  addBonusUsage(embed, game)
  return embed
}

function addEffects(embed: EmbedBuilder, effects: EffectId[], kind: EffectKind, title: string): void {
  const lines = effects
    .filter(id => EFFECTS[id].kind === kind)
    .map(id => `${EFFECTS[id].emoji} **${EFFECTS[id].name}** : ${EFFECTS[id].description}`)
  if (lines.length > 0)
    embed.addFields({ name: title, value: lines.join('\n') })
}

// Tableau en bloc de code : une ligne par joueur, une colonne par tour joué
function addHistory(embed: EmbedBuilder, game: Game): void {
  const rounds = game.players[0]?.history.map(entry => PHASE_LABELS[entry.phase]) ?? []
  if (rounds.length === 0)
    return

  // pas de ` dans un bloc de code, ça le casserait
  const names = game.players.map(player => truncate(player.name.replaceAll('`', ''), HISTORY_NAME_WIDTH))
  const nameWidth = Math.max(...names.map(name => name.length))

  const header = [''.padEnd(nameWidth), ...rounds.map(label => label.padEnd(HISTORY_CELL_WIDTH))].join(' ')
  const rows = game.players.map((player, i) => [
    names[i].padEnd(nameWidth),
    // ● libre, ○ bloquée (le plein ressort mieux sur fond sombre). Pas ⚪ ⚫ : les émojis font ~2 caractères de large et décaleraient les colonnes
    ...player.history.map(({ position, locked }) => `${locked ? '○' : '●'}${position}`.padEnd(HISTORY_CELL_WIDTH)),
  ].join(' '))
  const table = ['```', header.trimEnd(), ...rows.map(row => row.trimEnd()), '```'].join('\n')
  embed.addFields({ name: '📜 Historique de la manche (● libre · ○ bloquée)', value: table })
}

function addBonusUsage(embed: EmbedBuilder, game: Game): void {
  const { swappedBy, revealed, spyglass, mastermind, highestRank, lowestRank, deadCards, compass, spied } = game.bonusUsage
  const nameOf = (playerId: string) => escapeMarkdown(game.findPlayer(playerId)?.name ?? '?')

  const lines: string[] = []
  if (swappedBy)
    lines.push(`🔄 ${nameOf(swappedBy)} a échangé une carte`)
  if (revealed)
    lines.push(`👁️ ${nameOf(revealed.playerId)} montre **${formatCard(revealed.card)}**`)
  if (spyglass)
    lines.push(`🔭 Au ${PHASE_LABELS[spyglass.phase].toLowerCase()}, la plus haute combinaison est : **${HAND_NAMES[spyglass.category]}**`)
  if (mastermind)
    lines.push(`🎯 Au ${PHASE_LABELS[mastermind.phase].toLowerCase()}, **${mastermind.correctCount}** joueur${mastermind.correctCount > 1 ? 's' : ''} sur ${game.players.length} bien placé${mastermind.correctCount > 1 ? 's' : ''}`)
  if (highestRank)
    lines.push(`⛰️ La plus haute carte en main : **${rankName(highestRank)}**`)
  if (lowestRank)
    lines.push(`⚓ La plus basse carte en main : **${rankName(lowestRank)}**`)
  if (deadCards)
    lines.push(`☠️ Cartes mortes : **${formatCards(deadCards)}**`)
  if (compass)
    lines.push(`🧭 Au ${PHASE_LABELS[compass.phase].toLowerCase()} : ${compass.correct ? '✅' : '❌'} ${nameOf(compass.playerId)} (position ${compass.position}) est **${compass.correct ? 'bien' : 'mal'} placé**`)
  if (spied)
    lines.push(`🕵️ ${nameOf(spied.byId)} espionne ${nameOf(spied.targetId)} : **${formatCard(spied.card)}**`)
  if (lines.length > 0)
    embed.addFields({ name: '😇 Bonus utilisés', value: lines.join('\n') })
}

function showdownLine(entry: ShowdownEntry): string {
  const trueRank = entry.bestRank === entry.worstRank ? `${entry.bestRank}` : `${entry.bestRank} à ${entry.worstRank}`
  const correction = entry.correct ? '' : ` → vraie place : **${trueRank}**`
  return `${entry.correct ? '✅' : '❌'} **${entry.position}** · ${escapeMarkdown(entry.name)} : \`${formatCards(entry.hole)}\` ${HAND_NAMES[entry.hand.category]}${correction}`
}

function boardText(game: Game): string {
  if (game.board.length === 0)
    return '_Pas encore de cartes au tableau_'
  // les 5 emplacements, ceux du turn et de la river vides tant qu'ils ne sont pas tirés
  const slots: BoardSlot[] = [...game.board]
  if (game.isFlopCardHidden)
    slots[0] = 'hidden'
  while (slots.length < BOARD_SLOTS)
    slots.push('empty')
  return asciiCards(slots)
}

// Malus "Rivière agitée" : la carte emportée, annoncée sous le tableau
function riverSwapText(game: Game): string {
  if (!game.riverSwap)
    return ''
  const { index, old, replacement } = game.riverSwap
  const hidden = index === 0 && game.hasEffect('hiddenFlopCard') ? ' (la carte cachée)' : ''
  return `\n🌊 La rivière a emporté **${formatCard(old)}**${hidden}, remplacée par **${formatCard(replacement)}**`
}

// Cartes dessinées côte à côte :
// ┌────┐┌────┐
// │ 10 ││░░░░│   valeur au-dessus de la couleur, dos de carte pour la carte cachée
// │ ♥  ││░░░░│
// └────┘└────┘
function asciiCards(slots: BoardSlot[]): string {
  const lines = [
    slots.map(() => `┌${'─'.repeat(CARD_WIDTH)}┐`),
    slots.map(slot => cardFace(slot, 'rank')),
    slots.map(slot => cardFace(slot, 'suit')),
    slots.map(() => `└${'─'.repeat(CARD_WIDTH)}┘`),
  ].map(parts => parts.join(' '))
  // bloc "ansi" : Discord y colore le texte, d'où ♥ ♦ en rouge
  return ['```ansi', ...lines, '```'].join('\n')
}

type BoardSlot = Card | 'hidden' | 'empty'

function cardFace(slot: BoardSlot, line: 'rank' | 'suit'): string {
  if (slot === 'hidden')
    return `│${'░'.repeat(CARD_WIDTH)}│`
  if (slot === 'empty')
    return `│${' '.repeat(CARD_WIDTH)}│`
  const text = ` ${line === 'rank' ? rankLabel(slot.rank) : suitText(slot.suit)}`.padEnd(CARD_WIDTH)
  return `│${isRed(slot.suit) ? `${ANSI_RED}${text}${ANSI_RESET}` : text}│`
}

function playerName(player: Player): string {
  return escapeMarkdown(player.name)
}

function tableButtons(game: Game): ActionRowBuilder<ButtonBuilder>[] {
  switch (game.phase) {
    case 'lobby':
      return [row(
        button(BUTTON_IDS.join, 'Rejoindre', ButtonStyle.Primary),
        button(BUTTON_IDS.leave, 'Quitter', ButtonStyle.Secondary),
        button(BUTTON_IDS.start, 'Lancer', ButtonStyle.Success).setDisabled(game.players.length < MIN_PLAYERS),
        chaosButton(game),
      )]
    case 'showdown':
      return [row(
        button(BUTTON_IDS.replay, 'Rejouer', ButtonStyle.Success).setDisabled(game.players.length < MIN_PLAYERS),
        button(BUTTON_IDS.join, 'Rejoindre', ButtonStyle.Primary),
        button(BUTTON_IDS.leave, 'Quitter', ButtonStyle.Secondary),
        chaosButton(game),
      )]
    default: {
      const actions = [button(BUTTON_IDS.cards, '🂠 Mes cartes', ButtonStyle.Secondary)]
      // malus "Pas de blocage" : pas de bouton du tout.
      // Sinon il est commun à tous : on ne peut le griser que quand plus personne n'a rien à bloquer
      if (!game.hasEffect('noLock'))
        actions.push(button(BUTTON_IDS.lock, '🔒 Bloquer ma position', ButtonStyle.Secondary).setDisabled(game.allLocked))
      actions.push(button(BUTTON_IDS.next, game.phase === 'river' ? 'Révéler ▶' : 'Tour suivant ▶', ButtonStyle.Success).setDisabled(!game.allPositioned))

      const positions = positionButtons(game)
      const bonuses = bonusButtons(game)
      const layout = [...rows(positions), row(...actions), ...rows(bonuses)]
      // trop de lignes pour Discord (beaucoup de joueurs et de bonus en chaos) : on tasse tous les boutons
      return layout.length <= MAX_ROWS ? layout : rows([...positions, ...actions, ...bonuses])
    }
  }
}

// Un bouton par bonus actif pas encore utilisé
function bonusButtons(game: Game): ButtonBuilder[] {
  const { swappedBy, revealed, spyglass, mastermind, highestRank, lowestRank, deadCards, compass, spied } = game.bonusUsage
  const beforeFlop = game.board.length < 3
  const buttons: ButtonBuilder[] = []
  if (game.hasEffect('swap') && !swappedBy)
    buttons.push(button(BUTTON_IDS.swap, '🔄 Échanger une carte', ButtonStyle.Primary))
  if (game.hasEffect('reveal') && !revealed)
    buttons.push(button(BUTTON_IDS.reveal, '👁️ Montrer une carte', ButtonStyle.Primary))
  if (game.hasEffect('spyglass') && !spyglass)
    buttons.push(button(BUTTON_IDS.spyglass, '🔭 Longue-vue', ButtonStyle.Primary))
  if (game.hasEffect('mastermind') && !mastermind)
    buttons.push(button(BUTTON_IDS.mastermind, '🎯 Mastermind', ButtonStyle.Primary).setDisabled(beforeFlop || !game.allPositioned))
  if (game.hasEffect('mountain') && !highestRank)
    buttons.push(button(BUTTON_IDS.mountain, '⛰️ Plus haute carte', ButtonStyle.Primary))
  if (game.hasEffect('bilge') && !lowestRank)
    buttons.push(button(BUTTON_IDS.bilge, '⚓ Plus basse carte', ButtonStyle.Primary))
  if (game.hasEffect('deadCards') && !deadCards)
    buttons.push(button(BUTTON_IDS.deadCards, '☠️ Cartes mortes', ButtonStyle.Primary))
  if (game.hasEffect('compass') && !compass)
    buttons.push(button(BUTTON_IDS.compass, '🧭 Boussole', ButtonStyle.Primary).setDisabled(beforeFlop || game.players.every(player => player.position === null)))
  if (game.hasEffect('spy') && !spied)
    buttons.push(button(BUTTON_IDS.spy, '🕵️ Espionner', ButtonStyle.Primary))
  return buttons
}

// Boutons 1..n : bleus si libres, verts si pris, gris désactivés si bloqués (même texte, seuls la couleur et le clic changent)
// (Discord n'a pas de bouton noir, le gris désactivé est le plus sombre dispo)
function positionButtons(game: Game): ButtonBuilder[] {
  return game.players.map((_, i) => {
    const position = i + 1
    const id = POSITION_BUTTON_ID(position)
    const holder = game.players.find(player => player.position === position)
    if (!holder)
      return button(id, `${position}`, ButtonStyle.Primary)
    const label = `${position} · ${truncate(holder.name, 20)}`
    if (holder.locked)
      return button(id, label, ButtonStyle.Secondary).setDisabled(true)
    return button(id, label, ButtonStyle.Success)
  })
}

function chaosButton(game: Game): ButtonBuilder {
  return game.chaosMode
    ? button(BUTTON_IDS.chaos, '🌀 Mode chaos : activé', ButtonStyle.Danger)
    : button(BUTTON_IDS.chaos, '🌀 Mode chaos : désactivé', ButtonStyle.Secondary)
}

function helpButton(): ButtonBuilder {
  return button(BUTTON_IDS.help, '🏆 Détails des combinaisons', ButtonStyle.Secondary)
}

function button(customId: string, label: string, style: ButtonStyle): ButtonBuilder {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style)
}

function row(...buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)
}

// Autant de lignes que nécessaire, Discord en met 5 max par ligne
function rows(buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder>[] {
  const result: ActionRowBuilder<ButtonBuilder>[] = []
  for (let i = 0; i < buttons.length; i += BUTTONS_PER_ROW) {
    result.push(row(...buttons.slice(i, i + BUTTONS_PER_ROW)))
  }
  return result
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}
