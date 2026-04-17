import { sendLogWithFallback } from '../utils/logUtils.js';
import { getColors } from '../utils/configHelper.js';
import logger from '../utils/logger.js';

export async function handleInviteCreate(invite) {
    try {
        if (!invite.guild) return;

        const colors = getColors();
        const embed = {
            title: '🔗 Convite Criado',
            color: colors.success,
            description: `Um novo convite foi criado`,
            fields: [
                {
                    name: '👤 Criado por',
                    value: invite.inviter ? `${invite.inviter.tag} (\`${invite.inviter.id}\`)` : 'Desconhecido',
                    inline: true
                },
                {
                    name: '📝 Canal',
                    value: invite.channel ? `${invite.channel} (\`${invite.channel.name}\`)` : 'Todos os canais',
                    inline: true
                },
                {
                    name: '🔗 Código',
                    value: `\`${invite.code}\``,
                    inline: true
                },
                {
                    name: '⏱️ Expira em',
                    value: invite.expiresAt ? `<t:${Math.floor(invite.expiresAt.getTime() / 1000)}:R>` : 'Nunca',
                    inline: true
                },
                {
                    name: '👥 Usos Máximos',
                    value: invite.maxUses ? `${invite.maxUses} uso(s)` : 'Ilimitado',
                    inline: true
                },
                {
                    name: '🔗 Link',
                    value: `https://discord.gg/${invite.code}`,
                    inline: false
                }
            ],
            footer: `Convite ID: ${invite.code}`,
            timestamp: true
        };

        await sendLogWithFallback(invite.guild, ['log', 'modLogs'], embed);

        logger.info('Log de convite criado enviado', {
            guildId: invite.guild.id,
            inviteCode: invite.code,
            inviterId: invite.inviter?.id,
            channelId: invite.channel?.id
        });
    } catch (error) {
        logger.error('Erro ao processar convite criado', {
            error: error.message,
            guildId: invite.guild?.id,
            inviteCode: invite.code
        });
    }
}

export async function handleInviteDelete(invite) {
    try {
        if (!invite.guild) return;

        const colors = getColors();
        const embed = {
            title: '🗑️ Convite Deletado',
            color: colors.danger,
            description: `Um convite foi removido`,
            fields: [
                {
                    name: '🔗 Código',
                    value: `\`${invite.code}\``,
                    inline: true
                },
                {
                    name: '📝 Canal',
                    value: invite.channel ? `${invite.channel.name}` : 'Todos os canais',
                    inline: true
                }
            ],
            footer: `Convite: ${invite.code}`,
            timestamp: true
        };

        await sendLogWithFallback(invite.guild, ['log', 'modLogs'], embed);

        logger.info('Log de convite deletado enviado', {
            guildId: invite.guild.id,
            inviteCode: invite.code
        });
    } catch (error) {
        logger.error('Erro ao processar convite deletado', {
            error: error.message,
            guildId: invite.guild?.id,
            inviteCode: invite.code
        });
    }
}

