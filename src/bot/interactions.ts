import { type ButtonInteraction, type ChatInputCommandInteraction, type Interaction, MessageFlags, type RepliableInteraction, type SendableChannels } from 'discord.js'
import { Game, GameError } from '../game/game.js'
import { COMMAND_NAME } from './commands.js'
import { BUTTON_PREFIX, renderHandRanking, renderHoleCards, renderInfo, renderTable } from './render.js'

// Une manche = 2 messages dans le salon : les infos fixes de la manche (règles, n° de manche, score)
// et la table juste en dessous, modifiée sur place à chaque clic. Chaque nouvelle manche reposte les 2.
interface TableSession {
  game: Game
  // dernier clic "Mes cartes" de chaque joueur pour la manche en cours. Discord laisse le bot
  // modifier la réponse cachée pendant 15 min : on s'en sert pour la mettre à jour à chaque tour.
  cardViews: Map<string, ButtonInteraction>
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
      sessions.set(channelId, { game, cardViews: new Map() })
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
      session.cardViews.clear() // nouvelle manche : chacun re-clique sur "Mes cartes"
      return
    case 'cards':
      await interaction.reply({ ...renderHoleCards(game, game.requirePlayer(userId)), flags: MessageFlags.Ephemeral })
      session.cardViews.set(userId, interaction)
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
        await refreshCardViews(session)
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
      session.cardViews.clear() // nouvelle manche : chacun re-clique sur "Mes cartes"
      return
    }
  }
}

// Met à jour les messages cachés avec le nouveau tableau et la meilleure main de chacun.
// Au-delà de 15 min Discord refuse : on oublie ce message, le joueur re-cliquera sur "Mes cartes".
async function refreshCardViews(session: TableSession): Promise<void> {
  const { game, cardViews } = session
  await Promise.all([...cardViews].map(async ([playerId, cardsClick]) => {
    const player = game.findPlayer(playerId)
    if (!player)
      return
    try {
      await cardsClick.editReply(renderHoleCards(game, player))
    } catch {
      cardViews.delete(playerId)
    }
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
