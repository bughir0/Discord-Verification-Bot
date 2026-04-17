import { sendLogWithFallback } from '../utils/logUtils.js';
import { getColors } from '../utils/configHelper.js';
import logger from '../utils/logger.js';

export async function handleThreadCreate(thread) {
    try {
        if (!thread.guild) return;

        const colors = getColors();
        const embed = {
            title: '🧵 Thread Criada',
            color: colors.success,
            description: `Uma nova thread foi criada: ${thread}`,
            fields: [
                {
                    name: '📝 Nome',
                    value: `\`${thread.name}\``,
                    inline: true
                },
                {
                    name: '📝 Canal Pai',
                    value: thread.parent ? `${thread.parent}` : 'Desconhecido',
                    inline: true
                },
                {
                    name: '👤 Criado por',
                    value: thread.ownerId ? `<@${thread.ownerId}>` : 'Desconhecido',
                    inline: true
                },
                {
                    name: '🆔 ID',
                    value: `\`${thread.id}\``,
                    inline: true
                }
            ],
            footer: `Thread ID: ${thread.id}`,
            timestamp: true
        };

        await sendLogWithFallback(thread.guild, ['log', 'modLogs'], embed);

        logger.info('Log de thread criada enviado', {
            guildId: thread.guild.id,
            threadId: thread.id,
            threadName: thread.name
        });
    } catch (error) {
        logger.error('Erro ao processar thread criada', {
            error: error.message,
            guildId: thread.guild?.id,
            threadId: thread.id
        });
    }
}

export async function handleThreadDelete(thread) {
    try {
        if (!thread.guild) return;

        const colors = getColors();
        const embed = {
            title: '🗑️ Thread Deletada',
            color: colors.danger,
            description: `Uma thread foi deletada: \`${thread.name}\``,
            fields: [
                {
                    name: '📝 Nome',
                    value: `\`${thread.name}\``,
                    inline: true
                },
                {
                    name: '🆔 ID',
                    value: `\`${thread.id}\``,
                    inline: true
                }
            ],
            footer: `Thread ID: ${thread.id}`,
            timestamp: true
        };

        await sendLogWithFallback(thread.guild, ['log', 'modLogs'], embed);

        logger.info('Log de thread deletada enviado', {
            guildId: thread.guild.id,
            threadId: thread.id
        });
    } catch (error) {
        logger.error('Erro ao processar thread deletada', {
            error: error.message,
            guildId: thread.guild?.id,
            threadId: thread.id
        });
    }
}

export async function handleThreadUpdate(oldThread, newThread) {
    try {
        if (!newThread.guild) return;

        const colors = getColors();
        const changes = [];

        if (oldThread.name !== newThread.name) {
            changes.push({
                name: '📝 Nome',
                value: `**Antes:** \`${oldThread.name}\`\n**Depois:** \`${newThread.name}\``,
                inline: false
            });
        }

        if (oldThread.archived !== newThread.archived) {
            changes.push({
                name: '📦 Status',
                value: newThread.archived ? 'Thread arquivada' : 'Thread desarquivada',
                inline: true
            });
        }

        if (oldThread.locked !== newThread.locked) {
            changes.push({
                name: '🔒 Status',
                value: newThread.locked ? 'Thread bloqueada' : 'Thread desbloqueada',
                inline: true
            });
        }

        if (changes.length === 0) return;

        const embed = {
            title: '✏️ Thread Editada',
            color: colors.warning,
            description: `A thread ${newThread} foi modificada`,
            fields: [
                {
                    name: '🧵 Thread',
                    value: `${newThread} (\`${newThread.name}\`)`,
                    inline: true
                },
                {
                    name: '🆔 ID',
                    value: `\`${newThread.id}\``,
                    inline: true
                },
                ...changes
            ],
            footer: `Thread ID: ${newThread.id}`,
            timestamp: true
        };

        await sendLogWithFallback(newThread.guild, ['log', 'modLogs'], embed);

        logger.info('Log de thread editada enviado', {
            guildId: newThread.guild.id,
            threadId: newThread.id
        });
    } catch (error) {
        logger.error('Erro ao processar thread editada', {
            error: error.message,
            guildId: newThread.guild?.id,
            threadId: newThread.id
        });
    }
}

