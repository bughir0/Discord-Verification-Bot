import { EmbedBuilder } from 'discord.js';
import { toEmbedReply } from './embedBuilderV2.js';
import { getChannelId, getColors } from './configHelper.js';
import logger from './logger.js';

/**
 * Cria um embed padronizado para ações de moderação
 * @param {Object} options - Opções para o embed
 * @param {string} options.action - Ação realizada (BAN, KICK, UNBAN)
 * @param {User} options.target - Usuário alvo
 * @param {User} options.moderator - Moderador que executou a ação
 * @param {string} options.reason - Motivo da ação
 * @param {string} [options.duration] - Duração (opcional, para bans temporários)
 * @param {string} options.color - Cor do embed
 * @returns {EmbedBuilder} - Embed pronto para ser enviado
 */
export function createModerationEmbed({ action, target, moderator, reason, duration, color, guildId }) {
    const actionText = {
        'BAN': 'Banido',
        'KICK': 'Expulso',
        'UNBAN': 'Desbanido'
    }[action] || 'Ação';

    const emoji = {
        'BAN': '🔨',
        'KICK': '👢',
        'UNBAN': '<a:sucesso:1443149628085244036>'
    }[action] || 'ℹ️';

    const colors = getColors();
    const embed = new EmbedBuilder()
        .setColor(color || colors.primary)
        .setTitle(`${emoji} ${actionText}: ${target.tag}`)
        .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
            { name: '👤 Usuário', value: `\`\`\`<@${target.id}> (${target.id})\`\`\``, inline: false },
            { name: '🛡️ Moderador', value: `\`\`\`<@${moderator.id}> (${moderator.id})\`\`\``, inline: false },
            { name: '📝 Motivo', value: `\`\`\`${reason || 'Não especificado'}\`\`\``, inline: false }
        )
        .setFooter({ text: `ID do usuário: ${target.id}`, iconURL: moderator.displayAvatarURL() })
        .setTimestamp();

    if (duration) {
        embed.addFields({ name: '⏱️ Duração', value: `\`\`\`${duration}\`\`\``, inline: false });
    }

    return embed;
}

/**
 * Registra uma ação de moderação no canal de logs
 * @param {Guild} guild - Servidor onde a ação ocorreu
 * @param {Object} data - Dados da ação
 * @param {string} data.action - Tipo de ação (BAN, KICK, UNBAN)
 * @param {User} data.target - Usuário alvo
 * @param {User} data.moderator - Moderador que executou a ação
 * @param {string} data.reason - Motivo da ação
 * @param {string} [data.duration] - Duração (opcional)
 */
export async function logModerationAction(guild, { action, target, moderator, reason, duration }) {
    try {
        const logChannelId = getChannelId(guild.id, 'modLogs');
        const logChannel = logChannelId ? guild.channels.cache.get(logChannelId) : null;
        if (!logChannel) {
            logger.warning('Canal de logs de moderação não encontrado', {
                action,
                guildId: guild.id,
                guildName: guild.name,
                channelId: logChannelId,
                targetId: target?.id,
                targetTag: target?.tag,
                moderatorId: moderator.id,
                moderatorTag: moderator.tag,
                suggestion: 'Configure usando /config canal tipo:modLogs'
            });
            return;
        }

        // Verificar permissões do bot
        const botMember = guild.members.me;
        if (!botMember) {
            logger.warning('Bot member não encontrado', { guildId: guild.id });
            return;
        }

        const permissions = logChannel.permissionsFor(botMember);
        if (!permissions?.has(['SendMessages', 'EmbedLinks'])) {
            logger.warning('Bot não tem permissão para enviar logs de moderação', {
                action,
                guildId: guild.id,
                guildName: guild.name,
                channelId: logChannel.id,
                channelName: logChannel.name,
                targetId: target.id,
                targetTag: target.tag,
                moderatorId: moderator.id,
                moderatorTag: moderator.tag,
                missingPermissions: ['SendMessages', 'EmbedLinks']
            });
            return;
        }

        const actionText = {
            'BAN': 'Banimento',
            'KICK': 'Expulsão',
            'UNBAN': 'Desbanimento'
        }[action] || 'Ação de Moderação';

        const colors = getColors();
        const embed = new EmbedBuilder()
            .setColor({
                'BAN': colors.danger,
                'KICK': colors.warning,
                'UNBAN': colors.success
            }[action] || colors.primary)
            .setTitle(`📝 ${actionText} - Log`)
            .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: '👤 Usuário', value: `${target.tag} (\`${target.id}\`)`, inline: true },
                { name: '🛡️ Moderador', value: `${moderator.tag} (\`${moderator.id}\`)`, inline: true },
                { name: '📅 Data', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: '📝 Motivo', value: reason || 'Não especificado', inline: false }
            )
            .setFooter({ text: `ID do usuário: ${target.id}` })
            .setTimestamp();

        if (duration) {
            embed.addFields({ name: '⏱️ Duração', value: duration, inline: true });
        }

        await logChannel.send({ ...toEmbedReply(embed) });

        // Registrar no logger com informações detalhadas
        logger.info(`${actionText} registrada no canal de logs`, {
            action,
            guildId: guild.id,
            guildName: guild.name,
            targetId: target.id,
            targetTag: target.tag,
            targetUsername: target.username,
            moderatorId: moderator.id,
            moderatorTag: moderator.tag,
            moderatorUsername: moderator.username,
            reason,
            duration,
            logChannelId: logChannel.id,
            logChannelName: logChannel.name,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Erro ao registrar ação de moderação', {
            action,
            guildId: guild.id,
            guildName: guild.name,
            targetId: target?.id,
            targetTag: target?.tag,
            moderatorId: moderator?.id,
            moderatorTag: moderator?.tag,
            error: error.message,
            stack: error.stack,
            code: error.code
        });
    }
}
