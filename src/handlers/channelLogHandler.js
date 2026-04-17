import { EmbedBuilder } from 'discord.js';
import { sendLogWithFallback } from '../utils/logUtils.js';
import { getColors } from '../utils/configHelper.js';
import logger from '../utils/logger.js';

export async function handleChannelCreate(channel) {
    try {
        if (!channel.guild) return;

        const colors = getColors();
        const channelType = channel.type === 0 ? 'Texto' : 
                           channel.type === 2 ? 'Voz' : 
                           channel.type === 4 ? 'Categoria' : 
                           channel.type === 5 ? 'Anúncio' : 
                           channel.type === 15 ? 'Fórum' : 
                           channel.type === 13 ? 'Stage' : 'Desconhecido';

        // Tentar descobrir quem criou o canal usando audit logs
        let creator = null;
        let creatorAvatar = null;
        try {
            const auditLogs = await channel.guild.fetchAuditLogs({
                limit: 1,
                type: 10 // CHANNEL_CREATE
            });
            const entry = auditLogs.entries.first();
            if (entry && entry.target.id === channel.id && Date.now() - entry.createdTimestamp < 5000) {
                creator = entry.executor;
                creatorAvatar = creator.displayAvatarURL({ dynamic: true, size: 256 });
            }
        } catch (error) {
            logger.debug('Erro ao buscar audit log de canal criado', { error: error.message });
        }

        const embed = new EmbedBuilder()
            .setColor(colors.success)
            .setTitle('📝 Canal Criado')
            .setDescription(`Um novo canal foi criado: ${channel}`)
            .addFields(
                {
                    name: '📝 Nome',
                    value: `\`${channel.name}\``,
                    inline: true
                },
                {
                    name: '🔢 Tipo',
                    value: channelType,
                    inline: true
                },
                {
                    name: '🆔 ID',
                    value: `\`${channel.id}\``,
                    inline: true
                }
            )
            .setFooter({ text: `Canal ID: ${channel.id}` })
            .setTimestamp();

        if (creator) {
            embed.addFields({
                name: '👤 Criado por',
                value: `${creator} (\`${creator.tag}\`)`,
                inline: true
            });
            embed.setThumbnail(creatorAvatar);
        }

        if (channel.parent) {
            embed.addFields({
                name: '📁 Categoria',
                value: `${channel.parent.name}`,
                inline: true
            });
        }

        await sendLogWithFallback(channel.guild, ['log', 'modLogs'], {
            embed: embed
        });

        logger.info('Log de canal criado enviado', {
            guildId: channel.guild.id,
            channelId: channel.id,
            channelName: channel.name,
            channelType: channelType
        });
    } catch (error) {
        logger.error('Erro ao processar canal criado', {
            error: error.message,
            guildId: channel.guild?.id,
            channelId: channel.id
        });
    }
}

export async function handleChannelDelete(channel) {
    try {
        if (!channel.guild) return;

        const colors = getColors();
        const channelType = channel.type === 0 ? 'Texto' : 
                           channel.type === 2 ? 'Voz' : 
                           channel.type === 4 ? 'Categoria' : 
                           channel.type === 5 ? 'Anúncio' : 
                           channel.type === 15 ? 'Fórum' : 
                           channel.type === 13 ? 'Stage' : 'Desconhecido';

        // Tentar descobrir quem deletou o canal usando audit logs
        let deleter = null;
        let deleterAvatar = null;
        try {
            const auditLogs = await channel.guild.fetchAuditLogs({
                limit: 1,
                type: 12 // CHANNEL_DELETE
            });
            const entry = auditLogs.entries.first();
            if (entry && entry.target?.id === channel.id && Date.now() - entry.createdTimestamp < 5000) {
                deleter = entry.executor;
                deleterAvatar = deleter.displayAvatarURL({ dynamic: true, size: 256 });
            }
        } catch (error) {
            logger.debug('Erro ao buscar audit log de canal deletado', { error: error.message });
        }

        const embed = new EmbedBuilder()
            .setColor(colors.danger)
            .setTitle('🗑️ Canal Deletado')
            .setDescription(`Um canal foi deletado: \`${channel.name}\``)
            .addFields(
                {
                    name: '📝 Nome',
                    value: `\`${channel.name}\``,
                    inline: true
                },
                {
                    name: '🔢 Tipo',
                    value: channelType,
                    inline: true
                },
                {
                    name: '🆔 ID',
                    value: `\`${channel.id}\``,
                    inline: true
                }
            )
            .setFooter({ text: `Canal ID: ${channel.id}` })
            .setTimestamp();

        if (deleter) {
            embed.addFields({
                name: '👤 Deletado por',
                value: `${deleter} (\`${deleter.tag}\`)`,
                inline: true
            });
            embed.setThumbnail(deleterAvatar);
        }

        if (channel.parent) {
            embed.addFields({
                name: '📁 Categoria',
                value: `${channel.parent.name}`,
                inline: true
            });
        }

        await sendLogWithFallback(channel.guild, ['log', 'modLogs'], {
            embed: embed
        });

        logger.info('Log de canal deletado enviado', {
            guildId: channel.guild.id,
            channelId: channel.id,
            channelName: channel.name,
            channelType: channelType
        });
    } catch (error) {
        logger.error('Erro ao processar canal deletado', {
            error: error.message,
            guildId: channel.guild?.id,
            channelId: channel.id
        });
    }
}

