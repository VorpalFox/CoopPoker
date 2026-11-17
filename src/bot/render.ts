import { ActionRowBuilder, type BaseMessageOptions, ButtonBuilder, ButtonStyle, EmbedBuilder, escapeMarkdown } from 'discord.js'
import { type Card, formatCards } from '../game/cards.js'
import { type Game, MAX_PLAYERS, MIN_PLAYERS, type Phase, type Player, type RoundPosition } from '../game/game.js'
import { evaluateHand, HAND_NAMES } from '../game/handEvaluator.js'
import { type ShowdownEntry } from '../game/showdown.js'

export const BUTTON_PREFIX = 'cp'
export const BUTTON_IDS = {
  join: `${BUTTON_PREFIX}:join`,
  leave: `${BUTTON_PREFIX}:leave`,
  start: `${BUTTON_PREFIX}:start`,
  cards: `${BUTTON_PREFIX}:cards`,
  lock: `${BUTTON_PREFIX}:lock`,
  next: `${BUTTON_PREFIX}:next`,
  replay: `${BUTTON_PREFIX}:replay`,
}
export const POSITION_BUTTON_ID = (position: number) => `${BUTTON_PREFIX}:pos:${position}`

const PHASE_LABELS: Record<Phase, string> = {
  lobby: 'Salle d\'attente',
  preflop: 'Pré-flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Abattage',
}

const ROUND_LABELS = ['Pré-flop', 'Flop', 'Turn', 'River']
const HISTORY_NAME_WIDTH = 12
const HISTORY_CELL_WIDTH = 8 // largeur de 'Pré-flop', le plus long libellé

const RULES = [
  '• Chacun reçoit 2 cartes en MP, puis 4 tours : pré-flop, flop, turn, river.',
  '• À chaque tour, prenez une position : **1 = meilleure main**.',
  '• On peut voler une position ⚪, sauf si elle est bloquée ⚫ (jusqu\'au tour suivant).',
  '• Après la river, **tout le monde gagne si le classement est parfait**.',
].join('\n')

const COLORS = { lobby: 0x5865f2, betting: 0x2b8a3e, history: 0x868e96, win: 0xf59f00, loss: 0xe03131 }
const BUTTONS_PER_ROW = 5

export function renderTable(game: Game, { withButtons = true } = {}): BaseMessageOptions {
  return {
    embeds: [tableEmbed(game, withButtons)],
    components: withButtons ? tableButtons(game) : [],
  }
}

// Message du haut pendant la partie : rappel des règles + historique de la manche + score
export function renderInfo(game: Game): BaseMessageOptions {
  const embed = new EmbedBuilder()
    .setColor(COLORS.history)
    .setTitle(`🃏 Poker coopératif · Manche ${handNumber(game)}`)
    .setDescription(RULES)

  const history = historyTable(game)
  if (history)
    embed.addFields({ name: '📜 Historique de la manche', value: history })
  addScore(embed, game)
  return { embeds: [embed], components: [] }
}

// Cartes d'un joueur : en MP à chaque manche, ou en réponse privée au bouton "Mes cartes"
export function renderHoleCards(game: Game, player: Player, header?: string): BaseMessageOptions {
  const lines = header ? [header] : []
  lines.push(`Tes cartes : **${formatCards(player.hole)}**`)
  if (game.board.length > 0) {
    const hand = evaluateHand([...player.hole, ...game.board])
    lines.push(`Tableau : ${formatCards(game.board)}`)
    lines.push(`Ta main : **${HAND_NAMES[hand.category]}** (${formatCards(hand.cards)})`)
  }
  return { content: lines.join('\n') }
}

function tableEmbed(game: Game, withFooter: boolean): EmbedBuilder {
  switch (game.phase) {
    case 'lobby':
      return lobbyEmbed(game)
    case 'showdown':
      return showdownEmbed(game)
    default:
      return bettingEmbed(game, withFooter)
  }
}

function lobbyEmbed(game: Game): EmbedBuilder {
  const players = game.players.map(player => `• ${playerName(player)}`).join('\n')
  return new EmbedBuilder()
    .setColor(COLORS.lobby)
    .setTitle('🃏 Poker coopératif')
    .setDescription(RULES)
    .addFields({ name: `Joueurs (${game.players.length}/${MAX_PLAYERS})`, value: players || '_Personne pour l\'instant_' })
}

function bettingEmbed(game: Game, withFooter: boolean): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.betting)
    .setTitle(`🃏 ${PHASE_LABELS[game.phase]}`)
    .setDescription(boardText(game.board))
    .addFields({ name: 'Positions', value: game.players.map(positionLine).join('\n') })

  if (!withFooter)
    return embed
  return embed.setFooter({
    text: game.allPositioned
      ? 'Tout le monde est placé : passez au tour suivant quand vous êtes d\'accord.'
      : 'Prenez une position',
  })
}

function showdownEmbed(game: Game): EmbedBuilder {
  const result = game.result!
  return new EmbedBuilder()
    .setColor(result.success ? COLORS.win : COLORS.loss)
    .setTitle(result.success ? '🎉 Classement parfait, tout le monde gagne !' : '💥 Raté, le classement n\'était pas bon...')
    .setDescription(boardText(game.board))
    .addFields({ name: 'Résultat', value: result.entries.map(showdownLine).join('\n') })
}

