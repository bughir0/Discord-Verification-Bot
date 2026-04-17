import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { database as db } from '../database/database.js';
import { getChannelId, getColors, getStaffMentions } from '../utils/configHelper.js';
import logger from '../utils/logger.js';

async function handleWhitelistModal(interaction) {
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

    // Extrair plataforma do customId
    // Formato: whitelist_modal_java ou whitelist_modal_bedrock
    let platform = 'java'; // Padrão
    if (interaction.customId.startsWith('whitelist_modal_')) {
        const customIdParts = interaction.customId.split('_');
        if (customIdParts.length >= 3) {
            const extractedPlatform = customIdParts[2];
            if (extractedPlatform === 'bedrock' || extractedPlatform === 'java') {
                platform = extractedPlatform;
            }
        }
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
        
        // Verificar se o sistema de whitelist está ativado
        const isEnabled = db.isSystemEnabled(interaction.guild.id, 'whitelist');
        if (!isEnabled) {
            const errorEmbed = new EmbedBuilder()
                .setColor(getColors().danger)
                .setTitle('⚠️ Sistema Desativado')
                .setDescription('O sistema de whitelist está temporariamente desativado. Entre em contato com um administrador para mais informações.');
            
            if (!alreadyAcknowledged) {
                return await interaction.editReply({ 
                    embeds: [errorEmbed]
                }).catch(console.error);
            } else {
                return await interaction.followUp({ 
                    embeds: [errorEmbed],
                    ephemeral: true
                }).catch(console.error);
            }
        }
        
        const minecraftUsername = interaction.fields.getTextInputValue('minecraft_username');
        const member = interaction.member;
        
        // Plataforma já foi extraída do customId acima
        
        // Validação básica
        if (!minecraftUsername || minecraftUsername.trim().length < 3) {
            const errorEmbed = new EmbedBuilder()
                .setColor(getColors().danger)
                .setTitle('❌ Erro')
                .setDescription('Por favor, forneça um nome de usuário do Minecraft válido (mínimo 3 caracteres).');
            
            if (!alreadyAcknowledged) {
                return await interaction.editReply({ 
                    embeds: [errorEmbed]
                }).catch(console.error);
            } else {
                // Se já foi reconhecida, tenta enviar uma nova mensagem
                return await interaction.followUp({ 
                    embeds: [errorEmbed],
                    ephemeral: true
                }).catch(console.error);
            }
        }

        // Validar formato do nome de usuário (apenas letras, números e underscore)
        const usernameRegex = /^[a-zA-Z0-9_]{3,16}$/;
        if (!usernameRegex.test(minecraftUsername.trim())) {
            const errorEmbed = new EmbedBuilder()
                .setColor(getColors().danger)
                .setTitle('❌ Erro')
                .setDescription('Nome de usuário inválido! Use apenas letras, números e underscore (3-16 caracteres).');
            
            if (!alreadyAcknowledged) {
                return await interaction.editReply({ 
                    embeds: [errorEmbed]
                }).catch(console.error);
            } else {
                return await interaction.followUp({ 
                    embeds: [errorEmbed],
                    ephemeral: true
                }).catch(console.error);
            }
        }
        
        try {
            // Salvar no banco de dados
            await db.upsertWhitelist(member.id, {
                status: 'pending',
                minecraftUsername: minecraftUsername.trim(),
                platform: platform
            });
            
            // Enviar mensagem de confirmação
            const colors = getColors();
            const successEmbed = new EmbedBuilder()
                .setColor(colors.success || 0x2ecc71)
                .setAuthor({ 
                    name: 'Formulário Enviado com Sucesso!', 
                    iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined 
                })
                .setTitle('<a:sucesso:1443149628085244036> Solicitação de Whitelist Enviada')
                .setDescription(`<@${member.user.id}>, sua solicitação de whitelist foi enviada com sucesso!`)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
                .addFields(
                    {
                        name: '📝 Próximos Passos',
                        value: 'A equipe irá analisar sua solicitação em breve. Você será notificado quando sua whitelist for processada.',
                        inline: false
                    },
                    {
                        name: '⏰ Tempo Estimado',
                        value: 'A análise geralmente leva alguns minutos. Por favor, aguarde pacientemente.',
                        inline: false
                    },
                    {
                        name: '🎮 Informação Enviada',
                        value: `**Nome de Usuário:** \`${minecraftUsername.trim()}\`\n**Plataforma:** ${platform === 'bedrock' ? '🔷 Bedrock' : '☕ Java'}`,
                        inline: false
                    }
                )
                .setFooter({ 
                    text: 'Você receberá uma notificação quando sua whitelist for processada', 
                    iconURL: interaction.guild.iconURL({ dynamic: true }) 
                })
                .setTimestamp();

            try {
                if (!alreadyAcknowledged) {
                    await interaction.editReply({
                        embeds: [successEmbed]
                    });
                } else {
                    // Se já foi reconhecida, tenta enviar uma nova mensagem
                    await interaction.followUp({
                        embeds: [successEmbed],
                        ephemeral: true
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
            logger.error('Erro ao salvar whitelist no banco de dados', { 
                error: dbError.message,
                userId: member.id
            });
            
            const errorEmbed = new EmbedBuilder()
                .setColor(getColors().danger)
                .setTitle('❌ Erro')
                .setDescription('Ocorreu um erro ao processar sua solicitação de whitelist. Por favor, tente novamente mais tarde.');
                
            return await interaction.editReply({ 
                embeds: [errorEmbed],
                flags: 64
            }).catch(console.error);
        }
        
        // Enviar mensagem no canal de solicitações de whitelist (wl-solicitacao)
        const whitelistSolicitacaoId = getChannelId(interaction.guild.id, 'whitelistSolicitacao');
        if (whitelistSolicitacaoId) {
            try {
                const notificationChannel = interaction.guild.channels.cache.get(whitelistSolicitacaoId);
                
                if (notificationChannel) {
                    // Calcular idade da conta
                    const accountAge = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24));
                    const accountAgeText = accountAge === 0 ? 'Hoje' : accountAge === 1 ? '1 dia' : `${accountAge} dias`;
                    
                    // Calcular tempo no servidor
                    const timeInServer = Math.floor((Date.now() - member.joinedTimestamp) / (1000 * 60 * 60 * 24));
                    const timeInServerText = timeInServer === 0 ? 'Hoje' : timeInServer === 1 ? '1 dia' : `${timeInServer} dias`;
                    
                    const colors = getColors();
                    const embed = new EmbedBuilder()
                        .setColor(0xf39c12) // Laranja para pendente
                        .setAuthor({ 
                            name: 'Nova Solicitação de Whitelist', 
                            iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined 
                        })
                        .setTitle('🎮 Whitelist Pendente')
                        .setDescription(`**${member.user}** solicitou whitelist no servidor`)
                        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
                        .addFields(
                            {
                                name: '👤 Informações do Usuário',
                                value: `**Tag:** ${member.user.tag}\n**ID:** \`${member.id}\``,
                                inline: true
                            },
                            {
                                name: '🎮 Nome de Usuário Minecraft',
                                value: `\`${minecraftUsername.trim()}\``,
                                inline: true
                            },
                            {
                                name: '📱 Plataforma',
                                value: platform === 'bedrock' ? '🔷 **Bedrock**' : '☕ **Java**',
                                inline: true
                            },
                            {
                                name: '📅 Informações da Conta',
                                value: `**Criada:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
                                inline: true
                            },
                            {
                                name: '🏠 No Servidor',
                                value: `**Entrou:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
                                inline: true
                            },
                            {
                                name: '📝 Status da Whitelist',
                                value: '```🟡 PENDENTE - Aguardando análise da equipe```',
                                inline: false
                            }
                        )
                        .setFooter({ 
                            text: `ID: ${member.id} • Clique nos botões abaixo para aprovar ou recusar`, 
                            iconURL: interaction.guild.iconURL({ dynamic: true }) 
                        })
                        .setTimestamp();

                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`whitelist_approve_${member.id}`)
                                .setLabel('Aprovar')
                                .setStyle(ButtonStyle.Success)
                                .setEmoji('sucesso:1443149628085244036'),
                            new ButtonBuilder()
                                .setCustomId(`whitelist_deny_${member.id}`)
                                .setLabel('Recusar')
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('erro:1443149642580758569')
                        );
                        
                    const staffMention = getStaffMentions(interaction.guild.id, interaction.guild);
                    
                    // Verificar permissões antes de enviar
                    const botMember = interaction.guild.members.me;
                    if (botMember && notificationChannel.permissionsFor(botMember)?.has(['SendMessages', 'EmbedLinks', 'ViewChannel'])) {
                        await notificationChannel.send({
                            content: `${staffMention} Nova whitelist pendente!`,
                            embeds: [embed],
                            components: [row]
                        });
                        
                        logger.info('Solicitação de whitelist enviada para wl-solicitacao', {
                            guildId: interaction.guild.id,
                            userId: member.id,
                            channelId: whitelistSolicitacaoId
                        });
                    } else {
                        logger.warning('Bot não tem permissão para enviar no canal wl-solicitacao', {
                            guildId: interaction.guild.id,
                            channelId: whitelistSolicitacaoId
                        });
                    }
                } else {
                    logger.debug('Canal wl-solicitacao não encontrado (pode ter sido deletado)', {
                        guildId: interaction.guild.id,
                        channelId: whitelistSolicitacaoId
                    });
                }
            } catch (channelError) {
                logger.error('Erro ao enviar solicitação de whitelist para wl-solicitacao', {
                    error: channelError.message,
                    channelId: whitelistSolicitacaoId,
                    guildId: interaction.guild.id
                });
                // Não interrompe o fluxo - a whitelist já foi salva no banco
            }
        } else {
            logger.debug('Canal wl-solicitacao não configurado', {
                guildId: interaction.guild.id,
                suggestion: 'Configure usando /config canal tipo:whitelistSolicitacao'
            });
        }
        
    } catch (error) {
        logger.error('Erro no modal de whitelist', {
            error: error.message,
            stack: error.stack,
            userId: interaction.member?.id,
            username: interaction.member?.user?.tag || 'Unknown'
        });
        
        const errorEmbed = new EmbedBuilder()
            .setColor(getColors().danger)
            .setTitle('❌ Erro')
            .setDescription('Ocorreu um erro ao processar seu formulário de whitelist.')
            .setFooter({ 
                text: 'Erro', 
                iconURL: interaction.guild?.iconURL() 
            })
            .setTimestamp();

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    embeds: [errorEmbed],
                    flags: 64
                }).catch(console.error);
            } else {
                await interaction.reply({
                    embeds: [errorEmbed],
                    ephemeral: true,
                    flags: 64
                }).catch(console.error);
            }
        } catch (replyError) {
            logger.error('Falha ao enviar mensagem de erro em whitelistModal', {
                error: replyError.message,
                stack: replyError.stack,
                interactionId: interaction.id,
                userId: interaction.user?.id
            });
            
            // Se tudo mais falhar, tenta enviar uma mensagem direta
            try {
                if (interaction.member) {
                    await interaction.member.send({
                        content: '❌ Ocorreu um erro ao processar seu formulário de whitelist. Por favor, tente novamente mais tarde.'
                    }).catch(dmError => {
                        logger.error('Falha ao enviar DM de erro em whitelistModal', {
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

export { handleWhitelistModal };

