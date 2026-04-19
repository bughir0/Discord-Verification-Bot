import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { database as db } from '../database/database.js';
import { getChannelId, getRoleId, getColors, hasStaffRole } from '../utils/configHelper.js';
import { buildVerificationStaffMessageV2, mergeEmbedWithRows, toEmbedReply } from '../utils/embedBuilderV2.js';
import { error as errorResponse } from '../utils/responseUtils.js';
import logger from '../utils/logger.js';

async function handleVerificationAction(interaction) {
    // Early return if interaction is already handled
    if (interaction.replied || interaction.deferred) {
        return;
    }

    try {
        const [action, userId] = interaction.customId.split('_').slice(1);
        const isApproval = action === 'approve';
        
        // For button interactions, we'll use deferUpdate since we're updating the message
        if (interaction.isButton()) {
            try {
                await interaction.deferUpdate();
            } catch (error) {
                // If we can't defer, the interaction might already be handled
                if (error.code !== 'InteractionAlreadyReplied') {
                    console.error('Error deferring update:', error);
                }
                return;
            }
        }
        
        // Check if user has any staff role
        if (!hasStaffRole(interaction.member)) {
            const denied = errorResponse({
                title: 'Acesso Negado',
                description: 'Apenas membros da equipe podem realizar esta ação.',
                ephemeral: true
            });

            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(denied);
                } else {
                    await interaction.reply(denied);
                }
            } catch (error) {
                if (error.code !== 'InteractionAlreadyReplied') {
                    logger.error('Error sending access denied message in verificationAction', {
                        error: error.message,
                        stack: error.stack,
                        interactionId: interaction.id,
                        userId: interaction.user?.id
                    });
                }
            }
            return;
        }
        
        // Atualizar status no banco de dados
        await db.updateVerificationStatus(userId, isApproval ? 'approved' : 'denied');
        
        // Obter informações do membro
        const member = await interaction.guild.members.fetch(userId).catch(error => {
            logger.error('Erro ao buscar membro', { error: error.message, userId });
            return null;
        });
        const staffMember = interaction.user;
        
        // Notificar no canal de verificação se for recusa
        if (!isApproval && member) {
            try {
                const verificationChannelId = getChannelId(interaction.guild.id, 'verification');
                const verificationChannel = verificationChannelId ? interaction.guild.channels.cache.get(verificationChannelId) : null;
                if (verificationChannel) {
                    const colors = getColors();
                    const denialEmbed = new EmbedBuilder()
                        .setColor(colors.danger || 0xe74c3c)
                        .setAuthor({ 
                            name: 'Verificação Recusada', 
                            iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined 
                        })
                        .setTitle('❌ Sua verificação foi recusada')
                        .setDescription(`${member}, infelizmente sua solicitação de verificação foi **recusada** pela equipe.`)
                        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
                        .addFields(
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
                            text: `ID: ${member.id} • Esta mensagem será removida em 5 minutos`, 
                            iconURL: interaction.guild.iconURL({ dynamic: true }) 
                        })
                        .setTimestamp();

                    const message = await verificationChannel.send({
                        ...mergeEmbedWithRows(denialEmbed, [], { content: `${member}` }),
                        allowedMentions: { users: [member.id] }
                    });

                    // Deletar a mensagem após 5 minutos
                    setTimeout(async () => {
                        try {
                            await message.delete();
                            logger.info('Mensagem de recusa removida automaticamente', {
                                messageId: message.id,
                                channelId: verificationChannel.id,
                                userId: member.id
                            });
                        } catch (error) {
                            logger.error('Erro ao remover mensagem de recusa', {
                                error: error.message,
                                messageId: message.id,
                                channelId: verificationChannel.id
                            });
                        }
                    }, 5 * 60 * 1000); // 5 minutos em milissegundos
                }
            } catch (error) {
                logger.error('Erro ao enviar notificação de recusa', {
                    error: error.message,
                    userId: member.id,
                    channelId: getChannelId(interaction.guild.id, 'verification')
                });
            }
        }
        
        // Se for aprovação, adicionar cargo de verificado
        if (isApproval && member) {
            try {
                const verifiedRoleId = getRoleId(interaction.guild.id, 'verified');
                if (verifiedRoleId) {
                    await member.roles.add(verifiedRoleId);
                }
            } catch (error) {
                logger.error('Erro ao adicionar cargo de verificado', {
                    error: error.message,
                    userId: member?.id,
                    action: 'approve',
                    guildId: interaction.guild.id
                });
            }
        }
        
        const statusTitle = isApproval ? 'APROVADA' : 'RECUSADA';
        const verificationRow = db.getVerification(userId);
        const referralInfo = verificationRow?.referralSource?.trim() || 'Não informado';

        // Enviar log para o canal de log-ficha
        const logFichaChannelId = getChannelId(interaction.guild.id, 'logFicha');
        const logFichaChannel = logFichaChannelId ? interaction.guild.channels.cache.get(logFichaChannelId) : null;
        if (logFichaChannel) {
            // Verificar permissões do bot
            const botMember = interaction.guild.members.me;
            const permissions = logFichaChannel.permissionsFor(botMember);
            if (!permissions?.has(['SendMessages', 'EmbedLinks'])) {
                logger.warning('Bot não tem permissão para enviar log de ficha', {
                    guildId: interaction.guild.id,
                    channelId: logFichaChannel.id,
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
                    name: `Ficha de Verificação ${statusTitle}`, 
                    iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined 
                })
                    .setTitle(`${isApproval ? '<a:sucesso:1443149628085244036>' : '<a:erro:1443149642580758569>'} Verificação ${statusTitle}`)
                .setDescription(`**<@${member?.user?.id || 'Usuário Desconhecido'}>** teve sua verificação ${isApproval ? 'aprovada' : 'recusada'}`)
                .setThumbnail(member?.user.displayAvatarURL({ dynamic: true, size: 256 }) || null)
                .addFields(
                    {
                        name: '👤 Informações do Usuário',
                        value: `**Tag:** ${member?.user?.tag || 'Desconhecido'}\n**ID:** \`${userId}\``,
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
                        name: '📌 Indicado por',
                        value: referralInfo !== 'Não informado' ? `\`${referralInfo}\`` : '`Não informado`',
                        inline: false
                    },
                    {
                        name: '📝 Status da Verificação',
                        value: `\`\`\`${isApproval ? '🟢 APROVADA' : '🔴 RECUSADA'} por ${staffMember.username}\`\`\``,
                        inline: false
                    },
                    {
                        name: '🛠️ Processado por',
                        value: `<@${staffMember.id}> (${staffMember.tag})`,
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
                await logFichaChannel.send({ ...toEmbedReply(logEmbed) }).catch(error => {
                    logger.error('Erro ao enviar log de ficha', {
                        error: error.message,
                        guildId: interaction.guild.id,
                        channelId: logFichaChannel.id,
                        userId: member?.id
                    });
                });
            }
            
            // Confirmar para o staff que a ação foi concluída
            // Use editReply since we deferred the interaction
            await interaction.editReply({
                content: `✅ A ficha foi ${isApproval ? 'aprovada' : 'recusada'} com sucesso.`,
                ephemeral: true
            });
        } else {
            logger.warning('Canal de log-ficha não configurado', {
                guildId: interaction.guild.id,
                suggestion: 'Configure usando /config canal tipo:logFicha'
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
                        if (member) {
                            const updatedCard = buildVerificationStaffMessageV2({
                                guild: interaction.guild,
                                member,
                                referralSource: referralInfo,
                                status: isApproval ? 'approved' : 'denied',
                                staffUser: staffMember
                            });
                            await message.edit({
                                embeds: [updatedCard],
                                components: []
                            });
                        }
                        
                        // Agendar exclusão da mensagem do canal de notificações após 1 minuto
                        setTimeout(async () => {
                            try {
                                await message.delete();
                                logger.info('Mensagem de notificação removida automaticamente', {
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
                    if (updateError.code === 10008) {
                        logger.warning('Mensagem de notificação de verificação já não existe (edit ignorado)', {
                            messageId: interaction.message?.id,
                            channelId: interaction.channelId
                        });
                    } else {
                        logger.error('Erro ao atualizar mensagem original', {
                            error: updateError.message,
                            messageId: interaction.message?.id,
                            channelId: interaction.channelId,
                            code: updateError.code
                        });
                    }
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
        logger.error('Erro ao processar ação de verificação', {
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

export { handleVerificationAction };
