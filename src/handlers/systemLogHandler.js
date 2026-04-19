import logger from '../utils/logger.js';
import { sendLogWithFallback } from '../utils/logUtils.js';
import { getColors } from '../utils/configHelper.js';
import os from 'os';

/**
 * Log de erro crítico do sistema
 */
export function logSystemError(error, context = {}) {
    logger.error('Erro crítico do sistema', {
        error: error.message,
        stack: error.stack,
        ...context
    });
}

/**
 * Log de comando executado
 */
export async function logCommandExecution(interaction, commandName) {
    try {
        if (!interaction.guild) return;

        logger.info('Comando executado', {
            command: commandName,
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            guildId: interaction.guild.id,
            channelId: interaction.channel?.id
        });
    } catch (error) {
        logger.error('Erro ao logar execução de comando', {
            error: error.message
        });
    }
}

/**
 * Log de erro em comando
 */
export async function logCommandError(interaction, commandName, error) {
    try {
        if (!interaction.guild) return;

        const colors = getColors();
        const embed = {
            title: '❌ Erro em Comando',
            color: colors.danger,
            description: `Ocorreu um erro ao executar o comando \`/${commandName}\``,
            fields: [
                {
                    name: '👤 Usuário',
                    value: `<@${interaction.user.id}> (\`${interaction.user.tag}\`)`,
                    inline: true
                },
                {
                    name: '📝 Comando',
                    value: `\`/${commandName}\``,
                    inline: true
                },
                {
                    name: '📝 Canal',
                    value: interaction.channel ? `${interaction.channel}` : 'DM',
                    inline: true
                },
                {
                    name: '❌ Erro',
                    value: `\`\`\`${error.message.substring(0, 1000)}\`\`\``,
                    inline: false
                }
            ],
            footer: `ID: ${interaction.id}`,
            timestamp: true
        };

        await sendLogWithFallback(interaction.guild, ['log', 'modLogs'], embed);

        logger.error('Erro em comando', {
            command: commandName,
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            guildId: interaction.guild.id,
            error: error.message,
            stack: error.stack
        });
    } catch (logError) {
        logger.error('Erro ao logar erro de comando', {
            error: logError.message,
            originalError: error.message
        });
    }
}

/**
 * Log de timeout de interação
 */
export async function logInteractionTimeout(interaction, commandName) {
    try {
        logger.warning('Interação expirada', {
            command: commandName,
            userId: interaction.user?.id,
            interactionId: interaction.id
        });
    } catch (error) {
        logger.error('Erro ao logar timeout de interação', {
            error: error.message
        });
    }
}

/**
 * Log de rate limit
 */
export function logRateLimit(endpoint, retryAfter) {
    logger.warning('Rate limit atingido', {
        endpoint,
        retryAfter: `${retryAfter}ms`
    });
}

/**
 * Log de bot iniciado
 */
export async function logBotStartup(client) {
    try {
        logger.info('Bot iniciado com sucesso', {
            botTag: client.user.tag,
            botId: client.user.id,
            guildsCount: client.guilds.cache.size,
            usersCount: client.users.cache.size
        });
    } catch (error) {
        logger.error('Erro ao logar inicialização do bot', {
            error: error.message
        });
    }
}

/**
 * Log periódico de saúde do bot (uptime, memória, ping)
 * Agora enviado APENAS via webhook de console (através do logger/console),
 * e não mais pelos canais configurados de log/modLogs.
 */
export async function logBotHealth(client) {
    try {
        if (!client?.user) return;
        const colors = getColors();
        const memoryUsage = process.memoryUsage();
        const botMemory = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        const totalMemory = Math.round(os.totalmem() / 1024 / 1024 / 1024);
        const freeMemory = Math.round(os.freemem() / 1024 / 1024 / 1024);
        const usedMemory = totalMemory - freeMemory;

        const uptimeSeconds = Math.floor(process.uptime());
        const uptimeMinutes = Math.floor(uptimeSeconds / 60);
        const uptimeHours = Math.floor(uptimeMinutes / 60);
        const uptimeDays = Math.floor(uptimeHours / 24);
        const uptimeFormatted = `${uptimeDays}d ${uptimeHours % 24}h ${uptimeMinutes % 60}m ${uptimeSeconds % 60}s`;

        // Logar via logger/console; o consoleWebhookLogger replica isso para o webhook de console
        logger.info('Status periódico do bot', {
            botTag: client.user.tag,
            botId: client.user.id,
            uptime: uptimeFormatted,
            guildsCount: client.guilds.cache.size,
            usersCount: client.users.cache.size,
            botMemoryMB: botMemory,
            systemMemory: {
                totalGB: totalMemory,
                usedGB: usedMemory,
                freeGB: freeMemory
            },
            pingWS: client.ws.ping
        });
    } catch (error) {
        logger.error('Erro ao logar saúde do bot', {
            error: error.message
        });
    }
}

