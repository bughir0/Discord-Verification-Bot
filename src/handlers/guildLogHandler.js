import { EmbedBuilder } from 'discord.js';
import { sendLogWithFallback } from '../utils/logUtils.js';
import { getColors } from '../utils/configHelper.js';
import logger from '../utils/logger.js';

export async function handleGuildUpdate(oldGuild, newGuild) {
    try {
        const colors = getColors();
        const changes = [];

        // Nome
        if (oldGuild.name !== newGuild.name) {
            changes.push({
                name: '📝 Nome',
                value: `**Antes:** \`${oldGuild.name}\`\n**Depois:** \`${newGuild.name}\``,
                inline: false
            });
        }

        // Ícone
        let oldIconURL = null;
        let newIconURL = null;
        if (oldGuild.iconURL() !== newGuild.iconURL()) {
            oldIconURL = oldGuild.iconURL({ dynamic: true, size: 256 });
            newIconURL = newGuild.iconURL({ dynamic: true, size: 256 });
            
            let iconValue = '';
            if (oldIconURL && newIconURL) {
                iconValue = `**Antes:** [Ver ícone antigo](${oldIconURL})\n**Depois:** [Ver novo ícone](${newIconURL})`;
            } else if (oldIconURL && !newIconURL) {
                iconValue = `**Antes:** [Ver ícone antigo](${oldIconURL})\n**Depois:** Ícone removido`;
            } else if (!oldIconURL && newIconURL) {
                iconValue = `**Antes:** Sem ícone\n**Depois:** [Ver novo ícone](${newIconURL})`;
            } else {
                iconValue = 'Ícone removido';
            }
            
            changes.push({
                name: '🖼️ Ícone',
                value: iconValue,
                inline: false
            });
        }

        // Banner
        if (oldGuild.bannerURL() !== newGuild.bannerURL()) {
            changes.push({
                name: '🎨 Banner',
                value: newGuild.bannerURL() ? 'Banner atualizado' : 'Banner removido',
                inline: true
            });
        }

        // Descrição
        if (oldGuild.description !== newGuild.description) {
            const oldDesc = oldGuild.description || '*Sem descrição*';
            const newDesc = newGuild.description || '*Sem descrição*';
            changes.push({
                name: '📄 Descrição',
                value: `**Antes:** ${oldDesc.length > 500 ? oldDesc.substring(0, 497) + '...' : oldDesc}\n**Depois:** ${newDesc.length > 500 ? newDesc.substring(0, 497) + '...' : newDesc}`,
                inline: false
            });
        }

        // Nível de verificação
        if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
            const levels = ['Nenhuma', 'Baixa', 'Média', 'Alta', 'Muito Alta'];
            changes.push({
                name: '🔒 Nível de Verificação',
                value: `**Antes:** ${levels[oldGuild.verificationLevel]}\n**Depois:** ${levels[newGuild.verificationLevel]}`,
                inline: true
            });
        }

        if (changes.length === 0) return;

        const embed = new EmbedBuilder()
            .setColor(colors.warning)
            .setTitle('⚙️ Servidor Atualizado')
            .setDescription('Configurações do servidor foram modificadas')
            .addFields(changes)
            .setFooter({ text: `Servidor ID: ${newGuild.id}` })
            .setTimestamp();

        // Adicionar imagens dos ícones se foram atualizados
        if (oldIconURL && newIconURL) {
            // Mostrar novo ícone como thumbnail e antigo como image
            embed.setThumbnail(newIconURL);
            embed.setImage(oldIconURL);
        } else if (newIconURL) {
            // Apenas novo ícone (quando não havia ícone antes)
            embed.setThumbnail(newIconURL);
        } else if (oldIconURL) {
            // Apenas ícone antigo (quando foi removido)
            embed.setThumbnail(oldIconURL);
        }

        await sendLogWithFallback(newGuild, ['log', 'modLogs'], {
            embed: embed
        });

        logger.info('Log de servidor atualizado enviado', {
            guildId: newGuild.id,
            changesCount: changes.length
        });
    } catch (error) {
        logger.error('Erro ao processar servidor atualizado', {
            error: error.message,
            guildId: newGuild.id
        });
    }
}

