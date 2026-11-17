import { InteractionContextType, SlashCommandBuilder } from 'discord.js'

export const COMMAND_NAME = 'poker'

export const pokerCommand = new SlashCommandBuilder()
  .setName(COMMAND_NAME)
  .setDescription('Cooperative poker')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand(sub => sub.setName('create').setDescription('Open a table in this channel'))
  .addSubcommand(sub => sub.setName('table').setDescription('Show the table again at the bottom of the channel'))
  .addSubcommand(sub => sub.setName('stop').setDescription('Close the table in this channel'))
