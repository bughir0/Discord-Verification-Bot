import 'dotenv/config';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { handleInteraction } from './handlers/interactionHandler.js';
import { registerCommands } from './utils/deployCommands.js';
import logger from './utils/logger.js';
import { initConsoleWebhookLogger, disableConsoleWebhookForwarding, enableConsoleWebhookForwarding } from './utils/consoleWebhookLogger.js';

// Inicializar replicação de console para webhook (se configurado)
initConsoleWebhookLogger();
// Durante o boot, não encaminhar logs para o webhook (evita spam ou erros)
disableConsoleWebhookForwarding();

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildModeration,
    ],
    partials: ['GuildMember', 'Message', 'Channel']
});

// Initialize commands collection
client.commands = new Collection();

// Lista de informações do bot para o rich presence
const botPresenceMessages = [
    "Dev by Hiro",
    "Sistema de Verificação",
    "Criado com ❤️ por Hiro"
];

// Função para atualizar a presença periodicamente
function updatePresence(client) {
    const randomMessage = botPresenceMessages[Math.floor(Math.random() * botPresenceMessages.length)];
    
    client.user.setPresence({
        status: 'online', // Status online
        activities: [{
            name: randomMessage,
            type: 1, // STREAMING
            url: 'https://twitch.tv/discord' // URL obrigatória para STREAMING (pode ser qualquer URL válida)
        }]
    });

    // Trocar a mensagem a cada 30 segundos
    setTimeout(() => updatePresence(client), 30000);
}

// Handle guild member join/leave
// Handle guild member events
client.on('guildMemberAdd', async (member) => {
    try {
        const { handleGuildMemberAdd } = await import('./handlers/guildMemberHandler.js');
        await handleGuildMemberAdd(member);
    } catch (error) {
        logger.error('Error in guildMemberAdd handler', { error: error.message, stack: error.stack, guildId: member.guild?.id, userId: member.user?.id });
    }
});

client.on('guildMemberRemove', async (member) => {
    try {
        const { handleGuildMemberRemove } = await import('./handlers/guildMemberHandler.js');
        await handleGuildMemberRemove(member);
    } catch (error) {
        logger.error('Error in guildMemberRemove handler', { error: error.message, stack: error.stack, guildId: member.guild?.id, userId: member.user?.id });
    }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
        const { handleGuildMemberUpdate } = await import('./handlers/guildMemberHandler.js');
        await handleGuildMemberUpdate(oldMember, newMember);
    } catch (error) {
        logger.error('Error in guildMemberUpdate handler', { error: error.message, stack: error.stack, guildId: newMember.guild?.id, userId: newMember.user?.id });
    }
});

// Handle user update events (username, avatar changes)
client.on('userUpdate', async (oldUser, newUser) => {
    try {
        const { handleUserUpdate } = await import('./handlers/guildMemberHandler.js');
        await handleUserUpdate(oldUser, newUser);
    } catch (error) {
        logger.error('Error in userUpdate handler', { error: error.message, stack: error.stack, userId: newUser?.id });
    }
});

// Handle voice state updates
client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
        const { handleVoiceStateUpdate } = await import('./handlers/voiceStateHandler.js');
        await handleVoiceStateUpdate(oldState, newState);
    } catch (error) {
        logger.error('Error in voiceStateUpdate handler', { error: error.message, stack: error.stack, guildId: newState.guild?.id, userId: newState.member?.id });
    }
});

// Handle message events
client.on('messageDelete', async (message) => {
    try {
        const { handleMessageDelete } = await import('./handlers/messageLogHandler.js');
        await handleMessageDelete(message);
    } catch (error) {
        logger.error('Error in messageDelete handler', { error: error.message, stack: error.stack, guildId: message.guild?.id, channelId: message.channel?.id });
    }
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
    try {
        const { handleMessageUpdate } = await import('./handlers/messageLogHandler.js');
        await handleMessageUpdate(oldMessage, newMessage);
    } catch (error) {
        logger.error('Error in messageUpdate handler', { error: error.message, stack: error.stack, guildId: newMessage.guild?.id, channelId: newMessage.channel?.id });
    }
});

