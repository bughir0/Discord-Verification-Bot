import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { database as db } from '../database/database.js';
import { getChannelId, getRoleId, getColors, getStaffMentions, getStaffRoleIds } from '../utils/configHelper.js';
import { buildVerificationStaffMessageV2, mergeEmbedWithRows, toEmbedReply } from '../utils/embedBuilderV2.js';
import logger from '../utils/logger.js';

async function handleVerificationModal(interaction) {
    // Verifica se a interação já foi respondida
    if (interaction.replied || interaction.deferred) {
        logger.warning('Tentativa de processar interação já respondida', {
            interactionId: interaction.id,
            customId: interaction.customId,
            userId: interaction.user.id,
            username: interaction.user.username
        });
        return;
    }

    const deferPromise = interaction.deferReply({ ephemeral: true }).catch(error => {
        // Se já foi respondida, apenas log o aviso
        if (error.code === 40060) { // Interaction already acknowledged
            logger.warning('Tentativa de deferir interação já reconhecida', {
                interactionId: interaction.id,
                error: error.message
            });
            return { alreadyAcknowledged: true };
        }
        throw error; // Rejeita outros erros
    });

    try {
        const deferResult = await deferPromise;
        const alreadyAcknowledged = deferResult?.alreadyAcknowledged === true;
        
        // Verificar se o sistema de verificação está ativado
        const isEnabled = db.isSystemEnabled(interaction.guild.id, 'verification');
        if (!isEnabled) {
            const errorEmbed = new EmbedBuilder()
                .setColor(getColors().danger)
                .setTitle('⚠️ Sistema Desativado')
                .setDescription('O sistema de verificação está temporariamente desativado. Entre em contato com um administrador para mais informações.');
            
            if (!alreadyAcknowledged) {
                return await interaction.editReply(toEmbedReply(errorEmbed, true)).catch(console.error);
            } else {
                return await interaction.followUp({ 
                    ...toEmbedReply(errorEmbed, true)
                }).catch(console.error);
            }
        }
        
        const referralName = interaction.fields.getTextInputValue('referral_name');
        const member = interaction.member;
        
        // Validação básica
        if (!referralName || referralName.trim().length < 2) {
            const errorEmbed = new EmbedBuilder()
                .setColor(getColors().danger)
                .setTitle('❌ Erro')
                .setDescription('Por favor, forneça um nome de referência válido.');
            
            if (!alreadyAcknowledged) {
                return await interaction.editReply(toEmbedReply(errorEmbed, true)).catch(console.error);
            } else {
                // Se já foi reconhecida, tenta enviar uma nova mensagem
                return await interaction.followUp({ 
                    ...toEmbedReply(errorEmbed, true)
                }).catch(console.error);
            }
        }

        // Verificar se o canal de notificações está configurado ANTES de processar
        const notificationChannelId = getChannelId(interaction.guild.id, 'notification');
        if (!notificationChannelId) {
            const staffMention = getStaffMentions(interaction.guild.id, interaction.guild);
            const errorEmbed = new EmbedBuilder()
                .setColor(getColors().warning)
                .setTitle('⚠️ Sistema Indisponível')
                .setDescription('O sistema de verificação não está configurado no momento.')
                .addFields({
                    name: '📞 O que fazer?',
                    value: `Entre em contato com ${staffMention} para resolver este problema.\n\nO canal de notificações de verificação precisa ser configurado por um administrador.`,
                    inline: false
                })
                .setFooter({ 
                    text: 'Por favor, entre em contato com a equipe', 
                    iconURL: interaction.guild.iconURL({ dynamic: true }) 
                })
                .setTimestamp();
            
            if (!alreadyAcknowledged) {
                return await interaction.editReply(toEmbedReply(errorEmbed, true)).catch(console.error);
            } else {
                return await interaction.followUp({ 
                    ...toEmbedReply(errorEmbed, true)
                }).catch(console.error);
            }
        }
        
        try {
            // Salvar no banco de dados
            await db.upsertVerification(member.id, {
                status: 'pending',
                referralSource: referralName.trim()
            });
            
            // Enviar mensagem de confirmação
            const colors = getColors();
            const successEmbed = new EmbedBuilder()
                .setColor(colors.success || 0x2ecc71)
                .setAuthor({ 
                    name: 'Formulário Enviado com Sucesso!', 
                    iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined 
                })
                .setTitle('✅ Verificação Enviada')
                .setDescription(`<@${member.user.id}>, seu formulário de verificação foi enviado com sucesso!`)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
                .addFields(
                    {
                        name: '📝 Próximos Passos',
                        value: 'A equipe irá analisar sua solicitação em breve. Você será notificado quando sua verificação for processada.',
                        inline: false
                    },
                    {
                        name: '⏰ Tempo Estimado',
                        value: 'A análise geralmente leva alguns minutos. Por favor, aguarde pacientemente.',
                        inline: false
                    },
                    {
                        name: '📌 Informação Enviada',
                        value: `**Indicado por:** ${referralName || 'Não informado'}`,
                        inline: false
                    }
                )
                .setFooter({ 
                    text: 'Você receberá uma notificação quando sua verificação for processada', 
                    iconURL: interaction.guild.iconURL({ dynamic: true }) 
                })
                .setTimestamp();

            try {
                if (!alreadyAcknowledged) {
                    await interaction.editReply(toEmbedReply(successEmbed, true));
                } else {
                    // Se já foi reconhecida, tenta enviar uma nova mensagem
                    await interaction.followUp({
                        ...toEmbedReply(successEmbed, true)
                    });
                }
            } catch (error) {
                logger.error('Erro ao enviar mensagem de sucesso', {
                    error: error.message,
                    interactionId: interaction.id,
                    userId: member.id,
                    username: member.user.username
                });
            }
        } catch (dbError) {
            logger.error('Erro ao salvar verificação no banco de dados', { 
                error: dbError.message,
                userId: member.id
            });
            
            const errorEmbed = new EmbedBuilder()
                .setColor(getColors().danger)
                .setTitle('❌ Erro')
                .setDescription('Ocorreu um erro ao processar sua verificação. Por favor, tente novamente mais tarde.');
                
            return await interaction.editReply(toEmbedReply(errorEmbed, true)).catch(console.error);
        }
        
        // Enviar mensagem no canal de notificações de verificação
        // Nota: Este é o canal de notificações de verificação (não é um sistema de tickets)
        // notificationChannelId já foi verificado acima, então sabemos que existe
        if (notificationChannelId) {
            try {
                const notificationChannel = interaction.guild.channels.cache.get(notificationChannelId);
                
                if (notificationChannel) {
                    // Calcular idade da conta
                    const accountAge = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24));
                    const accountAgeText = accountAge === 0 ? 'Hoje' : accountAge === 1 ? '1 dia' : `${accountAge} dias`;
                    
                    // Calcular tempo no servidor
                    const timeInServer = Math.floor((Date.now() - member.joinedTimestamp) / (1000 * 60 * 60 * 24));
                    const timeInServerText = timeInServer === 0 ? 'Hoje' : timeInServer === 1 ? '1 dia' : `${timeInServer} dias`;
                    
                    const staffCard = buildVerificationStaffMessageV2({
                        guild: interaction.guild,
                        member,
                        referralSource: referralName.trim(),
                        status: 'pending'
                    });

                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`verify_approve_${member.id}`)
                                .setLabel('Aprovar')
                                .setStyle(ButtonStyle.Success)
                                .setEmoji('sucesso:1443149628085244036'),
                            new ButtonBuilder()
                                .setCustomId(`verify_deny_${member.id}`)
                                .setLabel('Recusar')
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('erro:1443149642580758569')
                        );
                        
                    const staffMention = getStaffMentions(interaction.guild.id, interaction.guild);
                    
                    // Verificar permissões antes de enviar
                    const botMember = interaction.guild.members.me;
                    if (botMember && notificationChannel.permissionsFor(botMember)?.has(['SendMessages', 'EmbedLinks', 'ViewChannel'])) {
                        await notificationChannel.send({
                            ...mergeEmbedWithRows(staffCard, [row], {
                                content: `${staffMention} Nova verificação pendente!`
                            }),
                            allowedMentions: { roles: getStaffRoleIds(interaction.guild.id) }
                        });
                        
                        logger.info('Notificação de verificação enviada', {
                            guildId: interaction.guild.id,
                            userId: member.id,
                            channelId: notificationChannelId
                        });
                    } else {
                        logger.warning('Bot não tem permissão para enviar no canal de notificações', {
                            guildId: interaction.guild.id,
                            channelId: notificationChannelId
                        });
                    }
                } else {
                    logger.debug('Canal de notificações não encontrado (pode ter sido deletado)', {
                        guildId: interaction.guild.id,
                        channelId: notificationChannelId
                    });
                }
            } catch (channelError) {
                logger.error('Erro ao enviar notificação de verificação', {
                    error: channelError.message,
                    channelId: notificationChannelId,
                    guildId: interaction.guild.id
                });
                // Não interrompe o fluxo - a verificação já foi salva no banco
            }
        }
        
    } catch (error) {
        logger.error('Erro no modal de verificação', {
            error: error.message,
            stack: error.stack,
            userId: interaction.member?.id,
            username: interaction.member?.user?.tag || 'Unknown'
        });
        
        const errorEmbed = new EmbedBuilder()
            .setColor(getColors().danger)
            .setTitle('❌ Erro')
            .setDescription('Ocorreu um erro ao processar seu formulário de verificação.')
            .setFooter({ 
                text: 'Erro', 
                iconURL: interaction.guild?.iconURL() 
            })
            .setTimestamp();

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply(toEmbedReply(errorEmbed, true)).catch(console.error);
            } else {
                await interaction.reply({
                    ...toEmbedReply(errorEmbed, true)
                }).catch(console.error);
            }
        } catch (replyError) {
            logger.error('Falha ao enviar mensagem de erro em verificationModal', {
                error: replyError.message,
                stack: replyError.stack,
                interactionId: interaction.id,
                userId: interaction.user?.id
            });
            
            // Se tudo mais falhar, tenta enviar uma mensagem direta
            try {
                if (interaction.member) {
                    await interaction.member.send({
                        content: '❌ Ocorreu um erro ao processar seu formulário de verificação. Por favor, tente novamente mais tarde.'
                    }).catch(dmError => {
                        logger.error('Falha ao enviar DM de erro em verificationModal', {
                            error: dmError.message,
                            stack: dmError.stack,
                            userId: interaction.user?.id
                        });
                    });
                }
            } catch (dmError) {
                console.error('Falha ao enviar mensagem direta:', dmError);
            }
        }
    }
}

export { handleVerificationModal };
