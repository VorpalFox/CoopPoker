import { InteractionContextType, SlashCommandBuilder } from 'discord.js'

export const COMMAND_NAME = 'poker'

export const pokerCommand = new SlashCommandBuilder()
  .setName(COMMAND_NAME)
  .setDescription('Poker coopératif')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand(sub => sub.setName('creer').setDescription('Ouvre une table dans ce salon'))
  .addSubcommand(sub => sub.setName('table').setDescription('Réaffiche la table en bas du salon'))
  .addSubcommand(sub => sub.setName('stop').setDescription('Ferme la table de ce salon'))
