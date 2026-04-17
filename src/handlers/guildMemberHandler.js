import { EmbedBuilder } from 'discord.js';
import { toV2FromEmbedBuilder } from '../utils/embedBuilderV2.js';
import { getChannelId, getBoostRemovableRoleIds } from '../utils/configHelper.js';
import logger from '../utils/logger.js';
import { database as db } from '../database/database.js';
import config from '../config.js';

function getLogChannel(guild, channelType) {
    const channelId = getChannelId(guild.id, channelType);
    if (!channelId) return null;
    
    const channel = guild.channels.cache.get(channelId);
    return channel;
}

export async function handleGuildMemberAdd(member) {
    try {
        // Tentar usar canal específico de logs de membros, depois log geral, depois modLogs
        const logChannel = getLogChannel(member.guild, 'memberLogs') || getLogChannel(member.guild, 'log') || getLogChannel(member.guild, 'modLogs');
        if (!logChannel) {
            return;
        }

        // Verificar se o bot tem permissão para enviar mensagens
        if (!logChannel.permissionsFor(member.guild.members.me)?.has(['SendMessages', 'EmbedLinks'])) {
            logger.warning('Bot não tem permissão para enviar logs', {
                guildId: member.guild.id,
                channelId: logChannel.id,
                channelName: logChannel.name
            });
            return;
        }

        const accountAge = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24));
        const accountAgeText = accountAge === 0 ? 'Hoje' : accountAge === 1 ? '1 dia' : `${accountAge} dias`;
        
        const embed = new EmbedBuilder()
            .setColor(0x2ecc71) // Verde mais suave
            .setAuthor({ 
                name: 'Novo Membro Entrou', 
                iconURL: member.guild.iconURL({ dynamic: true }) || undefined 
            })
            .setTitle(`👋 Bem-vindo(a), ${member.user.username}!`)
            .setDescription(`**${member.user}** acabou de entrar no servidor`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { 
                    name: '👤 Informações do Usuário', 
                    value: `**Tag:** ${member.user.tag}\n**ID:** \`${member.user.id}\``, 
                    inline: true 
                },
                { 
                    name: '📅 Informações da Conta', 
                    value: `**Criada:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, 
                    inline: true 
                },
                { 
                    name: '📊 Estatísticas do Servidor', 
                    value: `**Total de Membros:** ${member.guild.memberCount.toLocaleString('pt-BR')}\n**Posição:** ${member.guild.memberCount}º membro`, 
                    inline: false 
                }
            )
            .setFooter({ 
                text: `Entrou em ${member.guild.name}`, 
                iconURL: member.user.displayAvatarURL({ dynamic: true }) 
            })
            .setTimestamp();

        await logChannel.send({ ...toV2FromEmbedBuilder(embed) }).catch(err => {
            // Tratar erros de timeout e conexão como warnings, não erros críticos
            const isNetworkError = err.message?.includes('timeout') || 
                                 err.message?.includes('Timeout') || 
                                 err.message?.includes('ECONNRESET') ||
                                 err.message?.includes('ENOTFOUND') ||
                                 err.message?.includes('ETIMEDOUT') ||
                                 err.code === 'ECONNRESET' ||
                                 err.code === 'ETIMEDOUT';
            
            if (isNetworkError) {
                logger.warning('Erro de conexão ao enviar log de novo membro (timeout/rede)', {
                    error: err.message,
                    errorCode: err.code,
                    guildId: member.guild.id,
                    userId: member.user.id,
                    channelId: logChannel.id
                });
            } else {
                logger.error('Erro ao enviar log de novo membro', {
                    error: err.message,
                    errorCode: err.code,
                    guildId: member.guild.id,
                    userId: member.user.id,
                    channelId: logChannel.id
                });
            }
        });
        
        logger.info('Log de novo membro enviado', {
            guildId: member.guild.id,
            userId: member.user.id,
            channelId: logChannel.id
        });
    } catch (error) {
        // Tratar erros de timeout e conexão como warnings, não erros críticos
        const isNetworkError = error.message?.includes('timeout') || 
                              error.message?.includes('Timeout') || 
                              error.message?.includes('ECONNRESET') ||
                              error.message?.includes('ENOTFOUND') ||
                              error.message?.includes('ETIMEDOUT') ||
                              error.code === 'ECONNRESET' ||
                              error.code === 'ETIMEDOUT';
        
        if (isNetworkError) {
            logger.warning('Erro de conexão ao processar novo membro (timeout/rede)', {
                error: error.message,
                errorCode: error.code,
                guildId: member.guild?.id,
                userId: member.user?.id
            });
        } else {
            logger.error('Erro ao enviar log de novo membro', {
                error: error.message,
                errorCode: error.code,
                guildId: member.guild?.id,
                userId: member.user?.id
            });
        }
    }
}

export async function handleGuildMemberUpdate(oldMember, newMember) {
    try {
        // Verificar mudanças de boost
        const oldStatus = oldMember.premiumSinceTimestamp;
        const newStatus = newMember.premiumSinceTimestamp;
        
        // Boost foi adicionado
        if (!oldStatus && newStatus) {
            try {
                // Enviar mensagem de log no canal de boost
                const boostLogChannelId = getChannelId(newMember.guild.id, 'boostLog');
                const boostLogChannel = boostLogChannelId 
                    ? newMember.guild.channels.cache.get(boostLogChannelId) 
                    : null;
                
                if (boostLogChannel) {
                    // Verificar permissões
                    const botMember = newMember.guild.members.me;
                    const permissions = boostLogChannel.permissionsFor(botMember);
                    
                    if (permissions?.has(['SendMessages', 'EmbedLinks', 'ViewChannel'])) {
                        const boostAddedTimestamp = Date.now();
                        const colors = config.colors;
                        
                        const embed = new EmbedBuilder()
                            .setColor(colors.success || 0x2ecc71)
                            .setAuthor({
                                name: newMember.user.username,
                                iconURL: newMember.user.displayAvatarURL({ dynamic: true }),
                            })
                            .setDescription(
                                `**O membro:** ${newMember.user} adicionou impulso ao servidor <a:LHU3_B1:806688854111289405> !`
                            )
                            .addFields({
                                name: '**Data de adição do boost:**',
                                value: `<t:${Math.floor(boostAddedTimestamp / 1000)}:F>`,
                            })
                            .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true, size: 256 }))
                            .setFooter({ 
                                text: `ID: ${newMember.user.id}`, 
                                iconURL: newMember.guild.iconURL({ dynamic: true }) 
                            })
                            .setTimestamp();

                        await boostLogChannel.send({ ...toV2FromEmbedBuilder(embed) }).catch(err => {
                            logger.error('Erro ao enviar log de boost adicionado', {
                                error: err.message,
                                guildId: newMember.guild.id,
                                userId: newMember.user.id,
                                channelId: boostLogChannel.id
                            });
                        });
                    } else {
                        logger.warning('Bot não tem permissão para enviar log de boost', {
                            guildId: newMember.guild.id,
                            channelId: boostLogChannel.id
                        });
                    }
                }
            } catch (boostError) {
                logger.error('Erro ao processar adição de boost', {
                    error: boostError.message,
                    stack: boostError.stack,
                    guildId: newMember.guild.id,
                    userId: newMember.user.id
                });
            }
        }
        
        // Boost foi removido
        if (oldStatus && !newStatus) {
            // Boost foi removido
            try {
                // Obter cargos removíveis configurados
                const boostRemovableRoles = getBoostRemovableRoleIds(newMember.guild.id);
                
                if (boostRemovableRoles.length > 0) {
                    // Remover os cargos da lista 'boostRemovableRoles' do membro
                    const rolesToRemove = boostRemovableRoles.filter(roleId => 
                        newMember.roles.cache.has(roleId)
                    );
                    
                    if (rolesToRemove.length > 0) {
                        await newMember.roles.remove(rolesToRemove);
                        logger.info('Cargos removidos após boost removido', {
                            userId: newMember.user.id,
                            guildId: newMember.guild.id,
                            rolesRemoved: rolesToRemove
                        });
                    }
                }
                
                // Enviar mensagem de log no canal de boost
                const boostLogChannelId = getChannelId(newMember.guild.id, 'boostLog');
                const boostLogChannel = boostLogChannelId 
                    ? newMember.guild.channels.cache.get(boostLogChannelId) 
                    : null;
                
                if (boostLogChannel) {
                    // Verificar permissões
                    const botMember = newMember.guild.members.me;
                    const permissions = boostLogChannel.permissionsFor(botMember);
                    
                    if (permissions?.has(['SendMessages', 'EmbedLinks', 'ViewChannel'])) {
                        const boostRemovedTimestamp = Date.now();
                        const colors = config.colors;
                        
                        const embed = new EmbedBuilder()
                            .setColor(colors.danger || 0xac171c)
                            .setAuthor({
                                name: newMember.user.username,
                                iconURL: newMember.user.displayAvatarURL({ dynamic: true }),
                            })
                            .setDescription(
                                `**O membro:** ${newMember.user} removeu o impulso do servidor <a:LHU3_B1:806688854111289405> !`
                            )
                            .addFields({
                                name: '**Data de remoção do boost:**',
                                value: `<t:${Math.floor(boostRemovedTimestamp / 1000)}:F>`,
                            })
                            .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true, size: 256 }))
                            .setFooter({ 
                                text: `ID: ${newMember.user.id}`, 
                                iconURL: newMember.guild.iconURL({ dynamic: true }) 
                            })
                            .setTimestamp();

                        await boostLogChannel.send({ ...toV2FromEmbedBuilder(embed) }).catch(err => {
                            logger.error('Erro ao enviar log de boost removido', {
                                error: err.message,
                                guildId: newMember.guild.id,
                                userId: newMember.user.id,
                                channelId: boostLogChannel.id
                            });
                        });
                    } else {
                        logger.warning('Bot não tem permissão para enviar log de boost', {
                            guildId: newMember.guild.id,
                            channelId: boostLogChannel.id
                        });
                    }
                }
            } catch (boostError) {
                logger.error('Erro ao processar remoção de boost', {
                    error: boostError.message,
                    stack: boostError.stack,
                    guildId: newMember.guild.id,
                    userId: newMember.user.id
                });
            }
        }
        
        // Verificar mudanças de nickname/display name
        const oldNickname = oldMember.nickname;
        const newNickname = newMember.nickname;
        const nicknameChanged = oldNickname !== newNickname;
        
        if (nicknameChanged) {
            // Usar canal específico de logs de display name
            const logChannel = getLogChannel(newMember.guild, 'logDisplayName') || getLogChannel(newMember.guild, 'memberLogs') || getLogChannel(newMember.guild, 'log') || getLogChannel(newMember.guild, 'modLogs');
            if (logChannel && logChannel.permissionsFor(newMember.guild.members.me)?.has(['SendMessages', 'EmbedLinks', 'ViewChannel'])) {
                // Formatar valores de nickname corretamente
                const formatNickname = (nickname) => {
                    if (!nickname || nickname.trim() === '') {
                        return '*Sem display name*';
                    }
                    return `\`${nickname}\``;
                };
                
                const oldNicknameFormatted = formatNickname(oldNickname);
                const newNicknameFormatted = formatNickname(newNickname);
                
                const embed = new EmbedBuilder()
                    .setColor(0x9b59b6) // Roxo para mudanças de nickname
                    .setAuthor({ 
                        name: 'Display Name Alterado', 
                        iconURL: newMember.guild.iconURL({ dynamic: true }) || undefined 
                    })
                    .setTitle(`📝 ${newMember.user.username} alterou o display name`)
                    .setDescription(`**${newMember.user}** alterou seu nome de exibição no servidor`)
                    .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true, size: 256 }))
                    .addFields(
                        {
                            name: '📝 Display Name',
                            value: `**Antes:** ${oldNicknameFormatted}\n**Depois:** ${newNicknameFormatted}`,
                            inline: false
                        },
                        {
                            name: '👤 Usuário',
                            value: `${newMember.user.tag}\n\`${newMember.user.id}\``,
                            inline: true
                        },
                        {
                            name: '⏰ Quando',
                            value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                            inline: true
                        }
                    )
                    .setFooter({ 
                        text: `ID: ${newMember.user.id}`, 
                        iconURL: newMember.user.displayAvatarURL({ dynamic: true }) 
                    })
                    .setTimestamp();

                await logChannel.send({ ...toV2FromEmbedBuilder(embed) }).catch(err => {
                    // Tratar erros de timeout e conexão como warnings, não erros críticos
                    const isNetworkError = err.message?.includes('timeout') || 
                                         err.message?.includes('Timeout') || 
                                         err.message?.includes('ECONNRESET') ||
                                         err.message?.includes('ENOTFOUND') ||
                                         err.message?.includes('ETIMEDOUT') ||
                                         err.code === 'ECONNRESET' ||
                                         err.code === 'ETIMEDOUT';
                    
                    if (isNetworkError) {
                        logger.warning('Erro de conexão ao enviar log de mudança de nickname (timeout/rede)', {
                            error: err.message,
                            errorCode: err.code,
                            guildId: newMember.guild.id,
                            userId: newMember.user.id
                        });
                    } else {
                        logger.warning('Erro ao enviar log de mudança de nickname', {
                            error: err.message,
                            errorCode: err.code,
                            guildId: newMember.guild.id,
                            userId: newMember.user.id
                        });
                    }
                });
                
                logger.info('Log de mudança de display name enviado', {
                    guildId: newMember.guild.id,
                    userId: newMember.user.id,
                    oldNickname,
                    newNickname,
                    channelId: logChannel.id
                });
            }
        }
        
        // Verificar mudanças de cargo comparando os IDs diretamente
        // Isso detecta mudanças mesmo quando o número total de cargos permanece o mesmo
        const oldRoleIds = new Set(oldMember.roles.cache.keys());
        const newRoleIds = new Set(newMember.roles.cache.keys());
        
        // Encontrar cargos adicionados e removidos
        const addedRoles = newMember.roles.cache.filter(role => !oldRoleIds.has(role.id));
        const removedRoles = oldMember.roles.cache.filter(role => !newRoleIds.has(role.id));
        
        // Verificar se houve alguma mudança real (ignorar @everyone)
        const hasChanges = addedRoles.size > 0 || removedRoles.size > 0;
        
        if (hasChanges) {
            // Usar canal específico de logs de cargo, com fallback para log geral
            const logChannel = getLogChannel(newMember.guild, 'logRole') || getLogChannel(newMember.guild, 'log') || getLogChannel(newMember.guild, 'modLogs');
            if (!logChannel) {
                logger.debug('Canal de log de cargo não configurado para guildMemberUpdate', { guildId: newMember.guild.id });
                return;
            }

            // Verificar se o bot tem permissão para enviar mensagens
            if (!logChannel.permissionsFor(newMember.guild.members.me)?.has(['SendMessages', 'EmbedLinks', 'ViewChannel'])) {
                logger.warning('Bot não tem permissão para enviar logs de cargo', {
                    guildId: newMember.guild.id,
                    channelId: logChannel.id
                });
                return;
            }

            // Determinar cor baseada na ação (verde para adicionar, vermelho para remover, azul para ambos)
            let embedColor = 0x3498db; // Azul padrão
            if (addedRoles.size > 0 && removedRoles.size === 0) {
                embedColor = 0x2ecc71; // Verde para apenas adicionar
            } else if (removedRoles.size > 0 && addedRoles.size === 0) {
                embedColor = 0xe74c3c; // Vermelho para apenas remover
            }

            const embed = new EmbedBuilder()
                .setColor(embedColor)
                .setAuthor({ 
                    name: 'Cargos Atualizados', 
                    iconURL: newMember.guild.iconURL({ dynamic: true }) || undefined 
                })
                .setTitle(`🔄 ${newMember.user.username} teve cargos atualizados`)
                .setDescription(`**${newMember.user}** teve alterações em seus cargos`)
                .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true, size: 256 }))
                .setTimestamp();

            if (addedRoles.size > 0) {
                const rolesList = addedRoles.map(role => `<@&${role.id}>`).join(' ') || 'Nenhum';
                embed.addFields({
                    name: `➕ Cargos Adicionados (${addedRoles.size})`,
                    value: rolesList.length > 1024 ? rolesList.slice(0, 1020) + '...' : rolesList,
                    inline: false
                });
            }

            if (removedRoles.size > 0) {
                const rolesList = removedRoles.map(role => `<@&${role.id}>`).join(' ') || 'Nenhum';
                embed.addFields({
                    name: `➖ Cargos Removidos (${removedRoles.size})`,
                    value: rolesList.length > 1024 ? rolesList.slice(0, 1020) + '...' : rolesList,
                    inline: false
                });
            }

            // Informações adicionais
            const totalRoles = newMember.roles.cache.size - 1; // -1 to exclude @everyone
            embed.addFields(
                {
                    name: '📊 Total de Cargos',
                    value: `**${totalRoles}** cargo${totalRoles !== 1 ? 's' : ''}`,
                    inline: true
                },
                {
                    name: '👤 Usuário',
                    value: `${newMember.user.tag}\n\`${newMember.user.id}\``,
                    inline: true
                },
                {
                    name: '⏰ Quando',
                    value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                    inline: true
                }
            )
            .setFooter({ 
                text: `ID: ${newMember.user.id}`, 
                iconURL: newMember.user.displayAvatarURL({ dynamic: true }) 
            });

            await logChannel.send({ ...toV2FromEmbedBuilder(embed) }).catch(err => {
                // Tratar erros de timeout e conexão como warnings, não erros críticos
                const isNetworkError = err.message?.includes('timeout') || 
                                     err.message?.includes('Timeout') || 
                                     err.message?.includes('ECONNRESET') ||
                                     err.message?.includes('ENOTFOUND') ||
                                     err.message?.includes('ETIMEDOUT') ||
                                     err.code === 'ECONNRESET' ||
                                     err.code === 'ETIMEDOUT';
                
                if (isNetworkError) {
                    logger.warning('Erro de conexão ao enviar log de atualização de cargos (timeout/rede)', {
                        error: err.message,
                        errorCode: err.code,
                        guildId: newMember.guild.id,
                        userId: newMember.user.id,
                        channelId: logChannel.id
                    });
                } else {
                    logger.error('Erro ao enviar log de atualização de cargos', {
                        error: err.message,
                        errorCode: err.code,
                        guildId: newMember.guild.id,
                        userId: newMember.user.id,
                        channelId: logChannel.id
                    });
                }
            });
            
            logger.info('Log de atualização de cargos enviado', {
                guildId: newMember.guild.id,
                userId: newMember.user.id,
                addedRoles: addedRoles.size,
                removedRoles: removedRoles.size,
                channelId: logChannel.id
            });
        }
    } catch (error) {
        // Tratar erros de timeout e conexão como warnings, não erros críticos
        const isNetworkError = error.message?.includes('timeout') || 
                              error.message?.includes('Timeout') || 
                              error.message?.includes('ECONNRESET') ||
                              error.message?.includes('ENOTFOUND') ||
                              error.message?.includes('ETIMEDOUT') ||
                              error.code === 'ECONNRESET' ||
                              error.code === 'ETIMEDOUT';
        
        if (isNetworkError) {
            logger.warning('Erro de conexão ao processar atualização de membro (timeout/rede)', {
                error: error.message,
                errorCode: error.code,
                guildId: newMember.guild?.id,
                userId: newMember.user?.id
            });
        } else {
            logger.error('Erro ao enviar log de atualização de membro', {
                error: error.message,
                errorCode: error.code,
                guildId: newMember.guild?.id,
                userId: newMember.user?.id
            });
        }
    }
}

