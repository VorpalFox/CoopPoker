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
  end: `${BUTTON_PREFIX}:end`,
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

const COLORS = { lobby: 0x5865f2, betting: 0x2b8a3e, win: 0xf59f00, loss: 0xe03131 }
const BUTTONS_PER_ROW = 5

export function renderTable(game: Game, { withButtons = true } = {}): BaseMessageOptions {
  return {
    embeds: [tableEmbed(game, withButtons)],
    components: withButtons ? tableButtons(game) : [],
  }
}

// Réponse privée du bouton "Mes cartes"
export function renderHoleCards(game: Game, player: Player): BaseMessageOptions {
  const lines = [`Tes cartes : **${formatCards(player.hole)}**`]
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
    .setDescription([
      'Chacun reçoit 2 cartes. À chaque tour, prenez une position de **1** (meilleure main) à **n** (la pire).',
      'Discutez, piquez-vous les positions (⚪), bloquez la vôtre quand vous êtes sûrs (⚫), puis passez au tour suivant.',
      'Après la river, **tout le monde gagne si le classement final est parfait**.',
    ].join('\n'))
    .addFields({ name: `Joueurs (${game.players.length}/${MAX_PLAYERS})`, value: players || '_Personne pour l\'instant_' })
}

function bettingEmbed(game: Game, withFooter: boolean): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.betting)
    .setTitle(`🃏 ${PHASE_LABELS[game.phase]}`)
    .setDescription(boardText(game.board))
    .addFields({ name: 'Positions (1 = meilleure main)', value: game.players.map(positionLine).join('\n') })
  addScore(embed, game)

  if (!withFooter)
    return embed
  return embed.setFooter({
    text: game.allPositioned
      ? 'Tout le monde est placé : passez au tour suivant quand vous êtes d\'accord.'
      : 'Clique sur une position pour la prendre (même déjà prise, sauf si bloquée), re-clique dessus pour la rendre. ⚪ libre · ⚫ bloquée',
  })
}

function showdownEmbed(game: Game): EmbedBuilder {
  const result = game.result!
  const embed = new EmbedBuilder()
    .setColor(result.success ? COLORS.win : COLORS.loss)
    .setTitle(result.success ? '🎉 Classement parfait, tout le monde gagne !' : '💥 Raté, le classement n\'était pas bon...')
    .setDescription(boardText(game.board))
    .addFields({ name: 'Résultat', value: result.entries.map(entry => showdownLine(entry, game)).join('\n') })
  addScore(embed, game)
  return embed
}

// Le jeton : ⚪ face blanche (volable), ⚫ retourné (bloqué)
function chip({ position, locked }: RoundPosition): string {
  return `${locked ? '⚫' : '⚪'}${position}`
}

function historyText(history: RoundPosition[]): string {
  return history.length > 0 ? `  _(${history.map(chip).join(' → ')})_` : ''
}

function positionLine(player: Player): string {
  const current = player.position === null ? '⏳' : chip({ position: player.position, locked: player.locked })
  return `**${current}** · ${playerName(player)}${historyText(player.history)}`
}

function showdownLine(entry: ShowdownEntry, game: Game): string {
  const trueRank = entry.bestRank === entry.worstRank ? `${entry.bestRank}` : `${entry.bestRank} à ${entry.worstRank}`
  const correction = entry.correct ? '' : ` → vraie place : **${trueRank}**`
  const history = historyText(game.findPlayer(entry.id)?.history ?? [])
  return `${entry.correct ? '✅' : '❌'} **${entry.position}** · ${escapeMarkdown(entry.name)} : \`${formatCards(entry.hole)}\` ${HAND_NAMES[entry.hand.category]}${correction}${history}`
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
        button(BUTTON_IDS.end, 'Arrêter', ButtonStyle.Danger),
      )]
    default:
      return [
        ...positionRows(game),
        row(
          button(BUTTON_IDS.cards, '🂠 Mes cartes', ButtonStyle.Secondary),
          button(BUTTON_IDS.lock, '🔒 Bloquer / débloquer ma position', ButtonStyle.Secondary),
          button(BUTTON_IDS.next, game.phase === 'river' ? 'Révéler ▶' : 'Tour suivant ▶', ButtonStyle.Success).setDisabled(!game.allPositioned),
          button(BUTTON_IDS.end, 'Arrêter', ButtonStyle.Danger),
        ),
      ]
  }
}

// Boutons 1..n : bleus si libres, gris avec le nom du joueur si pris, désactivés avec un cadenas si bloqués
function positionRows(game: Game): ActionRowBuilder<ButtonBuilder>[] {
  const buttons = game.players.map((_, i) => {
    const position = i + 1
    const id = POSITION_BUTTON_ID(position)
    const holder = game.players.find(player => player.position === position)
    if (!holder)
      return button(id, `${position}`, ButtonStyle.Primary)
    if (holder.locked)
      return button(id, `🔒 ${position} · ${truncate(holder.name, 20)}`, ButtonStyle.Secondary).setDisabled(true)
    return button(id, `${position} · ${truncate(holder.name, 20)}`, ButtonStyle.Secondary)
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
