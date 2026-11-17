import 'dotenv/config'
import { REST, Routes } from 'discord.js'
import { pokerCommand } from './bot/commands.js'

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env
if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID)
  throw new Error('DISCORD_TOKEN et DISCORD_CLIENT_ID sont requis dans le .env')

// Sur un serveur précis c'est instantané, en global ça peut prendre un moment à apparaître
const route = DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID)
  : Routes.applicationCommands(DISCORD_CLIENT_ID)

await new REST().setToken(DISCORD_TOKEN).put(route, { body: [pokerCommand.toJSON()] })
console.log(`Commande /${pokerCommand.name} enregistrée ${DISCORD_GUILD_ID ? `sur le serveur ${DISCORD_GUILD_ID}` : 'en global'}`)