export async function handleGuildBoostLevelUp(guild, newLevel) {
    try {
        const colors = getColors();
        const embed = {
            title: '🚀 Boost do Servidor',
            color: colors.success,
            description: `O servidor alcançou o nível ${newLevel} de boost!`,
            fields: [
                {
                    name: '⭐ Nível',
                    value: `Nível ${newLevel}`,
                    inline: true
                },
                {
                    name: '💎 Boosters',
                    value: `${guild.premiumSubscriptionCount || 0} booster(s)`,
                    inline: true
                }
            ],
            footer: `Servidor: ${guild.name}`,
            timestamp: true
        };

        await sendLogWithFallback(guild, ['log', 'modLogs'], embed);

        logger.info('Log de boost level up enviado', {
            guildId: guild.id,
            level: newLevel
        });
    } catch (error) {
        logger.error('Erro ao processar boost level up', {
            error: error.message,
            guildId: guild.id
        });
    }
}

export async function handleEmojiCreate(emoji) {
    try {
        if (!emoji.guild) return;

        const colors = getColors();
        const embed = {
            title: '😀 Emoji Criado',
            color: colors.success,
            description: `Um novo emoji foi adicionado: ${emoji}`,
            fields: [
                {
                    name: '📝 Nome',
                    value: `\`${emoji.name}\``,
                    inline: true
                },
                {
                    name: '🆔 ID',
                    value: `\`${emoji.id}\``,
                    inline: true
                },
                {
                    name: '👤 Criado por',
                    value: emoji.author ? `${emoji.author.tag}` : 'Desconhecido',
                    inline: true
                },
                {
                    name: '🔗 Link',
                    value: `[Ver emoji](${emoji.url})`,
                    inline: false
                }
            ],
            thumbnail: emoji.url,
            footer: `Emoji ID: ${emoji.id}`,
            timestamp: true
        };

        await sendLogWithFallback(emoji.guild, ['log', 'modLogs'], embed);

        logger.info('Log de emoji criado enviado', {
            guildId: emoji.guild.id,
            emojiId: emoji.id,
            emojiName: emoji.name
        });
    } catch (error) {
        logger.error('Erro ao processar emoji criado', {
            error: error.message,
            guildId: emoji.guild?.id,
            emojiId: emoji.id
        });
    }
}

export async function handleEmojiDelete(emoji) {
    try {
        if (!emoji.guild) return;

        const colors = getColors();
        const embed = {
            title: '🗑️ Emoji Deletado',
            color: colors.danger,
            description: `Um emoji foi removido: \`${emoji.name}\``,
            fields: [
                {
                    name: '📝 Nome',
                    value: `\`${emoji.name}\``,
                    inline: true
                },
                {
                    name: '🆔 ID',
                    value: `\`${emoji.id}\``,
                    inline: true
                }
            ],
            footer: `Emoji ID: ${emoji.id}`,
            timestamp: true
        };

        await sendLogWithFallback(emoji.guild, ['log', 'modLogs'], embed);

        logger.info('Log de emoji deletado enviado', {
            guildId: emoji.guild.id,
            emojiId: emoji.id,
            emojiName: emoji.name
        });
    } catch (error) {
        logger.error('Erro ao processar emoji deletado', {
            error: error.message,
            guildId: emoji.guild?.id,
            emojiId: emoji.id
        });
    }
}

export async function handleEmojiUpdate(oldEmoji, newEmoji) {
    try {
        if (!newEmoji.guild) return;

        const colors = getColors();
        const changes = [];

        if (oldEmoji.name !== newEmoji.name) {
            changes.push({
                name: '📝 Nome',
                value: `**Antes:** \`${oldEmoji.name}\`\n**Depois:** \`${newEmoji.name}\``,
                inline: false
            });
        }

        if (changes.length === 0) return;

        const embed = {
            title: '✏️ Emoji Editado',
            color: colors.warning,
            description: `O emoji ${newEmoji} foi modificado`,
            fields: [
                {
                    name: '😀 Emoji',
                    value: `${newEmoji}`,
                    inline: true
                },
                {
                    name: '🆔 ID',
                    value: `\`${newEmoji.id}\``,
                    inline: true
                },
                ...changes
            ],
            thumbnail: newEmoji.url,
            footer: `Emoji ID: ${newEmoji.id}`,
            timestamp: true
        };

        await sendLogWithFallback(newEmoji.guild, ['log', 'modLogs'], embed);

        logger.info('Log de emoji editado enviado', {
            guildId: newEmoji.guild.id,
            emojiId: newEmoji.id
        });
    } catch (error) {
        logger.error('Erro ao processar emoji editado', {
            error: error.message,
            guildId: newEmoji.guild?.id,
            emojiId: newEmoji.id
        });
    }
}