client.on('messageDeleteBulk', async (messages, channel) => {
    try {
        const { handleBulkDelete } = await import('./handlers/messageLogHandler.js');
        await handleBulkDelete(messages, channel);
    } catch (error) {
        logger.error('Error in messageDeleteBulk handler', { error: error.message, stack: error.stack, guildId: channel.guild?.id, channelId: channel.id });
    }
});

// Handle channel events
client.on('channelCreate', async (channel) => {
    try {
        const { handleChannelCreate } = await import('./handlers/channelLogHandler.js');
        await handleChannelCreate(channel);
    } catch (error) {
        logger.error('Error in channelCreate handler', { error: error.message, stack: error.stack, guildId: channel.guild?.id, channelId: channel.id });
    }
});

client.on('channelDelete', async (channel) => {
    try {
        const { handleChannelDelete } = await import('./handlers/channelLogHandler.js');
        await handleChannelDelete(channel);
    } catch (error) {
        logger.error('Error in channelDelete handler', { error: error.message, stack: error.stack, guildId: channel.guild?.id, channelId: channel.id });
    }
});

client.on('channelUpdate', async (oldChannel, newChannel) => {
    try {
        const { handleChannelUpdate } = await import('./handlers/channelLogHandler.js');
        await handleChannelUpdate(oldChannel, newChannel);
    } catch (error) {
        logger.error('Error in channelUpdate handler', { error: error.message, stack: error.stack, guildId: newChannel.guild?.id, channelId: newChannel.id });
    }
});

// Handle guild events
client.on('guildUpdate', async (oldGuild, newGuild) => {
    try {
        const { handleGuildUpdate, handleGuildBoostLevelUp } = await import('./handlers/guildLogHandler.js');
        await handleGuildUpdate(oldGuild, newGuild);
        
        // Verificar se o nível de boost mudou
        if (oldGuild.premiumTier !== newGuild.premiumTier) {
            await handleGuildBoostLevelUp(newGuild, newGuild.premiumTier);
        }
    } catch (error) {
        logger.error('Error in guildUpdate handler', { error: error.message, stack: error.stack, guildId: newGuild?.id });
    }
});

// Handle emoji events
client.on('emojiCreate', async (emoji) => {
    try {
        const { handleEmojiCreate } = await import('./handlers/guildLogHandler.js');
        await handleEmojiCreate(emoji);
    } catch (error) {
        logger.error('Error in emojiCreate handler', { error: error.message, stack: error.stack, guildId: emoji.guild?.id });
    }
});

client.on('emojiDelete', async (emoji) => {
    try {
        const { handleEmojiDelete } = await import('./handlers/guildLogHandler.js');
        await handleEmojiDelete(emoji);
    } catch (error) {
        logger.error('Error in emojiDelete handler', { error: error.message, stack: error.stack, guildId: emoji.guild?.id });
    }
});

client.on('emojiUpdate', async (oldEmoji, newEmoji) => {
    try {
        const { handleEmojiUpdate } = await import('./handlers/guildLogHandler.js');
        await handleEmojiUpdate(oldEmoji, newEmoji);
    } catch (error) {
        logger.error('Error in emojiUpdate handler', { error: error.message, stack: error.stack, guildId: newEmoji.guild?.id });
    }
});

// Handle sticker events
client.on('stickerCreate', async (sticker) => {
    try {
        const { handleStickerCreate } = await import('./handlers/guildLogHandler.js');
        await handleStickerCreate(sticker);
    } catch (error) {
        logger.error('Error in stickerCreate handler', { error: error.message, stack: error.stack, guildId: sticker.guild?.id });
    }
});

client.on('stickerDelete', async (sticker) => {
    try {
        const { handleStickerDelete } = await import('./handlers/guildLogHandler.js');
        await handleStickerDelete(sticker);
    } catch (error) {
        logger.error('Error in stickerDelete handler', { error: error.message, stack: error.stack, guildId: sticker.guild?.id });
    }
});