// Tableau en bloc de code : une ligne par joueur, une colonne par tour joué
function historyTable(game: Game): string {
  const roundCount = Math.max(0, ...game.players.map(player => player.history.length))
  if (roundCount === 0)
    return ''

  // pas de ` dans un bloc de code, ça le casserait
  const names = game.players.map(player => truncate(player.name.replaceAll('`', ''), HISTORY_NAME_WIDTH))
  const nameWidth = Math.max(...names.map(name => name.length))
  const rounds = ROUND_LABELS.slice(0, roundCount)

  const header = [''.padEnd(nameWidth), ...rounds.map(label => label.padEnd(HISTORY_CELL_WIDTH))].join(' ')
  const rows = game.players.map((player, i) => [
    names[i].padEnd(nameWidth),
    // ○ ● plutôt que ⚪ ⚫ : les émojis font ~2 caractères de large et décaleraient les colonnes
    ...player.history.map(({ position, locked }) => `${locked ? '●' : '○'}${position}`.padEnd(HISTORY_CELL_WIDTH)),
  ].join(' '))
  return ['```', header.trimEnd(), ...rows.map(row => row.trimEnd()), '```'].join('\n')
}

// Numéro de la manche en cours (ou qui vient de se finir à l'abattage)
export function handNumber(game: Game): number {
  return game.wins + game.losses + (game.phase === 'showdown' ? 0 : 1)
}

// Le jeton : ⚪ face blanche (volable), ⚫ retourné (bloqué)
function chip({ position, locked }: RoundPosition): string {
  return `${locked ? '⚫' : '⚪'}${position}`
}

function positionLine(player: Player): string {
  const current = player.position === null ? '⏳' : chip({ position: player.position, locked: player.locked })
  return `**${current}** · ${playerName(player)}`
}

function showdownLine(entry: ShowdownEntry): string {
  const trueRank = entry.bestRank === entry.worstRank ? `${entry.bestRank}` : `${entry.bestRank} à ${entry.worstRank}`
  const correction = entry.correct ? '' : ` → vraie place : **${trueRank}**`
  return `${entry.correct ? '✅' : '❌'} **${entry.position}** · ${escapeMarkdown(entry.name)} : \`${formatCards(entry.hole)}\` ${HAND_NAMES[entry.hand.category]}${correction}`
}

function boardText(board: Card[]): string {
  return board.length > 0 ? `## ${formatCards(board)}` : '_Pas encore de cartes au tableau_'
}

function addScore(embed: EmbedBuilder, game: Game): void {
  if (game.wins + game.losses === 0)
    return
  embed.addFields({ name: 'Score', value: `${game.wins} 🎉 / ${game.losses} 💥` })
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
      )]
    case 'showdown':
      return [row(
        button(BUTTON_IDS.replay, 'Rejouer', ButtonStyle.Success).setDisabled(game.players.length < MIN_PLAYERS),
        button(BUTTON_IDS.join, 'Rejoindre', ButtonStyle.Primary),
        button(BUTTON_IDS.leave, 'Quitter', ButtonStyle.Secondary),
      )]
    default:
      return [
        ...positionRows(game),
        row(
          button(BUTTON_IDS.cards, '🂠 Mes cartes', ButtonStyle.Secondary),
          // commun à tous : on ne peut le griser que quand plus personne n'a rien à bloquer
          button(BUTTON_IDS.lock, '🔒 Bloquer ma position', ButtonStyle.Secondary).setDisabled(game.allLocked),
          button(BUTTON_IDS.next, game.phase === 'river' ? 'Révéler ▶' : 'Tour suivant ▶', ButtonStyle.Success).setDisabled(!game.allPositioned),
        ),
      ]
  }
}

// Boutons 1..n : bleus si libres, verts si pris, gris désactivés avec un cadenas si bloqués
// (Discord n'a pas de bouton noir, le gris désactivé est le plus sombre dispo)
function positionRows(game: Game): ActionRowBuilder<ButtonBuilder>[] {
  const buttons = game.players.map((_, i) => {
    const position = i + 1
    const id = POSITION_BUTTON_ID(position)
    const holder = game.players.find(player => player.position === position)
    if (!holder)
      return button(id, `${position}`, ButtonStyle.Primary)
    if (holder.locked)
      return button(id, `🔒 ${position} · ${truncate(holder.name, 20)}`, ButtonStyle.Secondary).setDisabled(true)
    return button(id, `${position} · ${truncate(holder.name, 20)}`, ButtonStyle.Success)
  })

  const rows: ActionRowBuilder<ButtonBuilder>[] = []
  for (let i = 0; i < buttons.length; i += BUTTONS_PER_ROW) {
    rows.push(row(...buttons.slice(i, i + BUTTONS_PER_ROW)))
  }
  return rows
}

function button(customId: string, label: string, style: ButtonStyle): ButtonBuilder {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style)
}

function row(...buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}
