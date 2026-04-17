import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { mergeV2WithRows, toV2FromEmbedBuilder } from '../utils/embedBuilderV2.js';

import { database as db } from '../database/database.js';
import { getColors, hasStaffRole } from '../utils/configHelper.js';
import logger from '../utils/logger.js';
import { writeWhitelist } from '../utils/sftpWhitelist.js';

async function handleWhitelistClear(interaction) {
    try {
        // Verificar se o usuário tem permissão de staff
        if (!hasStaffRole(interaction.member)) {
            const colors = getColors();
            const embed = new EmbedBuilder()
                .setColor(colors.danger || 0xe74c3c)
                .setTitle('❌ Acesso Negado')
                .setDescription('Apenas membros da equipe podem usar este comando.')
                .setFooter({ text: 'Permissão Negada', iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            return await interaction.reply(toV2FromEmbedBuilder(embed, true));
        }

        await interaction.deferReply({ ephemeral: true });

        // Contar quantas whitelists existem antes de limpar
        const approvedWhitelists = db.getApprovedWhitelists();
        const pendingWhitelists = db.getPendingWhitelists();
        const totalWhitelists = approvedWhitelists.length + pendingWhitelists.length;

        if (totalWhitelists === 0) {
            const colors = getColors();
            const embed = new EmbedBuilder()
                .setColor(colors.warning || 0xf39c12)
                .setTitle('⚠️ Whitelist Já Está Vazia')
                .setDescription('Não há whitelists para limpar.')
                .setFooter({ text: 'Aviso', iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            return await interaction.editReply(toV2FromEmbedBuilder(embed, true));
        }

        // Mostrar confirmação
        const colors = getColors();
        const confirmEmbed = new EmbedBuilder()
            .setColor(colors.danger || 0xe74c3c)
            .setTitle('⚠️ Confirmar Limpeza Completa')
            .setDescription('**ATENÇÃO:** Esta ação irá **LIMPAR TODAS** as whitelists do servidor!')
            .addFields(
                {
                    name: '📊 Estatísticas',
                    value: `**Total:** ${totalWhitelists} whitelist(s)\n**Aprovadas:** ${approvedWhitelists.length}\n**Pendentes:** ${pendingWhitelists.length}`,
                    inline: false
                },
                {
                    name: '📋 O que acontecerá',
                    value: '• **TODAS** as whitelists serão removidas do banco de dados\n• O servidor Minecraft será limpo via SFTP\n• **Esta ação NÃO pode ser desfeita facilmente**',
                    inline: false
                }
            )
            .setFooter({ text: 'Esta é uma ação irreversível!', iconURL: interaction.guild.iconURL() })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`wl_clear_confirm_${interaction.user.id}`)
                    .setLabel('Sim, Limpar Tudo')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🗑️'),
                new ButtonBuilder()
                    .setCustomId(`wl_clear_cancel_${interaction.user.id}`)
                    .setLabel('Cancelar')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('↩️')
            );

        return await interaction.editReply({
            ...mergeV2WithRows(toV2FromEmbedBuilder(confirmEmbed, true), [row])
        });
    } catch (error) {
        logger.error('Erro ao processar comando wl-clear', {
            error: error.message,
            stack: error.stack,
            userId: interaction.user.id
        });

        const colors = getColors();
        const errorEmbed = new EmbedBuilder()
            .setColor(colors.danger || 0xe74c3c)
            .setTitle('❌ Erro')
            .setDescription('Ocorreu um erro ao processar o comando.')
            .setFooter({ text: 'Erro', iconURL: interaction.guild?.iconURL() })
            .setTimestamp();

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply(toV2FromEmbedBuilder(errorEmbed, true)).catch(console.error);
        } else if (interaction.deferred) {
            await interaction.editReply(toV2FromEmbedBuilder(errorEmbed, true)).catch(console.error);
        }
    }
}

/**
 * Handles whitelist clear confirmation button
 */
async function handleWhitelistClearConfirm(interaction) {
    try {
        // Extrair informações do customId
        // Formato: wl_clear_confirm_123456789 ou wl_clear_cancel_123456789
        const customIdParts = interaction.customId.split('_');
        if (customIdParts.length < 4) {
            logger.error('Custom ID inválido para limpeza de whitelist', {
                customId: interaction.customId
            });
            return;
        }

        const executorUserId = customIdParts[3];

        // Verificar se o usuário que clicou é o mesmo que iniciou a ação
        if (interaction.user.id !== executorUserId) {
            const colors = getColors();
            const embed = new EmbedBuilder()
                .setColor(colors.danger || 0xe74c3c)
                .setTitle('❌ Acesso Negado')
                .setDescription('Apenas quem iniciou esta ação pode confirmá-la.')
                .setFooter({ text: 'Acesso Negado', iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            return await interaction.reply(toV2FromEmbedBuilder(embed, true));
        }

        // Verificar se é cancelamento
        if (customIdParts[2] === 'cancel') {
            const colors = getColors();
            const embed = new EmbedBuilder()
                .setColor(colors.warning || 0xf39c12)
                .setTitle('❌ Ação Cancelada')
                .setDescription('A limpeza foi cancelada. Nenhuma alteração foi feita.')
                .setFooter({ text: 'Cancelado', iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            return await interaction.update({ ...toV2FromEmbedBuilder(embed, true), components: [] });
        }

        // Contar quantas whitelists existem antes de limpar
        const approvedWhitelists = db.getApprovedWhitelists();
        const pendingWhitelists = db.getPendingWhitelists();
        const totalWhitelists = approvedWhitelists.length + pendingWhitelists.length;

        // Limpar whitelist do servidor via SFTP (escrever array vazio)
        let sftpCleared = false;
        try {
            await writeWhitelist([]);
            sftpCleared = true;
            logger.info('Whitelist do servidor limpa via SFTP', {
                guildId: interaction.guild.id,
                clearedBy: interaction.user.id
            });
        } catch (sftpError) {
            logger.error('Erro ao limpar whitelist do servidor via SFTP', {
                error: sftpError.message,
                guildId: interaction.guild.id,
                stack: sftpError.stack
            });
            // Continuar mesmo se falhar - limpar do banco de dados
        }

        // Limpar todas as whitelists do banco de dados
        db.clearAllWhitelists();

        logger.info('Whitelist limpa', {
            guildId: interaction.guild.id,
            clearedBy: interaction.user.id,
            totalCleared: totalWhitelists,
            approvedCleared: approvedWhitelists.length,
            pendingCleared: pendingWhitelists.length,
            sftpCleared: sftpCleared
        });

        const colors = getColors();
        const embed = new EmbedBuilder()
            .setColor(colors.success || 0x2ecc71)
            .setTitle('✅ Whitelist Limpa')
            .setDescription(`A whitelist foi limpa com sucesso!`)
            .setThumbnail(interaction.guild.iconURL({ dynamic: true, size: 256 }))
            .addFields(
                {
                    name: '📊 Estatísticas',
                    value: `**Total de Whitelists Removidas:** ${totalWhitelists}\n**Aprovadas:** ${approvedWhitelists.length}\n**Pendentes:** ${pendingWhitelists.length}`,
                    inline: false
                },
                {
                    name: '🛠️ Limpado por',
                    value: `${interaction.user} (${interaction.user.tag})`,
                    inline: true
                },
                {
                    name: '⏰ Data',
                    value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                    inline: true
                }
            );

        if (sftpCleared) {
            embed.addFields({
                name: '✅ Servidor Limpo',
                value: 'A whitelist do servidor Minecraft foi limpa via SFTP.',
                inline: false
            });
        } else {
            embed.addFields({
                name: '⚠️ Aviso',
                value: 'A whitelist foi limpa do banco de dados, mas houve um problema ao limpar no servidor. Verifique manualmente se necessário.',
                inline: false
            });
        }

        embed.setFooter({ 
            text: `Limpado por ${interaction.user.tag}`, 
            iconURL: interaction.user.displayAvatarURL({ dynamic: true }) 
        })
        .setTimestamp();

        await interaction.update({ ...toV2FromEmbedBuilder(embed, true), components: [] });

        // Enviar log para o canal de whitelist log se configurado
        const { getChannelId } = await import('../utils/configHelper.js');
        const whitelistLogChannelId = getChannelId(interaction.guild.id, 'whitelistLog');
        const whitelistLogChannel = whitelistLogChannelId ? interaction.guild.channels.cache.get(whitelistLogChannelId) : null;
        
        if (whitelistLogChannel) {
            try {
                const logEmbed = new EmbedBuilder()
                    .setColor(colors.warning || 0xf39c12)
                    .setAuthor({ 
                        name: 'Whitelist Limpa', 
                        iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined 
                    })
                    .setTitle('🗑️ Whitelist Limpa')
                    .setDescription(`**${interaction.user.tag}** limpou toda a whitelist`)
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }) || null)
                    .addFields(
                        {
                            name: '📊 Estatísticas',
                            value: `**Total Removido:** ${totalWhitelists}\n**Aprovadas:** ${approvedWhitelists.length}\n**Pendentes:** ${pendingWhitelists.length}`,
                            inline: true
                        },
                        {
                            name: '🛠️ Limpado por',
                            value: `${interaction.user} (${interaction.user.tag})`,
                            inline: true
                        },
                        {
                            name: '⏰ Data e Hora',
                            value: `<t:${Math.floor(Date.now() / 1000)}:F>\n<t:${Math.floor(Date.now() / 1000)}:R>`,
                            inline: true
                        },
                        {
                            name: '🌐 Servidor',
                            value: sftpCleared ? '✅ Limpo via SFTP' : '⚠️ Erro ao limpar via SFTP',
                            inline: false
                        }
                    )
                    .setFooter({ 
                        text: `ID da Interação: ${interaction.id}`, 
                        iconURL: interaction.guild.iconURL({ dynamic: true }) 
                    })
                    .setTimestamp();

                await whitelistLogChannel.send({ ...toV2FromEmbedBuilder(logEmbed) }).catch(error => {
                    logger.error('Erro ao enviar log de limpeza de whitelist', {
                        error: error.message,
                        guildId: interaction.guild.id,
                        channelId: whitelistLogChannel.id
                    });
                });
            } catch (logError) {
                logger.error('Erro ao enviar log de limpeza', {
                    error: logError.message,
                    guildId: interaction.guild.id
                });
            }
        }

    } catch (error) {
        logger.error('Erro ao limpar whitelist', {
            error: error.message,
            stack: error.stack,
            userId: interaction.user.id
        });

        const colors = getColors();
        const errorEmbed = new EmbedBuilder()
            .setColor(colors.danger || 0xe74c3c)
            .setTitle('❌ Erro')
            .setDescription('Ocorreu um erro ao limpar a whitelist.')
            .setFooter({ 
                text: 'Erro', 
                iconURL: interaction.guild?.iconURL() 
            })
            .setTimestamp();

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply(toV2FromEmbedBuilder(errorEmbed, true)).catch(console.error);
        } else if (interaction.deferred) {
            await interaction.editReply(toV2FromEmbedBuilder(errorEmbed, true)).catch(console.error);
        }
    }
}

export { handleWhitelistClear, handleWhitelistClearConfirm };

