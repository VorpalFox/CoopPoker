import { type ButtonInteraction, type ChatInputCommandInteraction, type Interaction, type Message, MessageFlags, type RepliableInteraction, type SendableChannels } from 'discord.js'
import { TIMER_SECONDS_PER_PLAYER } from '../game/effects.js'
import { Game, GameError } from '../game/game.js'
import { COMMAND_NAME } from './commands.js'
import { BUTTON_PREFIX, STEP_SEPARATOR, type CardChoiceKind, type PlayerChoiceKind, renderCardChoice, renderHandRanking, renderHoleCards, renderInfo, renderPlayerChoice, renderTable } from './render.js'

// Une manche = 2 messages dans le salon : les infos fixes de la manche (règles, n° de manche, score, bonus / malus)
// et la table juste en dessous, modifiée sur place à chaque clic. Chaque nouvelle manche reposte les 2.
interface TableSession {
  channelId: string
  game: Game
  tableMessage: Message | null // pour modifier la table sans clic dessus (chrono, choix de carte)
  // dernier clic "Mes cartes" de chaque joueur pour la manche en cours. Discord laisse le bot
  // modifier la réponse cachée pendant 15 min : on s'en sert pour la mettre à jour à chaque tour.
  cardViews: Map<string, ButtonInteraction>
  // malus "Chrono"
  timer: NodeJS.Timeout | null
  deadline: number | null
}

// Une table par salon, gardée en mémoire (perdue au redémarrage du bot, c'est assumé)
const sessions = new Map<string, TableSession>()

// File d'attente par salon : les clics simultanés sont traités l'un après l'autre, pour que les mises à jour
// de la table partent dans l'ordre (sinon une table périmée peut arriver après la bonne et l'écraser)
const queues = new Map<string, Promise<void>>()

function inQueue(channelId: string, task: () => Promise<void>): Promise<void> {
  const run = (queues.get(channelId) ?? Promise.resolve()).then(task)
  queues.set(channelId, run.catch(() => {}))
  return run
}

export async function handleInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isRepliable())
    return
  await inQueue(interaction.channelId ?? '', () => dispatch(interaction))
}

async function dispatch(interaction: RepliableInteraction): Promise<void> {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === COMMAND_NAME)
      await handleCommand(interaction)
    else if (interaction.isButton() && interaction.customId.startsWith(`${BUTTON_PREFIX}:`))
      await handleButton(interaction)
  } catch (error) {
    if (!(error instanceof GameError))
      throw error
    // clic qui n'a plus lieu d'être (un autre joueur a été plus rapide) : on acquitte sans rien changer
    if (interaction.isButton() && !error.shown) {
      if (!interaction.replied && !interaction.deferred)
        await interaction.deferUpdate()
      return
    }
    const message = { content: `⚠️ ${error.message}`, flags: MessageFlags.Ephemeral } as const
    await (interaction.replied || interaction.deferred ? interaction.followUp(message) : interaction.reply(message))
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
      sessions.set(channelId, { channelId, game, tableMessage: null, cardViews: new Map(), timer: null, deadline: null })
      await interaction.reply(renderTable(game))
      return
    }
    case 'table': {
      const session = requireSession(channelId)
      const response = await interaction.reply({ ...table(session), withResponse: true })
      session.tableMessage = response.resource?.message ?? session.tableMessage
      return
    }
    case 'stop': {
      const session = requireSession(channelId)
      stopTimer(session)
      sessions.delete(channelId)
      await interaction.reply('🛑 Table fermée.')
      return
    }
  }
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const [buttonId, step] = interaction.customId.split(STEP_SEPARATOR)
  const [, action, arg] = buttonId.split(':')

  // l'aide marche pour tout le monde, même sans partie en cours
  if (action === 'help') {
    await interaction.reply({ ...renderHandRanking(), flags: MessageFlags.Ephemeral })
    return
  }

  const session = requireSession(interaction.channelId)
  const { game } = session
  const userId = interaction.user.id

  // bouton d'une étape passée (le tour a changé entre-temps) : rien à faire
  if (step !== undefined && Number(step) !== game.step) {
    await interaction.deferUpdate()
    return
  }

  switch (action) {
    case 'join':
      game.join(userId, displayName(interaction))
      await interaction.update(renderTable(game))
      return
    case 'leave':
      game.leave(userId)
      await interaction.update(renderTable(game))
      return
    case 'chaos':
      game.requirePlayer(userId)
      game.toggleChaos()
      await interaction.update(renderTable(game))
      return
    case 'start':
      game.requirePlayer(userId)
      game.start()
      startRoundTimer(session)
      // le salon d'attente devient le rappel des règles, la table s'affiche juste en dessous
      await interaction.update(renderInfo(game))
      session.cardViews.clear() // nouvelle manche : chacun re-clique sur "Mes cartes"
      session.tableMessage = await requireChannel(interaction).send(table(session))
      return
    case 'cards':
      await interaction.reply({ ...renderHoleCards(game.requirePlayer(userId)), flags: MessageFlags.Ephemeral })
      session.cardViews.set(userId, interaction)
      return
    case 'pos':
      game.takePosition(userId, Number(arg))
      await updateTable(interaction, session)
      return
    case 'lock':
      game.lock(userId)
      await updateTable(interaction, session)
      return
    case 'next':
      game.requirePlayer(userId)
      game.advance()
      startRoundTimer(session)
      await updateTable(interaction, session)
      return
    case 'swap':
    case 'reveal':
      await handleCardChoice(interaction, session, action, arg)
      return
    case 'compass':
    case 'spy':
      await handlePlayerChoice(interaction, session, action, arg)
      return
    case 'spyglass':
      game.useSpyglass(userId)
      await updateTable(interaction, session)
      return
    case 'mastermind':
      game.useMastermind(userId)
      await updateTable(interaction, session)
      return
    case 'mountain':
      game.useMountain(userId)
      await updateTable(interaction, session)
      return
    case 'bilge':
      game.useBilge(userId)
      await updateTable(interaction, session)
      return
    case 'deadCards':
      game.useDeadCards(userId)
      await updateTable(interaction, session)
      return
    case 'replay': {
      game.requirePlayer(userId)
      // le résultat de la manche finie reste dans le salon (sans boutons) pour pouvoir remonter l'historique,
      // puis on reposte les 2 messages de la nouvelle manche en dessous
      const finishedHand = renderTable(game, { withButtons: false })
      game.start()
      startRoundTimer(session)
      await interaction.update(finishedHand)
      session.cardViews.clear() // nouvelle manche : chacun re-clique sur "Mes cartes"
      const channel = requireChannel(interaction)
      await channel.send(renderInfo(game))
      session.tableMessage = await channel.send(table(session))
      return
    }
  }
}

