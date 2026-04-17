import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { database as db } from '../database/database.js';
import { getChannelId, getRoleId, getColors, hasStaffRole } from '../utils/configHelper.js';
import logger from '../utils/logger.js';
import { getMinecraftUUID } from '../utils/minecraftUtils.js';
import { addToWhitelist } from '../utils/sftpWhitelist.js';

async function handleWhitelistAction(interaction) {
    // Early return if interaction is already handled
    if (interaction.replied || interaction.deferred) {
        return;
    }

    try {
        const [action, userId] = interaction.customId.split('_').slice(1);
        const isApproval = action === 'approve';
        
        // Check if user has any staff role BEFORE disabling buttons
        if (!hasStaffRole(interaction.member)) {
            const embed = new EmbedBuilder()
                .setColor(getColors().danger)
                .setTitle('❌ Acesso Negado')
                .setDescription('Apenas membros da equipe podem realizar esta ação.')
                .setFooter({ text: 'Whitelist', iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            try {
                await interaction.reply({
                    embeds: [embed],
                    ephemeral: true
                });
            } catch (error) {
                if (error.code !== 'InteractionAlreadyReplied') {
                    logger.error('Error sending access denied message in whitelistAction', {
                        error: error.message,
                        stack: error.stack,
                        interactionId: interaction.id,
                        userId: interaction.user?.id
                    });
                }
            }
            return;
        }
        
        // For button interactions, we'll use deferUpdate since we're updating the message
        if (interaction.isButton()) {
            try {
                await interaction.deferUpdate();
            } catch (error) {
                // If we can't defer, the interaction might already be handled
                if (error.code !== 'InteractionAlreadyReplied') {
                    logger.error('Error deferring update in whitelistAction', {
                        error: error.message,
                        stack: error.stack,
                        interactionId: interaction.id
                    });
                }
                return;
            }

            // Assim que o botão é clicado, desativamos TODOS os botões dessa mensagem
            // para evitar double click ou múltiplos staffs processando a mesma whitelist.
            try {
                const message = interaction.message;
                if (message && message.editable && Array.isArray(message.components) && message.components.length > 0) {
                    const disabledComponents = message.components.map(row => {
                        const newRow = ActionRowBuilder.from(row);
                        newRow.components = row.components.map(component => {
                            // Apenas botões são usados aqui, então podemos converter diretamente
                            return ButtonBuilder.from(component).setDisabled(true);
                        });
                        return newRow;
                    });

                    await message.edit({
                        components: disabledComponents
                    });
                }
            } catch (disableError) {
                logger.error('Erro ao desativar botões da mensagem de whitelist', {
                    error: disableError.message,
                    stack: disableError.stack,
                    interactionId: interaction.id,
                    messageId: interaction.message?.id
                });
                // Não interrompe o fluxo principal da whitelist caso falhe aqui
            }
        }
        
        // Obter informações da whitelist antes de atualizar
        const whitelistData = await db.getWhitelist(userId);
        const minecraftUsername = whitelistData?.minecraftUsername || 'Desconhecido';
        
        // Atualizar status no banco de dados
        await db.updateWhitelistStatus(userId, isApproval ? 'approved' : 'denied');
        
        // Obter informações do membro
        const member = await interaction.guild.members.fetch(userId).catch(error => {
            logger.error('Erro ao buscar membro', { error: error.message, userId });
            return null;
        });
        const staffMember = interaction.user;
        
        // Notificar no canal de resultado de whitelist se for recusa
        if (!isApproval && member) {
            try {
                const whitelistResultChannelId = getChannelId(interaction.guild.id, 'whitelistResult');
                const whitelistResultChannel = whitelistResultChannelId ? interaction.guild.channels.cache.get(whitelistResultChannelId) : null;
                
                if (whitelistResultChannel) {
                    const colors = getColors();
                    const denialEmbed = new EmbedBuilder()
                        .setColor(colors.danger || 0xe74c3c)
                        .setAuthor({ 
                            name: 'Whitelist Recusada', 
                            iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined 
                        })
                        .setTitle('❌ Sua whitelist foi recusada')
                        .setDescription(`${member}, infelizmente sua solicitação de whitelist foi **recusada** pela equipe.`)
                        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
                        .addFields(
                            {
                                name: '🎮 Nome de Usuário',
                                value: `\`${minecraftUsername}\``,
                                inline: false
                            },
                            {
                                name: '📋 Motivo',
                                value: 'Entre em contato com a equipe para mais informações sobre o motivo da recusa.',
                                inline: false
                            },
                            {
                                name: '🛠️ Responsável',
                                value: `${staffMember} (${staffMember.tag})`,
                                inline: true
                            },
                            {
                                name: '⏰ Data',
                                value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                                inline: true
                            },
                            {
                                name: '🔄 Próximos Passos',
                                value: 'Você pode tentar novamente se necessário. Entre em contato com a equipe para esclarecimentos.',
                                inline: false
                            }
                        )
                        .setFooter({ 
                            text: `${interaction.guild.name} • ID: ${member.id}`, 
                            iconURL: interaction.guild.iconURL({ dynamic: true }) 
                        })
                        .setTimestamp();

                    const message = await whitelistResultChannel.send({
                        content: member.toString(),
                        embeds: [denialEmbed]
                    });

                    // Deletar a mensagem após 5 minutos
                    setTimeout(async () => {
                        try {
                            await message.delete();
                            logger.info('Mensagem de recusa de whitelist removida automaticamente', {
                                messageId: message.id,
                                channelId: whitelistResultChannel.id,
                                userId: member.id
                            });
                        } catch (error) {
                            logger.error('Erro ao remover mensagem de recusa', {
                                error: error.message,
                                messageId: message.id,
                                channelId: whitelistResultChannel.id
                            });
                        }
                    }, 5 * 60 * 1000); // 5 minutos em milissegundos
                } else {
                    logger.debug('Canal de resultado de whitelist não configurado', {
                        guildId: interaction.guild.id,
                        suggestion: 'Configure usando /config canal tipo:whitelistResult'
                    });
                }
            } catch (error) {
                logger.error('Erro ao enviar notificação de recusa de whitelist', {
                    error: error.message,
                    userId: member.id,
                    channelId: getChannelId(interaction.guild.id, 'whitelistResult')
                });
            }
        }
        
        // Se for aprovação, adicionar cargo de whitelist (opcional) e notificar o usuário via DM
        if (isApproval && member) {
            try {
                // Buscar UUID real do jogador e adicionar à whitelist via SFTP
                let uuidAdded = false;
                let playerUUID = null;
                let playerName = minecraftUsername;
                
                try {
                    logger.info('Buscando UUID do jogador', {
                        username: minecraftUsername,
                        userId: member.id
                    });
                    
                    // Verificar plataforma (Java ou Bedrock)
                    const platform = whitelistData?.platform || 'java';
                    
                    // Buscar configuração do modo do servidor (online/offline)
                    const serverMode = db.getWhitelistMode(interaction.guild.id) || 'offline';
                    const isOfflineMode = serverMode === 'offline';
                    
                    logger.info('Buscando UUID do jogador', {
                        username: minecraftUsername,
                        userId: member.id,
                        platform: platform,
                        serverMode: serverMode,
                        isOfflineMode: isOfflineMode
                    });
                    
                    let uuidData = null;
                    
                    // Buscar UUID baseado na plataforma
                    if (platform === 'bedrock') {
                        const { getBedrockUUID } = await import('../utils/bedrockUtils.js');
                        uuidData = await getBedrockUUID(minecraftUsername);
                    } else {
                        // Java Edition
                        uuidData = await getMinecraftUUID(minecraftUsername, isOfflineMode);
                    }
                    
                    if (uuidData && uuidData.uuid) {
                        playerUUID = uuidData.uuid;
                        // Usar o nome digitado pelo usuário (prioridade) ou o nome da API como fallback
                        playerName = minecraftUsername.trim() || uuidData.name;
                        
                        // Log detalhado da UUID encontrada para verificação
                        logger.info('UUID encontrada para adicionar à whitelist', {
                            username: minecraftUsername,
                            uuid: playerUUID,
                            name: playerName,
                            source: uuidData.source || 'unknown',
                            note: 'Se o jogador não conseguir entrar, verifique se esta UUID está correta. Use /whitelist list no servidor para comparar.'
                        });
                        
                        // Adicionar à whitelist via SFTP (UUID + nome)
                        const added = await addToWhitelist(playerUUID, playerName);
                        
                        if (added) {
                            uuidAdded = true;
                            logger.info('Jogador adicionado à whitelist via SFTP', {
                                uuid: playerUUID,
                                name: playerName,
                                userId: member.id
                            });
                        } else {
                            logger.warning('Jogador já estava na whitelist', {
                                uuid: playerUUID,
                                name: playerName,
                                userId: member.id
                            });
                        }
                    } else {
                        logger.error('Não foi possível obter UUID do jogador', {
                            username: minecraftUsername,
                            userId: member.id
                        });
                    }
                } catch (sftpError) {
                    logger.error('Erro ao adicionar jogador à whitelist via SFTP', {
                        error: sftpError.message,
                        username: minecraftUsername,
                        userId: member.id,
                        stack: sftpError.stack
                    });
                    // Continuar mesmo se falhar - não bloquear a aprovação
                }
                
                // Adicionar cargo de whitelist se configurado (opcional)
                const whitelistRoleId = getRoleId(interaction.guild.id, 'wl');
                if (whitelistRoleId) {
                    try {
                        await member.roles.add(whitelistRoleId);
                        logger.info('Cargo de whitelist adicionado', {
                            userId: member.id,
                            roleId: whitelistRoleId,
                            guildId: interaction.guild.id
                        });
                    } catch (roleError) {
                        logger.error('Erro ao adicionar cargo de whitelist', {
                            error: roleError.message,
                            userId: member.id,
                            roleId: whitelistRoleId,
                            guildId: interaction.guild.id
                        });
                        // Continuar mesmo se falhar ao adicionar cargo
                    }
                }


                // Enviar notificação no canal de resultado de whitelist
                const whitelistResultChannelId = getChannelId(interaction.guild.id, 'whitelistResult');
                const whitelistResultChannel = whitelistResultChannelId ? interaction.guild.channels.cache.get(whitelistResultChannelId) : null;
                
                if (whitelistResultChannel) {
                    const colors = getColors();
                    const approvalEmbed = new EmbedBuilder()
                        .setColor(colors.success || 0x2ecc71)
                        .setAuthor({ 
                            name: 'Whitelist Aprovada!', 
                            iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined 
                        })
                        .setTitle('✅ Sua whitelist foi aprovada!')
                        .setDescription(`${member}, sua solicitação de whitelist foi **aprovada** pela equipe!`)
                        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
                        .addFields(
                            {
                                name: '🎮 Nome de Usuário',
                                value: `\`${playerName}\``,
                                inline: false
                            },
                            {
                                name: '🆔 UUID',
                                value: playerUUID ? `\`${playerUUID}\`` : 'Não foi possível obter UUID',
                                inline: false
                            },
                            {
                                name: '🎉 Próximos Passos',
                                value: uuidAdded 
                                    ? 'Você já pode entrar no servidor usando seu nome de usuário do Minecraft!\n\n⚠️ **Se não conseguir entrar**, a UUID pode estar incorreta. Entre em contato com a equipe para verificar.'
                                    : 'Sua whitelist foi aprovada, mas houve um problema ao adicionar ao servidor. Entre em contato com a equipe.',
                                inline: false
                            },
                            {
                                name: '🛠️ Aprovado por',
                                value: `${staffMember} (${staffMember.tag})`,
                                inline: true
                            },
                            {
                                name: '⏰ Data',
                                value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                                inline: true
                            }
                        )
                        .setFooter({ 
                            text: `${interaction.guild.name} • ID: ${member.id}`, 
                            iconURL: interaction.guild.iconURL({ dynamic: true }) 
                        })
                        .setTimestamp();

                    const message = await whitelistResultChannel.send({
                        content: `🎉 ${member}`,
                        embeds: [approvalEmbed]
                    });

                    // Deletar a mensagem após 5 minutos
                    setTimeout(async () => {
                        try {
                            await message.delete();
                            logger.info('Mensagem de aprovação de whitelist removida automaticamente', {
                                messageId: message.id,
                                channelId: whitelistResultChannel.id,
                                userId: member.id
                            });
                        } catch (error) {
                            logger.error('Erro ao remover mensagem de aprovação', {
                                error: error.message,
                                messageId: message.id,
                                channelId: whitelistResultChannel.id
                            });
                        }
                    }, 5 * 60 * 1000); // 5 minutos em milissegundos
                } else {
                    logger.debug('Canal de resultado de whitelist não configurado', {
                        guildId: interaction.guild.id,
                        suggestion: 'Configure usando /config canal tipo:whitelistResult'
                    });
                }
            } catch (error) {
                logger.error('Erro ao enviar notificação de aprovação de whitelist', {
                    error: error.message,
                    userId: member.id
                });
            }
        }
        
        // Atualizar mensagem original
        const embed = new EmbedBuilder(interaction.message.embeds[0]);
        const colors = getColors();
        embed.setColor(isApproval ? colors.success : colors.danger);
        
        const statusTitle = isApproval ? 'APROVADA' : 'RECUSADA';
        const statusEmoji = isApproval ? '<a:sucesso:1443149628085244036>' : '<a:erro:1443149642580758569>';
        embed.setTitle(`${statusEmoji} Whitelist ${statusTitle}`);
        
        // Atualizar campo de status
        const statusText = isApproval ? 'Aprovada' : 'Recusada';
        
        // Encontrar e remover o campo de status existente, se houver
        const fields = embed.data.fields || [];
        const filteredFields = fields.filter(field => field.name !== '📝 Status da Whitelist' && field.name !== '📝 Status');
        
        // Adicionar informações de quem aprovou/recusou
        filteredFields.push({
            name: '📝 Status da Whitelist',
            value: `\`\`\`${isApproval ? '🟢 APROVADA' : '🔴 RECUSADA'} por ${staffMember.username}\`\`\``,
            inline: false
        });
        
        // Adicionar informações adicionais
        filteredFields.push({
            name: '🛠️ Processado por',
            value: `${staffMember} (${staffMember.tag})`,
            inline: true
        });
        
        filteredFields.push({
            name: '⏰ Processado em',
            value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
            inline: true
        });
        
        // Atualizar os campos do embed
        embed.setFields(filteredFields);
        
        // Enviar log para o canal de whitelist log (wl-mine-log)
        const whitelistLogChannelId = getChannelId(interaction.guild.id, 'whitelistLog');
        const whitelistLogChannel = whitelistLogChannelId ? interaction.guild.channels.cache.get(whitelistLogChannelId) : null;
        if (whitelistLogChannel) {
            // Verificar permissões do bot
            const botMember = interaction.guild.members.me;
            const permissions = whitelistLogChannel.permissionsFor(botMember);
            if (!permissions?.has(['SendMessages', 'EmbedLinks'])) {
                logger.warning('Bot não tem permissão para enviar log de whitelist', {
                    guildId: interaction.guild.id,
                    channelId: whitelistLogChannel.id,
                    missingPermissions: ['SendMessages', 'EmbedLinks']
                });
                // Continuar mesmo sem permissão para não quebrar o fluxo
            } else {
                const colors = getColors();
                
                // Calcular idade da conta
                const accountAge = member?.user?.createdTimestamp 
                    ? Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24))
                    : null;
                const accountAgeText = accountAge !== null 
                    ? (accountAge === 0 ? 'Hoje' : accountAge === 1 ? '1 dia' : `${accountAge} dias`)
                    : 'Desconhecido';
                
                // Calcular tempo no servidor
                const timeInServer = member?.joinedTimestamp 
                    ? Math.floor((Date.now() - member.joinedTimestamp) / (1000 * 60 * 60 * 24))
                    : null;
                const timeInServerText = timeInServer !== null 
                    ? (timeInServer === 0 ? 'Hoje' : timeInServer === 1 ? '1 dia' : `${timeInServer} dias`)
                    : 'Desconhecido';
                
                const logEmbed = new EmbedBuilder()
                    .setColor(isApproval ? colors.success : colors.danger)
                    .setAuthor({ 
                        name: `Ficha de Whitelist ${statusTitle}`, 
                        iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined 
                    })
                    .setTitle(`${isApproval ? '<a:sucesso:1443149628085244036>' : '<a:erro:1443149642580758569>'} Whitelist ${statusTitle}`)
                    .setDescription(`**<@${member?.user?.id || 'Usuário Desconhecido'}>** teve sua whitelist ${isApproval ? 'aprovada' : 'recusada'}`)
                    .setThumbnail(member?.user.displayAvatarURL({ dynamic: true, size: 256 }) || null)
                    .addFields(
                        {
                            name: '👤 Informações do Usuário',
                            value: `**Tag:** ${member?.user?.tag || 'Desconhecido'}\n**ID:** \`${userId}\``,
                            inline: true
                        },
                            {
                                name: '🎮 Nome de Usuário Minecraft',
                                value: `\`${minecraftUsername}\``,
                                inline: true
                            },
                            {
                                name: '📱 Plataforma',
                                value: (whitelistData?.platform || 'java') === 'bedrock' ? '🔷 **Bedrock**' : '☕ **Java**',
                                inline: true
                            },
                        {
                            name: '📅 Informações da Conta',
                            value: member?.user?.createdTimestamp 
                                ? `**Criada:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`
                                : 'Desconhecido',
                            inline: true
                        },
                        {
                            name: '🏠 No Servidor',
                            value: member?.joinedTimestamp 
                                ? `**Entrou:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
                                : 'Desconhecido',
                            inline: true
                        },
                        {
                            name: '📝 Status da Whitelist',
                            value: `\`\`\`${isApproval ? '🟢 APROVADA' : '🔴 RECUSADA'} por ${staffMember.username}\`\`\``,
                            inline: false
                        },
                        {
                            name: '🛠️ Processado por',
                            value: `${staffMember} (${staffMember.tag})`,
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
                    
                // Enviar mensagem de log (sem auto-deleção)
                await whitelistLogChannel.send({ embeds: [logEmbed] }).catch(error => {
                    logger.error('Erro ao enviar log de whitelist', {
                        error: error.message,
                        guildId: interaction.guild.id,
                        channelId: whitelistLogChannel.id,
                        userId: member?.id
                    });
                });
            }
            
            // Confirmar para o staff que a ação foi concluída
            // Use editReply since we deferred the interaction
            await interaction.editReply({
                content: `<a:sucesso:1443149628085244036> A whitelist foi ${isApproval ? 'aprovada' : 'recusada'} com sucesso.`,
                ephemeral: true
            });
        } else {
            logger.warning('Canal wl-mine-log não configurado', {
                guildId: interaction.guild.id,
                suggestion: 'Configure usando /config canal tipo:whitelistLog'
            });
        }
        
        // Atualizar mensagem original e agendar exclusão
        try {
            // Primeiro, atualize a mensagem original para remover os botões
            if (interaction.isButton()) {
                try {
                    // Tente editar a mensagem original para remover os botões
                    const message = interaction.message;
                    if (message && message.editable) {
                        await message.edit({
                            embeds: [embed],
                            components: [] // Remove os botões
                        });
                        
                        // Agendar exclusão da mensagem do canal de notificações após 1 minuto
                        setTimeout(async () => {
                            try {
                                await message.delete();
                                logger.info('Mensagem de notificação de whitelist removida automaticamente', {
                                    messageId: message.id,
                                    channelId: message.channelId,
                                    action: isApproval ? 'approve' : 'deny',
                                    userId: member?.id || userId
                                });
                            } catch (error) {
                                // Verificar se é erro de mensagem não encontrada
                                if (error.code === 10008 || error.message?.includes('Unknown Message')) {
                                    logger.warning('Mensagem de notificação já foi removida ou não existe', {
                                        messageId: message.id,
                                        channelId: message.channelId,
                                        action: isApproval ? 'approve' : 'deny',
                                        userId: member?.id || userId
                                    });
                                } else {
                                    logger.error('Erro ao remover mensagem de notificação', {
                                        error: error.message,
                                        messageId: message.id,
                                        channelId: message.channelId,
                                        code: error.code
                                    });
                                }
                            }
                        }, 60000); // 1 minuto em milissegundos
                    }
                } catch (updateError) {
                    logger.error('Erro ao atualizar mensagem original', {
                        error: updateError.message,
                        messageId: interaction.message?.id,
                        channelId: interaction.channelId
                    });
                }
            }
        } catch (updateError) {
            logger.error('Error updating interaction', {
                error: updateError.message,
                interactionId: interaction.id,
                type: interaction.type
            });
        }
        
    } catch (error) {
        logger.error('Erro ao processar ação de whitelist', {
            error: error.message,
            interactionId: interaction.id,
            customId: interaction.customId,
            userId: interaction.user.id,
            isButton: interaction.isButton()
        });
        
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
                content: '❌ Ocorreu um erro ao processar esta ação.'
            }).catch(err => 
                logger.error('Erro ao editar resposta de interação', { 
                    error: err.message,
                    interactionId: interaction.id 
                })
            );
        } else {
            await interaction.editReply({
                content: '❌ Ocorreu um erro ao processar esta ação.'
            }).catch(err => 
                logger.error('Erro ao editar resposta de interação', { 
                    error: err.message,
                    interactionId: interaction.id 
                })
            );
        }
    }
}

export { handleWhitelistAction };