export async function handleStickerCreate(sticker) {
    try {
        if (!sticker.guild) return;

        const colors = getColors();
        const embed = {
            title: '🎨 Sticker Criado',
            color: colors.success,
            description: `Um novo sticker foi adicionado: ${sticker.name}`,
            fields: [
                {
                    name: '📝 Nome',
                    value: `\`${sticker.name}\``,
                    inline: true
                },
                {
                    name: '🆔 ID',
                    value: `\`${sticker.id}\``,
                    inline: true
                },
                {
                    name: '📋 Descrição',
                    value: sticker.description || '*Sem descrição*',
                    inline: false
                }
            ],
            thumbnail: sticker.url,
            footer: `Sticker ID: ${sticker.id}`,
            timestamp: true
        };

        await sendLogWithFallback(sticker.guild, ['log', 'modLogs'], embed);

        logger.info('Log de sticker criado enviado', {
            guildId: sticker.guild.id,
            stickerId: sticker.id,
            stickerName: sticker.name
        });
    } catch (error) {
        logger.error('Erro ao processar sticker criado', {
            error: error.message,
            guildId: sticker.guild?.id,
            stickerId: sticker.id
        });
    }
}

export async function handleStickerDelete(sticker) {
    try {
        if (!sticker.guild) return;

        const colors = getColors();
        const embed = {
            title: '🗑️ Sticker Deletado',
            color: colors.danger,
            description: `Um sticker foi removido: \`${sticker.name}\``,
            fields: [
                {
                    name: '📝 Nome',
                    value: `\`${sticker.name}\``,
                    inline: true
                },
                {
                    name: '🆔 ID',
                    value: `\`${sticker.id}\``,
                    inline: true
                }
            ],
            footer: `Sticker ID: ${sticker.id}`,
            timestamp: true
        };

        await sendLogWithFallback(sticker.guild, ['log', 'modLogs'], embed);

        logger.info('Log de sticker deletado enviado', {
            guildId: sticker.guild.id,
            stickerId: sticker.id,
            stickerName: sticker.name
        });
    } catch (error) {
        logger.error('Erro ao processar sticker deletado', {
            error: error.message,
            guildId: sticker.guild?.id,
            stickerId: sticker.id
        });
    }
}

export async function handleStickerUpdate(oldSticker, newSticker) {
    try {
        if (!newSticker.guild) return;

        const colors = getColors();
        const changes = [];

        if (oldSticker.name !== newSticker.name) {
            changes.push({
                name: '📝 Nome',
                value: `**Antes:** \`${oldSticker.name}\`\n**Depois:** \`${newSticker.name}\``,
                inline: false
            });
        }

        if (oldSticker.description !== newSticker.description) {
            changes.push({
                name: '📋 Descrição',
                value: `**Antes:** ${oldSticker.description || '*Sem descrição*'}\n**Depois:** ${newSticker.description || '*Sem descrição*'}`,
                inline: false
            });
        }

        if (changes.length === 0) return;

        const embed = {
            title: '✏️ Sticker Editado',
            color: colors.warning,
            description: `O sticker ${newSticker.name} foi modificado`,
            fields: [
                {
                    name: '🎨 Sticker',
                    value: `\`${newSticker.name}\``,
                    inline: true
                },
                {
                    name: '🆔 ID',
                    value: `\`${newSticker.id}\``,
                    inline: true
                },
                ...changes
            ],
            thumbnail: newSticker.url,
            footer: `Sticker ID: ${newSticker.id}`,
            timestamp: true
        };

        await sendLogWithFallback(newSticker.guild, ['log', 'modLogs'], embed);

        logger.info('Log de sticker editado enviado', {
            guildId: newSticker.guild.id,
            stickerId: newSticker.id
        });
    } catch (error) {
        logger.error('Erro ao processar sticker editado', {
            error: error.message,
            guildId: newSticker.guild?.id,
            stickerId: newSticker.id
        });
    }
}