export async function handleChannelUpdate(oldChannel, newChannel) {
    try {
        if (!newChannel.guild) return;

        const colors = getColors();
        const changes = [];

        // Nome
        if (oldChannel.name !== newChannel.name) {
            changes.push({
                name: '📝 Nome',
                value: `**Antes:** \`${oldChannel.name}\`\n**Depois:** \`${newChannel.name}\``,
                inline: false
            });
        }

        // Tópico (apenas para canais de texto)
        if (oldChannel.topic !== newChannel.topic) {
            const oldTopic = oldChannel.topic || '*Sem tópico*';
            const newTopic = newChannel.topic || '*Sem tópico*';
            changes.push({
                name: '💬 Tópico',
                value: `**Antes:** ${oldTopic.length > 500 ? oldTopic.substring(0, 497) + '...' : oldTopic}\n**Depois:** ${newTopic.length > 500 ? newTopic.substring(0, 497) + '...' : newTopic}`,
                inline: false
            });
        }

        // Categoria
        if (oldChannel.parentId !== newChannel.parentId) {
            const oldParent = oldChannel.parent ? oldChannel.parent.name : 'Nenhuma';
            const newParent = newChannel.parent ? newChannel.parent.name : 'Nenhuma';
            changes.push({
                name: '📁 Categoria',
                value: `**Antes:** ${oldParent}\n**Depois:** ${newParent}`,
                inline: false
            });
        }

        // NSFW
        if (oldChannel.nsfw !== newChannel.nsfw) {
            changes.push({
                name: '🔞 NSFW',
                value: `**Antes:** ${oldChannel.nsfw ? 'Sim' : 'Não'}\n**Depois:** ${newChannel.nsfw ? 'Sim' : 'Não'}`,
                inline: true
            });
        }

        // Rate Limit (slowmode)
        if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
            changes.push({
                name: '⏱️ Slowmode',
                value: `**Antes:** ${oldChannel.rateLimitPerUser}s\n**Depois:** ${newChannel.rateLimitPerUser}s`,
                inline: true
            });
        }

        // Posição
        if (oldChannel.position !== newChannel.position) {
            changes.push({
                name: '📍 Posição',
                value: `**Antes:** ${oldChannel.position}\n**Depois:** ${newChannel.position}`,
                inline: true
            });
        }

        if (changes.length === 0) return; // Sem mudanças relevantes

        // Tentar descobrir quem editou o canal usando audit logs
        let editor = null;
        let editorAvatar = null;
        try {
            const auditLogs = await newChannel.guild.fetchAuditLogs({
                limit: 1,
                type: 11 // CHANNEL_UPDATE
            });
            const entry = auditLogs.entries.first();
            if (entry && entry.target?.id === newChannel.id && Date.now() - entry.createdTimestamp < 5000) {
                editor = entry.executor;
                editorAvatar = editor.displayAvatarURL({ dynamic: true, size: 256 });
            }
        } catch (error) {
            logger.debug('Erro ao buscar audit log de canal editado', { error: error.message });
        }

        const embed = new EmbedBuilder()
            .setColor(colors.warning)
            .setTitle('✏️ Canal Editado')
            .setDescription(`O canal ${newChannel} foi modificado`)
            .addFields(
                {
                    name: '📝 Canal',
                    value: `${newChannel} (\`${newChannel.name}\`)`,
                    inline: true
                },
                {
                    name: '🆔 ID',
                    value: `\`${newChannel.id}\``,
                    inline: true
                },
                ...changes
            )
            .setFooter({ text: `Canal ID: ${newChannel.id}` })
            .setTimestamp();

        if (editor) {
            embed.addFields({
                name: '👤 Editado por',
                value: `${editor} (\`${editor.tag}\`)`,
                inline: true
            });
            embed.setThumbnail(editorAvatar);
        }

        await sendLogWithFallback(newChannel.guild, ['log', 'modLogs'], {
            embed: embed
        });

        logger.info('Log de canal editado enviado', {
            guildId: newChannel.guild.id,
            channelId: newChannel.id,
            changesCount: changes.length
        });
    } catch (error) {
        logger.error('Erro ao processar canal editado', {
            error: error.message,
            guildId: newChannel.guild?.id,
            channelId: newChannel.id
        });
    }
}