client.on('stickerUpdate', async (oldSticker, newSticker) => {
    try {
        const { handleStickerUpdate } = await import('./handlers/guildLogHandler.js');
        await handleStickerUpdate(oldSticker, newSticker);
    } catch (error) {
        logger.error('Error in stickerUpdate handler', { error: error.message, stack: error.stack, guildId: newSticker.guild?.id });
    }
});

// Handle invite events
client.on('inviteCreate', async (invite) => {
    try {
        const { handleInviteCreate } = await import('./handlers/inviteLogHandler.js');
        await handleInviteCreate(invite);
    } catch (error) {
        logger.error('Error in inviteCreate handler', { error: error.message, stack: error.stack, guildId: invite.guild?.id });
    }
});

client.on('inviteDelete', async (invite) => {
    try {
        const { handleInviteDelete } = await import('./handlers/inviteLogHandler.js');
        await handleInviteDelete(invite);
    } catch (error) {
        logger.error('Error in inviteDelete handler', { error: error.message, stack: error.stack, guildId: invite.guild?.id });
    }
});

// Handle thread events
client.on('threadCreate', async (thread) => {
    try {
        const { handleThreadCreate } = await import('./handlers/threadLogHandler.js');
        await handleThreadCreate(thread);
    } catch (error) {
        logger.error('Error in threadCreate handler', { error: error.message, stack: error.stack, guildId: thread.guild?.id, channelId: thread.id });
    }
});

client.on('threadDelete', async (thread) => {
    try {
        const { handleThreadDelete } = await import('./handlers/threadLogHandler.js');
        await handleThreadDelete(thread);
    } catch (error) {
        logger.error('Error in threadDelete handler', { error: error.message, stack: error.stack, guildId: thread.guild?.id, channelId: thread.id });
    }
});

client.on('threadUpdate', async (oldThread, newThread) => {
    try {
        const { handleThreadUpdate } = await import('./handlers/threadLogHandler.js');
        await handleThreadUpdate(oldThread, newThread);
    } catch (error) {
        logger.error('Error in threadUpdate handler', { error: error.message, stack: error.stack, guildId: newThread.guild?.id, channelId: newThread.id });
    }
});

// When the client is ready, run this code (only once)
client.once('ready', async () => {
    console.log(`✅ ${client.user.tag} está online!`);
    logger.info('Client ready', { botTag: client.user.tag, botId: client.user.id });
    
    // Inicializar sessões de voz para usuários que já estão em calls
    try {
        const { initializeVoiceSessions } = await import('./handlers/voiceStateHandler.js');
        await initializeVoiceSessions(client);
    } catch (error) {
        logger.error('Error initializing voice sessions', { error: error.message, stack: error.stack });
    }
    
    // Log de inicialização do bot
    try {
        const { logBotStartup, logBotHealth } = await import('./handlers/systemLogHandler.js');
        await logBotStartup(client);
        // Enviar um log de saúde imediatamente na inicialização (apenas no console/local)
        await logBotHealth(client);
        // Iniciar log periódico de saúde do bot a cada 30 minutos
        setInterval(() => {
            logBotHealth(client).catch(() => {});
        }, 30 * 60 * 1000);
    } catch (error) {
        logger.error('Error logging bot startup', { error: error.message, stack: error.stack });
    }
    
    // Registrar comandos automaticamente
    try {
        console.log('🔄 Iniciando registro de comandos...');
        const token = process.env.DISCORD_TOKEN;
        if (!token) {
            console.warn('⚠️ Token do Discord não encontrado. Configure DISCORD_TOKEN no .env');
            console.warn('   O bot continuará funcionando, mas os comandos podem não estar atualizados.');
            return; // Não fazer o bot crashear
        }
        
        const success = await registerCommands(
            token,
            client.user.id  // Usando o ID do cliente diretamente
        );
        
        if (!success) {
            console.warn('⚠️ Falha ao registrar comandos. O bot continuará funcionando.');
            console.warn('   Os comandos podem não estar atualizados. Tente reiniciar o bot mais tarde.');
        }
    } catch (error) {
        // Não fazer o bot crashear por problemas ao registrar comandos
        const isNetworkError = error.code === 'UND_ERR_CONNECT_TIMEOUT' ||
                              error.code === 'ETIMEDOUT' ||
                              error.code === 'ECONNRESET' ||
                              error.code === 'ENOTFOUND' ||
                              error.name === 'ConnectTimeoutError';
        
        if (isNetworkError) {
            console.warn('⚠️ Erro de conexão ao registrar comandos. O bot continuará funcionando.');
            console.warn('   Verifique sua conexão com a internet e tente reiniciar o bot mais tarde.');
        } else {
            logger.error('Erro ao registrar comandos (não relacionado a rede)', { error: error.message || String(error), stack: error.stack });
            console.warn('   O bot continuará funcionando, mas os comandos podem não estar atualizados.');
        }
    }
    
    
    // Iniciar a presença personalizada
    updatePresence(client);

    // A partir daqui, encaminhar logs para o webhook de console
    enableConsoleWebhookForwarding();
    // Enviar um único log de "bot pronto" que irá para o webhook
    logger.info('Bot pronto para uso', {
        botTag: client.user.tag,
        botId: client.user.id,
        guildsCount: client.guilds.cache.size,
        usersCount: client.users.cache.size
    });
});

