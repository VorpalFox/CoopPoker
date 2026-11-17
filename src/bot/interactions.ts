import { type ButtonInteraction, type ChatInputCommandInteraction, type Interaction, type Message, MessageFlags, type RepliableInteraction, type SendableChannels } from 'discord.js'
import { Game, GameError } from '../game/game.js'
import { COMMAND_NAME } from './commands.js'
import { BUTTON_PREFIX, renderHistory, renderHoleCards, renderTable } from './render.js'

const CARDS_HEADER = (channelId: string) => `🃏 Ta main dans <#${channelId}>`

interface TableSession {
  game: Game
  historyMessage: Message | null // historique de la manche en cours, réécrit à chaque tour
  cardMessages: Map<string, Message> // MP de chaque joueur pour la manche en cours
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
      sessions.set(channelId, { game, historyMessage: null, cardMessages: new Map() })
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
  const session = requireSession(interaction.channelId)
  const { game } = session
  const userId = interaction.user.id
  const [, action, arg] = interaction.customId.split(':')

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
      await interaction.update(renderTable(game))
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
      game.toggleLock(userId)
      await interaction.update(renderTable(game))
      return
    case 'next':
      game.requirePlayer(userId)
      game.advance()
      await interaction.deferUpdate()
      await writeHistory(interaction, session)
      await repostTable(interaction, game)
      if (game.phase !== 'showdown')
        await refreshCards(interaction.channelId, session)
      return
    case 'replay': {
      game.requirePlayer(userId)
      // le résultat de la manche finie reste affiché, sans boutons
      const finishedRound = renderTable(game, { withButtons: false })
      game.start()
      await interaction.update(finishedRound)
      session.historyMessage = null
      await requireChannel(interaction).send(renderTable(game))
      await dealCards(interaction, session)
      return
    }
    case 'end':
      game.requirePlayer(userId)
      sessions.delete(interaction.channelId)
      await interaction.update({ ...renderTable(game, { withButtons: false }), content: '🛑 Partie terminée.' })
      return
  }
}

// Réécrit l'historique de la manche (créé au premier tour, juste au-dessus de la table)
async function writeHistory(interaction: ButtonInteraction, session: TableSession): Promise<void> {
  const history = renderHistory(session.game)
  if (session.historyMessage) {
    try {
      await session.historyMessage.edit(history)
      return
    } catch {
      // supprimé entre-temps : on le recrée
    }
  }
  session.historyMessage = await requireChannel(interaction).send(history)
}

// Supprime la table du tour fini et la recrée tout en bas du salon
async function repostTable(interaction: ButtonInteraction, game: Game): Promise<void> {
  await interaction.message.delete().catch(() => interaction.editReply({ components: [] }))
  await requireChannel(interaction).send(renderTable(game))
}

// Envoie ses cartes en MP à chaque joueur. Ceux qui bloquent les MP passeront par le bouton "Mes cartes".
async function dealCards(interaction: ButtonInteraction, session: TableSession): Promise<void> {
  const { game, cardMessages } = session
  cardMessages.clear()

  const results = await Promise.allSettled(game.players.map(async player => {
    const user = await interaction.client.users.fetch(player.id)
    cardMessages.set(player.id, await user.send(renderHoleCards(game, player, CARDS_HEADER(interaction.channelId))))
  }))

  const failed = game.players.filter((_, i) => results[i].status === 'rejected')
  if (failed.length === 0)
    return
  console.warn(`MP impossible pour ${failed.map(player => player.name).join(', ')}`)
  await interaction.followUp({
    content: `⚠️ Impossible d'envoyer les cartes en MP à ${failed.map(player => player.name).join(', ')} : utilisez le bouton 🂠 Mes cartes.`,
    flags: MessageFlags.Ephemeral,
  })
}

// Met à jour les MP avec le nouveau tableau et la meilleure main de chacun
async function refreshCards(channelId: string, session: TableSession): Promise<void> {
  const { game, cardMessages } = session
  await Promise.allSettled([...cardMessages].map(([playerId, message]) => {
    const player = game.findPlayer(playerId)
    return player ? message.edit(renderHoleCards(game, player, CARDS_HEADER(channelId))) : Promise.resolve()
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
