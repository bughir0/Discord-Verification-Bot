import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { mergeEmbedWithRows, toEmbedReply } from '../utils/embedBuilderV2.js';

import { database as db } from '../database/database.js';
import { getColors, getRoleId, getChannelId, hasStaffRole } from '../utils/configHelper.js';
import logger from '../utils/logger.js';
import { getMinecraftUUID } from '../utils/minecraftUtils.js';
import { removeFromWhitelist } from '../utils/sftpWhitelist.js';

async function handleWhitelistRemove(interaction) {
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

            return await interaction.reply(toEmbedReply(embed, true));
        }

        await interaction.deferReply({ ephemeral: true });

        const targetUser = interaction.options.getUser('usuário');
        
        if (!targetUser) {
            const colors = getColors();
            const embed = new EmbedBuilder()
                .setColor(colors.danger || 0xe74c3c)
                .setTitle('❌ Erro')
                .setDescription('Usuário não encontrado.')
                .setFooter({ text: 'Erro', iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            return await interaction.editReply(toEmbedReply(embed, true));
        }

        // Buscar whitelist do usuário
        const whitelist = db.getWhitelist(targetUser.id);
        
        if (!whitelist) {
            const colors = getColors();
            const embed = new EmbedBuilder()
                .setColor(colors.warning || 0xf39c12)
                .setTitle('⚠️ Whitelist Não Encontrada')
                .setDescription(`O usuário ${targetUser} não possui uma whitelist registrada.`)
                .setFooter({ text: 'Aviso', iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            return await interaction.editReply(toEmbedReply(embed, true));
        }

        // Verificar se está aprovada
        if (whitelist.status !== 'approved') {
            const colors = getColors();
            const embed = new EmbedBuilder()
                .setColor(colors.warning || 0xf39c12)
                .setTitle('⚠️ Whitelist Não Está Aprovada')
                .setDescription(`A whitelist de ${targetUser} está com status: **${whitelist.status}**\n\nApenas whitelists aprovadas podem ser removidas.`)
                .addFields({
                    name: '🎮 Nome de Usuário Minecraft',
                    value: `\`${whitelist.minecraftUsername || 'Não informado'}\``,
                    inline: false
                })
                .setFooter({ text: 'Aviso', iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            return await interaction.editReply(toEmbedReply(embed, true));
        }

        // Mostrar confirmação
        const colors = getColors();
        const confirmEmbed = new EmbedBuilder()
            .setColor(colors.danger || 0xe74c3c)
            .setTitle('⚠️ Confirmar Remoção')
            .setDescription(`Tem certeza que deseja **remover** a whitelist de ${targetUser}?`)
            .addFields(
                {
                    name: '👤 Usuário',
                    value: `${targetUser} (${targetUser.tag})`,
                    inline: true
                },
                {
                    name: '🎮 Nome Minecraft',
                    value: `\`${whitelist.minecraftUsername || 'Não informado'}\``,
                    inline: true
                },
                {
                    name: '📋 O que acontecerá',
                    value: '• A whitelist será removida do banco de dados\n• O jogador será removido do servidor Minecraft\n• O cargo de whitelist será removido (se configurado)',
                    inline: false
                }
            )
            .setFooter({ text: 'Esta ação não pode ser desfeita facilmente', iconURL: interaction.guild.iconURL() })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`wl_remove_confirm_${targetUser.id}_${interaction.user.id}`)
                    .setLabel('Sim, Remover')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌'),
                new ButtonBuilder()
                    .setCustomId(`wl_remove_cancel_${targetUser.id}_${interaction.user.id}`)
                    .setLabel('Cancelar')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('↩️')
            );

        return await interaction.editReply({
            ...mergeEmbedWithRows(toEmbedReply(confirmEmbed, true), [row])
        });
    } catch (error) {
        logger.error('Erro ao processar comando wl-remove', {
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
            await interaction.reply(toEmbedReply(errorEmbed, true)).catch(err => {
                logger.error('Erro ao responder erro de wl-remove', {
                    error: err.message,
                    userId: interaction.user?.id
                });
            });
        } else if (interaction.deferred) {
            await interaction.editReply(toEmbedReply(errorEmbed, true)).catch(err => {
                logger.error('Erro ao editar resposta de erro de wl-remove', {
                    error: err.message,
                    userId: interaction.user?.id
                });
            });
        }
    }
}

/**
 * Handles whitelist remove confirmation button
 */
export async function handleWhitelistRemoveConfirm(interaction) {
    try {
        // Extrair informações do customId
        // Formato: wl_remove_confirm_123456789_987654321 ou wl_remove_cancel_123456789_987654321
        const customIdParts = interaction.customId.split('_');
        if (customIdParts.length < 5) {
            logger.error('Custom ID inválido para remoção de whitelist', {
                customId: interaction.customId
            });
            return;
        }

        const targetUserId = customIdParts[3];
        const executorUserId = customIdParts[4];

        // Verificar se o usuário que clicou é o mesmo que iniciou a ação
        if (interaction.user.id !== executorUserId) {
            const colors = getColors();
            const embed = new EmbedBuilder()
                .setColor(colors.danger || 0xe74c3c)
                .setTitle('❌ Acesso Negado')
                .setDescription('Apenas quem iniciou esta ação pode confirmá-la.')
                .setFooter({ text: 'Acesso Negado', iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            return await interaction.reply(toEmbedReply(embed, true));
        }

        // Verificar se é cancelamento
        if (customIdParts[2] === 'cancel') {
            const colors = getColors();
            const embed = new EmbedBuilder()
                .setColor(colors.warning || 0xf39c12)
                .setTitle('❌ Ação Cancelada')
                .setDescription('A remoção foi cancelada. Nenhuma alteração foi feita.')
                .setFooter({ text: 'Cancelado', iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            return await interaction.update({ ...toEmbedReply(embed, true), components: [] });
        }

        // Buscar usuário e whitelist
        const targetUser = await interaction.guild.members.fetch(targetUserId).catch(() => null);
        const whitelist = db.getWhitelist(targetUserId);

        if (!whitelist) {
            const colors = getColors();
            const embed = new EmbedBuilder()
                .setColor(colors.warning || 0xf39c12)
                .setTitle('⚠️ Whitelist Não Encontrada')
                .setDescription('A whitelist não foi encontrada. Pode ter sido removida anteriormente.')
                .setFooter({ text: 'Aviso', iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            return await interaction.update({ ...toEmbedReply(embed, true), components: [] });
        }

        // Deferir atualização da interação para evitar expiração enquanto processa SFTP/UUID
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate().catch(error => {
                logger.error('Erro ao deferir interação de remoção de whitelist', {
                    error: error.message,
                    interactionId: interaction.id,
                    userId: interaction.user.id
                });
            });
        }

        // Buscar UUID do jogador e remover da whitelist via SFTP
        let sftpRemoved = false;
        let playerUUID = null;
        let playerName = whitelist.minecraftUsername;
        
        try {
            logger.info('Buscando UUID do jogador para remover da whitelist', {
                username: whitelist.minecraftUsername,
                userId: targetUserId
            });
            
            // Verificar plataforma (Java ou Bedrock)
            const platform = whitelist.platform || 'java';
            
            // Buscar configuração do modo do servidor (online/offline)
            const serverMode = db.getWhitelistMode(interaction.guild.id) || 'offline';
            const isOfflineMode = serverMode === 'offline';
            
            logger.info('Buscando UUID do jogador para remover da whitelist', {
                username: whitelist.minecraftUsername,
                userId: targetUserId,
                platform: platform,
                serverMode: serverMode,
                isOfflineMode: isOfflineMode
            });
            
            let uuidData = null;
            
            // Buscar UUID baseado na plataforma
            if (platform === 'bedrock') {
                const { getBedrockUUID } = await import('../utils/bedrockUtils.js');
                uuidData = await getBedrockUUID(whitelist.minecraftUsername);
            } else {
                // Java Edition
                uuidData = await getMinecraftUUID(whitelist.minecraftUsername, isOfflineMode);
            }
            
            if (uuidData && uuidData.uuid) {
                playerUUID = uuidData.uuid;
                playerName = uuidData.name;
                
                // Remover da whitelist via SFTP
                const removed = await removeFromWhitelist(playerUUID, playerName);
                
                if (removed) {
                    sftpRemoved = true;
                    logger.info('Jogador removido da whitelist via SFTP', {
                        uuid: playerUUID,
                        name: playerName,
                        userId: targetUserId
                    });
                } else {
                    logger.warning('Jogador não encontrado na whitelist do servidor', {
                        uuid: playerUUID,
                        name: playerName,
                        userId: targetUserId
                    });
                }
            } else {
                // Tentar remover pelo nome mesmo sem UUID
                try {
                    const removed = await removeFromWhitelist(null, whitelist.minecraftUsername);
                    if (removed) {
                        sftpRemoved = true;
                        logger.info('Jogador removido da whitelist via SFTP (por nome)', {
                            name: whitelist.minecraftUsername,
                            userId: targetUserId
                        });
                    }
                } catch (nameError) {
                    logger.error('Erro ao remover por nome', {
                        error: nameError.message,
                        name: whitelist.minecraftUsername
                    });
                }
            }
        } catch (sftpError) {
            logger.error('Erro ao remover jogador da whitelist via SFTP', {
                error: sftpError.message,
                username: whitelist.minecraftUsername,
                userId: targetUserId,
                stack: sftpError.stack
            });
            // Continuar mesmo se falhar - não bloquear a remoção
        }

        // Tentar remover o cargo de whitelist se configurado
        let roleRemoved = false;
        try {
            const member = targetUser || await interaction.guild.members.fetch(targetUserId).catch(() => null);
            if (member) {
                const whitelistRoleId = getRoleId(interaction.guild.id, 'wl');
                if (whitelistRoleId && member.roles.cache.has(whitelistRoleId)) {
                    await member.roles.remove(whitelistRoleId);
                    roleRemoved = true;
                    logger.info('Cargo de whitelist removido', {
                        userId: targetUserId,
                        roleId: whitelistRoleId,
                        guildId: interaction.guild.id,
                        removedBy: interaction.user.id
                    });
                }
            }
        } catch (roleError) {
            logger.error('Erro ao remover cargo de whitelist', {
                error: roleError.message,
                userId: targetUserId,
                guildId: interaction.guild.id
            });
            // Continuar mesmo se falhar ao remover cargo
        }


        // Atualizar status no banco de dados para 'denied' ou deletar
        // Vou deletar para manter o histórico limpo, mas você pode mudar para 'denied' se preferir
        db.deleteWhitelist(targetUserId);

        const colors = getColors();
        const userDisplay = targetUser ? `${targetUser} (${targetUser.tag})` : `Usuário Desconhecido (${targetUserId})`;
        const embed = new EmbedBuilder()
            .setColor(colors.success || 0x2ecc71)
            .setTitle('<a:sucesso:1443149628085244036> Whitelist Removida')
            .setDescription(`A whitelist de **${userDisplay}** foi removida com sucesso.`)
            .setThumbnail(targetUser?.displayAvatarURL({ dynamic: true, size: 256 }) || interaction.guild.iconURL({ dynamic: true }))
            .addFields(
                {
                    name: '👤 Usuário',
                    value: userDisplay,
                    inline: true
                },
                {
                    name: '🆔 ID',
                    value: targetUserId,
                    inline: true
                },
                {
                    name: '🎮 Nome de Usuário Minecraft',
                    value: `\`${playerName || whitelist.minecraftUsername || 'Não informado'}\``,
                    inline: false
                },
                {
                    name: '🆔 UUID',
                    value: playerUUID ? `\`${playerUUID}\`` : 'Não foi possível obter UUID',
                    inline: false
                },
                {
                    name: '🛠️ Removido por',
                    value: `${interaction.user} (${interaction.user.tag})`,
                    inline: true
                },
                {
                    name: '⏰ Data',
                    value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                    inline: true
                }
            );

        if (sftpRemoved) {
            embed.addFields({
                name: '<a:sucesso:1443149628085244036> Removido do Servidor',
                value: 'O jogador foi removido da whitelist do servidor Minecraft.',
                inline: false
            });
        } else {
            embed.addFields({
                name: '⚠️ Aviso',
                value: 'Não foi possível remover da whitelist do servidor. Verifique manualmente se necessário.',
                inline: false
            });
        }

        if (roleRemoved) {
            embed.addFields({
                name: '🎭 Cargo Removido',
                value: 'O cargo de whitelist foi removido automaticamente.',
                inline: false
            });
        }

        embed.setFooter({ 
            text: `Removido por ${interaction.user.tag}`, 
            iconURL: interaction.user.displayAvatarURL({ dynamic: true }) 
        })
        .setTimestamp();

        // Atualizar a mensagem original após deferUpdate
        await interaction.editReply({ ...toEmbedReply(embed, true), components: [] });

        // Enviar log para o canal de whitelist log se configurado
        const whitelistLogChannelId = getChannelId(interaction.guild.id, 'whitelistLog');
        const whitelistLogChannel = whitelistLogChannelId ? interaction.guild.channels.cache.get(whitelistLogChannelId) : null;
        
        if (whitelistLogChannel) {
            try {
                const logEmbed = new EmbedBuilder()
                    .setColor(colors.warning || 0xf39c12)
                    .setAuthor({ 
                        name: 'Whitelist Removida', 
                        iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined 
                    })
                    .setTitle('🗑️ Whitelist Removida')
                    .setDescription(`**${targetUser.tag}** teve sua whitelist removida`)
                    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }) || null)
                    .addFields(
                        {
                            name: '👤 Usuário',
                            value: `${targetUser} (${targetUser.tag})\n**ID:** \`${targetUser.id}\``,
                            inline: true
                        },
                        {
                            name: '🎮 Nome de Usuário Minecraft',
                            value: `\`${whitelist.minecraftUsername || 'Não informado'}\``,
                            inline: true
                        },
                        {
                            name: '🛠️ Removido por',
                            value: `${interaction.user} (${interaction.user.tag})`,
                            inline: true
                        },
                        {
                            name: '⏰ Data e Hora',
                            value: `<t:${Math.floor(Date.now() / 1000)}:F>\n<t:${Math.floor(Date.now() / 1000)}:R>`,
                            inline: true
                        }
                    )
                    .setFooter({ 
                        text: `ID da Interação: ${interaction.id}`, 
                        iconURL: interaction.guild.iconURL({ dynamic: true }) 
                    })
                    .setTimestamp();

                await whitelistLogChannel.send({ ...toEmbedReply(logEmbed) }).catch(error => {
                    logger.error('Erro ao enviar log de remoção de whitelist', {
                        error: error.message,
                        guildId: interaction.guild.id,
                        channelId: whitelistLogChannel.id
                    });
                });
            } catch (logError) {
                logger.error('Erro ao enviar log de remoção', {
                    error: logError.message,
                    guildId: interaction.guild.id
                });
            }
        }

    } catch (error) {
        logger.error('Erro ao remover whitelist', {
            error: error.message,
            stack: error.stack,
            userId: interaction.user.id
        });

        const colors = getColors();
        const errorEmbed = new EmbedBuilder()
            .setColor(colors.danger || 0xe74c3c)
            .setTitle('❌ Erro')
            .setDescription('Ocorreu um erro ao remover a whitelist.')
            .setFooter({ 
                text: 'Erro', 
                iconURL: interaction.guild?.iconURL() 
            })
            .setTimestamp();

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply(toEmbedReply(errorEmbed, true)).catch(err => {
                logger.error('Erro ao responder erro ao remover whitelist', {
                    error: err.message,
                    userId: interaction.user?.id
                });
            });
        } else if (interaction.deferred) {
            await interaction.editReply(toEmbedReply(errorEmbed, true)).catch(err => {
                logger.error('Erro ao editar resposta de erro ao remover whitelist', {
                    error: err.message,
                    userId: interaction.user?.id
                });
            });
        }
    }
}

export { handleWhitelistRemove };

