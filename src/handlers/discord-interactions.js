import { InteractionType, InteractionResponseType } from 'discord.js';
import { createLogger } from '../utils/logger.js';
import { verifyDiscordRequest } from '../utils/discord-verify.js';
import { handleSlashCommand } from './slash-commands.js';

const logger = createLogger('DiscordInteractions');

export async function handleDiscordInteraction(request) {
  const signature = request.headers['x-signature-ed25519'];
  const timestamp = request.headers['x-signature-timestamp'];
  const body = request.body;

  // Verify the request
  const isValid = await verifyDiscordRequest(body, signature, timestamp);
  if (!isValid) {
    logger.warn('Invalid Discord request signature');
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Invalid request signature' })
    };
  }

  const interaction = JSON.parse(body);

  // Handle ping
  if (interaction.type === InteractionType.Ping) {
    logger.info('Received Discord ping');
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: InteractionResponseType.Pong })
    };
  }

  // Handle slash commands
  if (interaction.type === InteractionType.ApplicationCommand) {
    logger.info(`Received command: ${interaction.data.name}`);
    return await handleSlashCommand(interaction);
  }

  // Handle button interactions
  if (interaction.type === InteractionType.MessageComponent) {
    logger.info(`Received component interaction: ${interaction.data.custom_id}`);
    // TODO: Implement button handlers
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: 'Button interaction received',
          flags: 64 // Ephemeral
        }
      })
    };
  }

  // Unknown interaction type
  logger.warn(`Unknown interaction type: ${interaction.type}`);
  return {
    statusCode: 400,
    body: JSON.stringify({ error: 'Unknown interaction type' })
  };
}