// Handle interactions
client.on('interactionCreate', async (interaction) => {
    try {
        // Log de comando executado
        if (interaction.isChatInputCommand()) {
            try {
                const { logCommandExecution } = await import('./handlers/systemLogHandler.js');
                await logCommandExecution(interaction, interaction.commandName);
            } catch (logError) {
                // Não interromper o fluxo se o log falhar
            }
        }
        
        await handleInteraction(interaction, client);
    } catch (error) {
        console.error('Erro ao processar interação:', error);
        
        // Log de erro em comando
        if (interaction.isChatInputCommand()) {
            try {
                const { logCommandError } = await import('./handlers/systemLogHandler.js');
                await logCommandError(interaction, interaction.commandName, error);
            } catch (logError) {
                // Não interromper o fluxo se o log falhar
            }
        }
    }
});

// Tratamento global de erros não capturados
process.on('uncaughtException', (error) => {
    const isNetworkError = error.code === 'UND_ERR_CONNECT_TIMEOUT' ||
                          error.code === 'ETIMEDOUT' ||
                          error.code === 'ECONNRESET' ||
                          error.code === 'ENOTFOUND' ||
                          error.code === 'ECONNREFUSED' ||
                          error.name === 'ConnectTimeoutError';
    
    if (isNetworkError) {
        console.warn('⚠️ Erro de conexão não tratado (uncaughtException):', error.message);
        console.warn('   O bot continuará funcionando. Verifique sua conexão com a internet.');
        return; // Não fazer o bot crashear
    }
    
    logger.error('Erro não tratado (uncaughtException)', { error: error.message, stack: error.stack });
    // Para erros críticos que não são de rede, ainda podemos deixar o bot continuar
    // ou fazer um graceful shutdown dependendo do tipo de erro
});

process.on('unhandledRejection', (reason, promise) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    const isNetworkError = error.code === 'UND_ERR_CONNECT_TIMEOUT' ||
                          error.code === 'ETIMEDOUT' ||
                          error.code === 'ECONNRESET' ||
                          error.code === 'ENOTFOUND' ||
                          error.code === 'ECONNREFUSED' ||
                          error.name === 'ConnectTimeoutError';
    
    if (isNetworkError) {
        console.warn('⚠️ Promise rejeitada por erro de conexão (unhandledRejection):', error.message);
        console.warn('   O bot continuará funcionando. Verifique sua conexão com a internet.');
        return; // Não fazer o bot crashear
    }
    
    logger.error('Promise rejeitada não tratada (unhandledRejection)', { error: error.message, stack: error.stack });
});

// Login to Discord with your client's token
const token = process.env.DISCORD_TOKEN;
if (!token) {
    logger.error('Token do Discord não encontrado! Configure DISCORD_TOKEN no .env');
    process.exit(1);
}
client.login(token);
