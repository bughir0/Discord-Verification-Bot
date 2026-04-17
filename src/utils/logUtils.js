import { EmbedBuilder } from 'discord.js';
import { toV2FromEmbedBuilder } from './embedBuilderV2.js';
import { getChannelId, getColors } from './configHelper.js';
import logger from './logger.js';

/**
 * Envia um log para um canal específico
 * @param {import('discord.js').Guild} guild - Servidor
 * @param {string} channelType - Tipo de canal (log, modLogs, etc)
 * @param {Object} options - Opções do embed
 * @param {string} options.title - Título do embed
 * @param {string} options.description - Descrição do embed
 * @param {number} options.color - Cor do embed
 * @param {Array} options.fields - Campos do embed
 * @param {string} options.thumbnail - URL da thumbnail
 * @param {string} options.footer - Texto do footer
 * @param {string} options.author - Nome do autor
 * @param {string} options.authorIcon - Ícone do autor
 * @param {boolean} options.timestamp - Se deve adicionar timestamp
 * @returns {Promise<boolean>} True se enviado com sucesso
 */
export async function sendLog(guild, channelType, options = {}) {
    try {
        const logChannelId = getChannelId(guild.id, channelType);
        if (!logChannelId) {
            // Silencioso: não logar debug para evitar poluição do console
            return false;
        }

        const logChannel = guild.channels.cache.get(logChannelId);
        if (!logChannel) {
            // Silencioso: canal não existe mais, apenas não envia
            return false;
        }

        // Verificar permissões do bot
        const botMember = guild.members.me;
        if (!botMember) {
            logger.warning('Bot member não encontrado', { guildId: guild.id });
            return false;
        }

        const permissions = logChannel.permissionsFor(botMember);
        if (!permissions?.has(['SendMessages', 'EmbedLinks', 'ViewChannel'])) {
            logger.warning(`Bot não tem permissão para enviar logs em ${channelType}`, {
                guildId: guild.id,
                channelId: logChannel.id,
                missingPermissions: ['SendMessages', 'EmbedLinks', 'ViewChannel']
            });
            return false;
        }

        // Se options.embed foi fornecido, usar ele diretamente
        if (options.embed) {
            const e = options.embed instanceof EmbedBuilder ? options.embed : EmbedBuilder.from(options.embed);
            const sendOptions = { ...toV2FromEmbedBuilder(e) };
            // Adicionar arquivos se existirem
            if (options.files && options.files.length > 0) {
                // Verificar se tem permissão para anexar arquivos
                if (permissions?.has('AttachFiles')) {
                    sendOptions.files = options.files;
                } else {
                    logger.warning(`Bot não tem permissão para anexar arquivos em ${channelType}`, {
                        guildId: guild.id,
                        channelId: logChannel.id
                    });
                }
            }
            await logChannel.send(sendOptions);
            return true;
        }

        const colors = getColors();
        const embed = new EmbedBuilder()
            .setColor(options.color || colors.primary)
            .setTitle(options.title || '📝 Log')
            .setDescription(options.description || '');

        if (options.fields && options.fields.length > 0) {
            embed.addFields(options.fields);
        }

        if (options.thumbnail) {
            embed.setThumbnail(options.thumbnail);
        }

        if (options.footer) {
            embed.setFooter({ text: options.footer });
        }

        if (options.author) {
            embed.setAuthor({ 
                name: options.author,
                iconURL: options.authorIcon || guild.iconURL({ dynamic: true }) || undefined
            });
        }

        if (options.timestamp !== false) {
            embed.setTimestamp();
        }

        await logChannel.send({ ...toV2FromEmbedBuilder(embed) });
        return true;
    } catch (error) {
        logger.error(`Erro ao enviar log para ${channelType}`, {
            error: error.message,
            guildId: guild.id,
            channelType
        });
        return false;
    }
}

/**
 * Tenta enviar log em múltiplos canais (fallback)
 * @param {import('discord.js').Guild} guild - Servidor
 * @param {string[]} channelTypes - Tipos de canal a tentar (em ordem de prioridade)
 * @param {Object} options - Opções do embed
 * @param {EmbedBuilder} options.embed - Embed a enviar
 * @param {Array} options.files - Arquivos a anexar (opcional)
 * @returns {Promise<boolean>} True se enviado em pelo menos um canal
 */
export async function sendLogWithFallback(guild, channelTypes, options = {}) {
    for (const channelType of channelTypes) {
        const sent = await sendLog(guild, channelType, options);
        if (sent) return true;
    }
    return false;
}