// Bonus Échange / Révélation, en 2 clics : le bouton de la table ouvre un choix caché, puis on choisit la carte
async function handleCardChoice(interaction: ButtonInteraction, session: TableSession, kind: CardChoiceKind, cardIndex: string | undefined): Promise<void> {
  const { game } = session
  const player = game.requirePlayer(interaction.user.id)

  if (cardIndex === undefined) {
    game.requireCardBonus(kind)
    await interaction.reply({ ...renderCardChoice(player, kind), flags: MessageFlags.Ephemeral })
    return
  }

  try {
    if (kind === 'swap')
      game.swapCard(player.id, Number(cardIndex))
    else
      game.revealCard(player.id, Number(cardIndex))
  } catch (error) {
    if (!(error instanceof GameError) || error.shown)
      throw error
    // quelqu'un a pris le bonus entre-temps : on retire juste le choix de carte devenu inutile
    await interaction.deferUpdate()
    await interaction.deleteReply()
    return
  }
  await interaction.update(renderHoleCards(player))
  await editTable(session)
  if (kind === 'swap')
    await refreshCardViews(session)
}

// Bonus Boussole / Espion, en 2 clics : le bouton de la table ouvre un choix caché, puis on choisit le joueur
async function handlePlayerChoice(interaction: ButtonInteraction, session: TableSession, kind: PlayerChoiceKind, targetId: string | undefined): Promise<void> {
  const { game } = session
  const player = game.requirePlayer(interaction.user.id)

  if (targetId === undefined) {
    const targets = kind === 'compass' ? game.compassTargets() : game.spyTargets(player.id)
    await interaction.reply({ ...renderPlayerChoice(kind, targets), flags: MessageFlags.Ephemeral })
    return
  }

  try {
    if (kind === 'compass')
      game.useCompass(player.id, targetId)
    else
      game.useSpy(player.id, targetId)
  } catch (error) {
    if (!(error instanceof GameError) || error.shown)
      throw error
  }
  // le choix ne sert plus (aussi quand quelqu'un a pris le bonus entre-temps) : on le retire, la réponse est sur la table
  await interaction.deferUpdate()
  await interaction.deleteReply()
  await editTable(session)
}

// La table sur laquelle on vient de cliquer : on la modifie et on retient ce message
async function updateTable(interaction: ButtonInteraction, session: TableSession): Promise<void> {
  await interaction.update(table(session))
  session.tableMessage = interaction.message
}

// La table quand le clic vient d'ailleurs (chrono, choix de carte en message caché)
async function editTable(session: TableSession): Promise<void> {
  await session.tableMessage?.edit(table(session))
    .catch(error => console.warn('Table introuvable, pas mise à jour', error))
}

function table(session: TableSession) {
  return renderTable(session.game, { deadline: session.deadline })
}

// Malus "Chrono" : relancé à chaque tour, coupé hors manche ou sans le malus
function startRoundTimer(session: TableSession): void {
  stopTimer(session)
  const { game } = session
  if (!game.isBetting || !game.hasEffect('timer'))
    return

  const duration = TIMER_SECONDS_PER_PLAYER * 1000 * game.players.length
  session.deadline = Date.now() + duration
  session.timer = setTimeout(() => {
    inQueue(session.channelId, () => onTimeout(session)).catch(error => console.error('Erreur à la fin du chrono', error))
  }, duration)
}

function stopTimer(session: TableSession): void {
  if (session.timer)
    clearTimeout(session.timer)
  session.timer = null
  session.deadline = null
}

async function onTimeout(session: TableSession): Promise<void> {
  session.game.timeout()
  startRoundTimer(session)
  await editTable(session)
}

// Met à jour les messages cachés "Mes cartes" (après un Échange, la carte a changé).
// Au-delà de 15 min Discord refuse : on oublie ce message, le joueur re-cliquera sur "Mes cartes".
async function refreshCardViews(session: TableSession): Promise<void> {
  const { game, cardViews } = session
  if (!game.isBetting)
    return

  await Promise.all([...cardViews].map(async ([playerId, cardsClick]) => {
    const player = game.findPlayer(playerId)
    if (!player)
      return
    try {
      await cardsClick.editReply(renderHoleCards(player))
    } catch {
      cardViews.delete(playerId)
    }
  }))
}

function requireSession(channelId: string): TableSession {
  const session = sessions.get(channelId)
  if (!session)
    throw new GameError('Pas de table dans ce salon, ouvre-en une avec `/poker create`.', true)
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
