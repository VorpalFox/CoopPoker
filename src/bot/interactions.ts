import { type ButtonInteraction, type ChatInputCommandInteraction, type Interaction, type Message, MessageFlags, type RepliableInteraction, type SendableChannels } from 'discord.js'
import { Game, GameError, type Player } from '../game/game.js'
import { COMMAND_NAME } from './commands.js'
import { BUTTON_PREFIX, handNumber, renderHandRanking, renderHoleCards, renderInfo, renderTable } from './render.js'

const CARDS_HEADER = (channelId: string, hand: number) => `🃏 Manche ${hand} dans <#${channelId}>`

// Une manche = 2 messages dans le salon : les infos fixes de la manche (règles, n° de manche, score)
// et la table juste en dessous, modifiée sur place à chaque clic. Chaque nouvelle manche reposte les 2.
interface TableSession {
  game: Game
  cardMessages: Map<string, Message> // MP de chaque joueur, réutilisé d'une manche à l'autre
}

// Une table par salon, gardée en mémoire (perdue au redémarrage du bot, c'est assumé)
const sessions = new Map<string, TableSession>()

export async function handleInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isRepliable())
    return

  try {
    if (interaction.isChatInputCommand() && interaction.commandName === COMMAND_NAME)
      await handleCommand(interaction)
    else if (interaction.isButton() && interaction.customId.startsWith(`${BUTTON_PREFIX}:`))
      await handleButton(interaction)
  } catch (error) {
    if (!(error instanceof GameError))
      throw error
    await interaction.reply({ content: `⚠️ ${error.message}`, flags: MessageFlags.Ephemeral })
  }
}

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const channelId = interaction.channelId

  switch (interaction.options.getSubcommand()) {
    case 'create': {
      if (sessions.has(channelId))
        throw new GameError('Il y a déjà une table dans ce salon (`/poker table` pour la réafficher, `/poker stop` pour la fermer).')
      const game = new Game()
      game.join(interaction.user.id, displayName(interaction))
      sessions.set(channelId, { game, cardMessages: new Map() })
      await interaction.reply(renderTable(game))
      return
    }
    case 'table':
      await interaction.reply(renderTable(requireSession(channelId).game))
      return
    case 'stop':
      requireSession(channelId)
      sessions.delete(channelId)
      await interaction.reply('🛑 Table fermée.')
      return
  }
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const [, action, arg] = interaction.customId.split(':')

  // l'aide marche pour tout le monde, même sans partie en cours
  if (action === 'help') {
    await interaction.reply({ ...renderHandRanking(), flags: MessageFlags.Ephemeral })
    return
  }

  const session = requireSession(interaction.channelId)
  const { game } = session
  const userId = interaction.user.id

  switch (action) {
    case 'join':
      game.join(userId, displayName(interaction))
      await interaction.update(renderTable(game))
      return
    case 'leave':
      game.leave(userId)
      await interaction.update(renderTable(game))
      return
    case 'start':
      game.requirePlayer(userId)
      game.start()
      // le salon d'attente devient le rappel des règles, la table s'affiche juste en dessous
      await interaction.update(renderInfo(game))
      await requireChannel(interaction).send(renderTable(game))
      await dealCards(interaction, session)
      return
    case 'cards':
      await interaction.reply({ ...renderHoleCards(game, game.requirePlayer(userId)), flags: MessageFlags.Ephemeral })
      return
    case 'pos':
      game.takePosition(userId, Number(arg))
      await interaction.update(renderTable(game))
      return
    case 'lock':
      game.lock(userId)
      await interaction.update(renderTable(game))
      return
    case 'next':
      game.requirePlayer(userId)
      game.advance()
      await interaction.update(renderTable(game))
      if (game.phase !== 'showdown')
        await refreshCards(interaction.channelId, session)
      return
    case 'replay': {
      game.requirePlayer(userId)
      // le résultat de la manche finie reste dans le salon (sans boutons) pour pouvoir remonter l'historique,
      // puis on reposte les 2 messages de la nouvelle manche en dessous
      const finishedHand = renderTable(game, { withButtons: false })
      game.start()
      await interaction.update(finishedHand)
      const channel = requireChannel(interaction)
      await channel.send(renderInfo(game))
      await channel.send(renderTable(game))
      await dealCards(interaction, session)
      return
    }
  }
}

// Envoie ses cartes en MP à chaque joueur (ou réécrit son MP de la manche d'avant).
// Ceux qui bloquent les MP passeront par le bouton "Mes cartes".
async function dealCards(interaction: ButtonInteraction, session: TableSession): Promise<void> {
  const { game } = session
  const results = await Promise.allSettled(game.players.map(player => writeCards(interaction, session, player)))

  const failed = game.players.filter((_, i) => results[i].status === 'rejected')
  if (failed.length === 0)
    return
  const names = failed.map(player => player.name).join(', ')
  console.warn(`MP impossible pour ${names}`)
  await interaction.followUp({ content: `⚠️ Impossible d'envoyer les cartes en MP à ${names} : utilisez le bouton 🂠 Mes cartes.`, flags: MessageFlags.Ephemeral })
}

async function writeCards(interaction: ButtonInteraction, session: TableSession, player: Player): Promise<void> {
  const content = renderHoleCards(session.game, player, CARDS_HEADER(interaction.channelId, handNumber(session.game)))
  const existing = session.cardMessages.get(player.id)
  if (existing) {
    try {
      await existing.edit(content)
      return
    } catch {
      // MP supprimé entre-temps : on en renvoie un
    }
  }

  const user = await interaction.client.users.fetch(player.id)
  session.cardMessages.set(player.id, await user.send(content))
}

// Met à jour les MP avec le nouveau tableau et la meilleure main de chacun
async function refreshCards(channelId: string, session: TableSession): Promise<void> {
  const { game, cardMessages } = session
  await Promise.allSettled([...cardMessages].map(([playerId, message]) => {
    const player = game.findPlayer(playerId)
    return player ? message.edit(renderHoleCards(game, player, CARDS_HEADER(channelId, handNumber(game)))) : Promise.resolve()
  }))
}

function requireSession(channelId: string): TableSession {
  const session = sessions.get(channelId)
  if (!session)
    throw new GameError('Pas de table dans ce salon, ouvre-en une avec `/poker create`.')
  return session
}

function requireChannel(interaction: ButtonInteraction): SendableChannels {
  if (!interaction.channel?.isSendable())
    throw new Error(`Salon ${interaction.channelId} inaccessible au bot`)
  return interaction.channel
}

// Pseudo sur le serveur si dispo, sinon nom du compte
function displayName(interaction: RepliableInteraction): string {
  return interaction.inCachedGuild() ? interaction.member.displayName : interaction.user.displayName
}
