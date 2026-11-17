import { type ButtonInteraction, type ChatInputCommandInteraction, type Interaction, MessageFlags, type RepliableInteraction } from 'discord.js'
import { Game, GameError } from '../game/game.js'
import { COMMAND_NAME } from './commands.js'
import { BUTTON_PREFIX, renderHoleCards, renderTable } from './render.js'

// Une table par salon, gardée en mémoire (perdue au redémarrage du bot, c'est assumé)
const games = new Map<string, Game>()

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
      if (games.has(channelId))
        throw new GameError('Il y a déjà une table dans ce salon (`/poker table` pour la réafficher, `/poker stop` pour la fermer).')
      const game = new Game()
      game.join(interaction.user.id, displayName(interaction))
      games.set(channelId, game)
      await interaction.reply(renderTable(game))
      return
    }
    case 'table':
      await interaction.reply(renderTable(requireGame(channelId)))
      return
    case 'stop':
      requireGame(channelId)
      games.delete(channelId)
      await interaction.reply('🛑 Table fermée.')
      return
  }
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const game = requireGame(interaction.channelId)
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
      await freezeAndRepost(interaction, game, () => game.advance())
      return
    case 'replay':
      game.requirePlayer(userId)
      await freezeAndRepost(interaction, game, () => game.start())
      return
    case 'end':
      game.requirePlayer(userId)
      games.delete(interaction.channelId)
      await interaction.update({ ...renderTable(game, { withButtons: false }), content: '🛑 Partie terminée.' })
      return
  }
}

// Fige le message du tour fini (sans boutons) et reposte la table en bas du salon,
// sinon elle se perd au-dessus de la discussion
async function freezeAndRepost(interaction: ButtonInteraction, game: Game, action: () => void): Promise<void> {
  const finishedRound = renderTable(game, { withButtons: false })
  action()
  await interaction.update(finishedRound)
  await interaction.followUp(renderTable(game))
}

function requireGame(channelId: string): Game {
  const game = games.get(channelId)
  if (!game)
    throw new GameError('Pas de table dans ce salon, ouvre-en une avec `/poker create`.')
  return game
}

// Pseudo sur le serveur si dispo, sinon nom du compte
function displayName(interaction: RepliableInteraction): string {
  return interaction.inCachedGuild() ? interaction.member.displayName : interaction.user.displayName
}