export async function handleGuildMemberRemove(member) {
    try {
        // Tentar usar canal específico de logs de membros, depois log geral, depois modLogs
        const logChannel = getLogChannel(member.guild, 'memberLogs') || getLogChannel(member.guild, 'log') || getLogChannel(member.guild, 'modLogs');
        if (!logChannel) {
            return;
        }

        // Verificar se o bot tem permissão para enviar mensagens
        if (!logChannel.permissionsFor(member.guild.members.me)?.has(['SendMessages', 'EmbedLinks'])) {
            logger.warning('Bot não tem permissão para enviar logs', {
                guildId: member.guild.id,
                channelId: logChannel.id
            });
            return;
        }

        const roles = member.roles.cache
            .filter(role => role.id !== member.guild.id) // Filter out @everyone role
            .map(role => `<@&${role.id}>`)
            .join(' ') || 'Nenhum cargo';
        
        // Calcular tempo no servidor
        let timeInServer = 'Desconhecido';
        if (member.joinedAt) {
            const timeDiff = Date.now() - member.joinedTimestamp;
            const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
            
            if (days > 0) {
                timeInServer = `${days} dia${days !== 1 ? 's' : ''}`;
                if (hours > 0) timeInServer += ` e ${hours}h`;
            } else if (hours > 0) {
                timeInServer = `${hours}h`;
                if (minutes > 0) timeInServer += ` e ${minutes}min`;
            } else {
                timeInServer = `${minutes}min`;
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0xe74c3c) // Vermelho mais suave
            .setAuthor({ 
                name: 'Membro Saiu do Servidor', 
                iconURL: member.guild.iconURL({ dynamic: true }) || undefined 
            })
            .setTitle(`👋 ${member.user.username} saiu`)
            .setDescription(`**${member.user}** deixou o servidor`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { 
                    name: '👤 Informações do Usuário', 
                    value: `**Tag:** ${member.user.tag}\n**ID:** \`${member.user.id}\``, 
                    inline: true 
                },
                { 
                    name: '📅 Informações de Entrada', 
                    value: member.joinedAt 
                        ? `**Entrou:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>\n**Tempo:** ${timeInServer}` 
                        : 'Desconhecido', 
                    inline: true 
                },
                { 
                    name: '👥 Cargos que Possuía', 
                    value: roles.length > 1024 ? roles.slice(0, 1020) + '...' : roles, 
                    inline: false 
                },
                { 
                    name: '📊 Estatísticas', 
                    value: `**Total de Membros:** ${member.guild.memberCount.toLocaleString('pt-BR')}`, 
                    inline: true 
                }
            )
            .setFooter({ 
                text: `Saiu de ${member.guild.name}`, 
                iconURL: member.user.displayAvatarURL({ dynamic: true }) 
            })
            .setTimestamp();

        await logChannel.send({ ...toV2FromEmbedBuilder(embed) }).catch(err => {
            // Tratar erros de timeout e conexão como warnings, não erros críticos
            const isNetworkError = err.message?.includes('timeout') || 
                                 err.message?.includes('Timeout') || 
                                 err.message?.includes('ECONNRESET') ||
                                 err.message?.includes('ENOTFOUND') ||
                                 err.message?.includes('ETIMEDOUT') ||
                                 err.code === 'ECONNRESET' ||
                                 err.code === 'ETIMEDOUT';
            
            if (isNetworkError) {
                logger.warning('Erro de conexão ao enviar log de membro removido (timeout/rede)', {
                    error: err.message,
                    errorCode: err.code,
                    guildId: member.guild.id,
                    userId: member.user.id,
                    channelId: logChannel.id
                });
            } else {
                logger.error('Erro ao enviar log de membro removido', {
                    error: err.message,
                    errorCode: err.code,
                    guildId: member.guild.id,
                    userId: member.user.id,
                    channelId: logChannel.id
                });
            }
        });
        
        // Remover registros pendentes de whitelist e verificação quando o membro sai do servidor
        try {
            const whitelistRecord = db.getWhitelist(member.user.id);
            if (whitelistRecord && whitelistRecord.status === 'pending') {
                db.deleteWhitelist(member.user.id);
                logger.info('Registro pendente de whitelist removido após membro sair do servidor', {
                    guildId: member.guild.id,
                    userId: member.user.id,
                    minecraftUsername: whitelistRecord.minecraftUsername
                });
            }
            
            const verificationRecord = db.getVerification(member.user.id);
            if (verificationRecord && verificationRecord.status === 'pending') {
                db.deleteVerification(member.user.id);
                logger.info('Registro pendente de verificação removido após membro sair do servidor', {
                    guildId: member.guild.id,
                    userId: member.user.id
                });
            }
        } catch (dbError) {
            logger.warning('Erro ao remover registros pendentes após membro sair', {
                error: dbError.message,
                guildId: member.guild.id,
                userId: member.user.id
            });
        }
        
        logger.info('Log de membro removido enviado', {
            guildId: member.guild.id,
            userId: member.user.id,
            channelId: logChannel.id
        });
    } catch (error) {
        // Tratar erros de timeout e conexão como warnings, não erros críticos
        const isNetworkError = error.message?.includes('timeout') || 
                              error.message?.includes('Timeout') || 
                              error.message?.includes('ECONNRESET') ||
                              error.message?.includes('ENOTFOUND') ||
                              error.message?.includes('ETIMEDOUT') ||
                              error.code === 'ECONNRESET' ||
                              error.code === 'ETIMEDOUT';
        
        if (isNetworkError) {
            logger.warning('Erro de conexão ao processar membro removido (timeout/rede)', {
                error: error.message,
                errorCode: error.code,
                guildId: member.guild?.id,
                userId: member.user?.id
            });
        } else {
            logger.error('Erro ao enviar log de membro removido', {
                error: error.message,
                errorCode: error.code,
                guildId: member.guild?.id,
                userId: member.user?.id
            });
        }
    }
}

// Rate limit simples para logs de atualização de usuário (username/avatar)
const userUpdateRateLimit = new Map(); // userId -> timestamp
const USER_UPDATE_COOLDOWN_MS = 60 * 1000; // 60s por usuário

export async function handleUserUpdate(oldUser, newUser) {
    try {
        // Cooldown por usuário para evitar spam de logs
        const lastLog = userUpdateRateLimit.get(newUser.id) || 0;
        const now = Date.now();
        if (now - lastLog < USER_UPDATE_COOLDOWN_MS) {
            return;
        }

        // Verificar mudanças de username
        const usernameChanged = oldUser.username !== newUser.username;
        // Verificar mudanças de avatar
        const avatarChanged = oldUser.avatar !== newUser.avatar;
        
        // Se não houve mudanças relevantes, retornar
        if (!usernameChanged && !avatarChanged) {
            return;
        }
        
        // Buscar todos os servidores onde o usuário está presente
        // O evento userUpdate é global, então precisamos verificar em todos os servidores
        const guilds = oldUser.client.guilds.cache.filter(guild => guild.members.cache.has(oldUser.id));
        
        if (guilds.size === 0) {
            return;
        }
        
        // Atualizar cooldown (apenas se haverá log)
        userUpdateRateLimit.set(newUser.id, now);

        // Processar cada servidor onde o usuário está presente
        for (const guild of guilds.values()) {
            try {
                const member = guild.members.cache.get(oldUser.id);
                if (!member) continue;
                
                // Usar canal específico baseado no tipo de mudança
                let logChannel;
                if (usernameChanged && avatarChanged) {
                    // Se ambos mudaram, usar canal de username ou avatar (prioridade para username)
                    logChannel = getLogChannel(guild, 'logUsername') || getLogChannel(guild, 'logAvatar') || getLogChannel(guild, 'memberLogs') || getLogChannel(guild, 'log') || getLogChannel(guild, 'modLogs');
                } else if (usernameChanged) {
                    logChannel = getLogChannel(guild, 'logUsername') || getLogChannel(guild, 'memberLogs') || getLogChannel(guild, 'log') || getLogChannel(guild, 'modLogs');
                } else if (avatarChanged) {
                    logChannel = getLogChannel(guild, 'logAvatar') || getLogChannel(guild, 'memberLogs') || getLogChannel(guild, 'log') || getLogChannel(guild, 'modLogs');
                } else {
                    logChannel = getLogChannel(guild, 'memberLogs') || getLogChannel(guild, 'log') || getLogChannel(guild, 'modLogs');
                }
                if (!logChannel) {
                    continue;
                }
                
                // Verificar se o bot tem permissão para enviar mensagens
                if (!logChannel.permissionsFor(guild.members.me)?.has(['SendMessages', 'EmbedLinks', 'ViewChannel'])) {
                    continue;
                }
                
                // Criar embed base
                const embed = new EmbedBuilder()
                    .setAuthor({ 
                        name: 'Perfil do Usuário Atualizado', 
                        iconURL: guild.iconURL({ dynamic: true }) || undefined 
                    })
                    .setThumbnail(newUser.displayAvatarURL({ dynamic: true, size: 256 }))
                    .setFooter({ 
                        text: `ID: ${newUser.id}`, 
                        iconURL: newUser.displayAvatarURL({ dynamic: true }) 
                    })
                    .setTimestamp();
                
                // Adicionar informações sobre mudanças
                if (usernameChanged && avatarChanged) {
                    const newAvatarURL = newUser.displayAvatarURL({ dynamic: true, size: 512 });
                    
                    embed.setColor(0x3498db) // Azul para múltiplas mudanças
                        .setTitle('🔄 Perfil Atualizado')
                        .setDescription(`**${newUser}** alterou seu username e avatar`)
                        .setThumbnail(newAvatarURL)
                        .addFields(
                            {
                                name: '👤 Username',
                                value: `**Antes:** \`${oldUser.username}\`\n**Depois:** \`${newUser.username}\``,
                                inline: false
                            },
                            {
                                name: '🖼️ Avatar',
                                value: `**Novo Avatar:** [Ver avatar](${newAvatarURL})`,
                                inline: false
                            },
                            {
                                name: '👤 Usuário',
                                value: `**Tag:** ${newUser.tag}\n**ID:** \`${newUser.id}\``,
                                inline: true
                            },
                            {
                                name: '⏰ Quando',
                                value: `<t:${Math.floor(Date.now() / 1000)}:R>\n<t:${Math.floor(Date.now() / 1000)}:F>`,
                                inline: true
                            }
                        )
                        .setImage(newAvatarURL);
                } else if (usernameChanged) {
                    embed.setColor(0xf39c12) // Laranja para mudança de username
                        .setTitle(`📝 ${oldUser.username} alterou o username`)
                        .setDescription(`**${newUser}** alterou seu username`)
                        .addFields(
                            {
                                name: '👤 Username',
                                value: `**Antes:** \`${oldUser.username}\`\n**Depois:** \`${newUser.username}\``,
                                inline: false
                            },
                            {
                                name: '👤 Usuário',
                                value: `${newUser.tag}\n\`${newUser.id}\``,
                                inline: true
                            },
                            {
                                name: '⏰ Quando',
                                value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                                inline: true
                            }
                        );
                } else if (avatarChanged) {
                    const newAvatarURL = newUser.displayAvatarURL({ dynamic: true, size: 512 });
                    
                    // Detectar formato do avatar (se possível)
                    const getAvatarFormat = (url) => {
                        if (!url) return 'Desconhecido';
                        if (url.includes('.gif')) return 'GIF';
                        if (url.includes('.png')) return 'PNG';
                        if (url.includes('.jpg') || url.includes('.jpeg')) return 'JPEG';
                        if (url.includes('.webp')) return 'WebP';
                        return 'Desconhecido';
                    };
                    
                    const newFormat = getAvatarFormat(newAvatarURL);
                    
                    embed.setColor(0x9b59b6) // Roxo para mudança de avatar
                        .setTitle('🖼️ Avatar Atualizado')
                        .setDescription(`**${newUser}** alterou seu avatar de perfil`)
                        .setThumbnail(newAvatarURL)
                        .addFields(
                            {
                                name: '📸 Avatar',
                                value: `**Novo Avatar:** [Ver avatar](${newAvatarURL})`,
                                inline: false
                            },
                            {
                                name: '👤 Usuário',
                                value: `**Tag:** ${newUser.tag}\n**ID:** \`${newUser.id}\``,
                                inline: true
                            },
                            {
                                name: '📊 Formato',
                                value: `**Formato:** ${newFormat}`,
                                inline: true
                            },
                            {
                                name: '⏰ Quando',
                                value: `<t:${Math.floor(Date.now() / 1000)}:R>\n<t:${Math.floor(Date.now() / 1000)}:F>`,
                                inline: true
                            }
                        )
                        .setImage(newAvatarURL);
                }
                
                await logChannel.send({ ...toV2FromEmbedBuilder(embed) }).catch(err => {
                    // Tratar erros de timeout e conexão como warnings, não erros críticos
                    const isNetworkError = err.message?.includes('timeout') || 
                                         err.message?.includes('Timeout') || 
                                         err.message?.includes('ECONNRESET') ||
                                         err.message?.includes('ENOTFOUND') ||
                                         err.message?.includes('ETIMEDOUT') ||
                                         err.code === 'ECONNRESET' ||
                                         err.code === 'ETIMEDOUT';
                    
                    if (isNetworkError) {
                        logger.warning('Erro de conexão ao enviar log de atualização de usuário (timeout/rede)', {
                            error: err.message,
                            errorCode: err.code,
                            guildId: guild.id,
                            userId: newUser.id
                        });
                    } else {
                        logger.warning('Erro ao enviar log de atualização de usuário', {
                            error: err.message,
                            errorCode: err.code,
                            guildId: guild.id,
                            userId: newUser.id
                        });
                    }
                });
                
                logger.info('Log de atualização de usuário enviado', {
                    guildId: guild.id,
                    userId: newUser.id,
                    usernameChanged,
                    avatarChanged,
                    channelId: logChannel.id
                });
            } catch (guildError) {
                logger.warning('Erro ao processar log de atualização de usuário para servidor', {
                    error: guildError.message,
                    guildId: guild.id,
                    userId: newUser.id
                });
            }
        }
    } catch (error) {
        logger.error('Erro ao enviar log de atualização de usuário', {
            error: error.message,
            userId: newUser?.id
        });
    }
}
