import { EmbedBuilder } from 'discord.js';
import { toEmbedReply } from '../utils/embedBuilderV2.js';
import { getChannelId } from '../utils/configHelper.js';
import logger from '../utils/logger.js';

// Store active voice sessions
const voiceSessions = new Map();

/**
 * Inicializa as sessões de voz para todos os usuários que já estão em calls
 * Deve ser chamado quando o bot inicia (evento ready)
 */
export async function initializeVoiceSessions(client) {
    try {
        logger.info('Inicializando sessões de voz...');
        let totalSessions = 0;
        
        for (const guild of client.guilds.cache.values()) {
            try {
                // Buscar todos os canais de voz do servidor
                const voiceChannels = guild.channels.cache.filter(channel => 
                    channel.isVoiceBased() && channel.members.size > 0
                );
                
                for (const channel of voiceChannels.values()) {
                    for (const member of channel.members.values()) {
                        const session = {
                            userId: member.id,
                            username: member.user.tag,
                            channelId: channel.id,
                            channelName: channel.name,
                            joinTime: new Date(), // Usar hora atual como aproximação
                            membersInChannel: channel.members.map(m => ({
                                id: m.id,
                                tag: m.user.tag
                            }))
                        };
                        
                        voiceSessions.set(member.id, session);
                        totalSessions++;
                    }
                }
            } catch (guildError) {
                logger.warning('Erro ao inicializar sessões de voz para servidor', {
                    error: guildError.message,
                    guildId: guild.id
                });
            }
        }
        
        logger.info('Sessões de voz inicializadas', { totalSessions });
    } catch (error) {
        logger.error('Erro ao inicializar sessões de voz', {
            error: error.message,
            stack: error.stack
        });
    }
}

export async function handleVoiceStateUpdate(oldState, newState) {
    try {
        const guild = newState.guild || oldState.guild;
        if (!guild) return;
        
        // Tentar obter o membro do newState, se não existir, tentar do oldState
        let member = newState.member;
        if (!member && oldState.member) {
            member = oldState.member;
        }
        if (!member) return;
        
        // Usar canal específico de logs de call, com fallback para log geral
        const logChannelId = getChannelId(guild.id, 'logCall') || getChannelId(guild.id, 'log') || getChannelId(guild.id, 'modLogs');
        if (!logChannelId) {
            logger.debug('Canal de log de call não configurado', { guildId: guild.id });
            return; // Canal de log não configurado
        }
        
        const logChannel = guild.channels.cache.get(logChannelId);
        if (!logChannel) {
            logger.debug('Canal de log de call não encontrado', { guildId: guild.id, channelId: logChannelId });
            return; // Canal não encontrado
        }
        
        // Verificar permissões do bot
        const botMember = guild.members.me;
        if (!botMember) return;
        
        const permissions = logChannel.permissionsFor(botMember);
        if (!permissions?.has(['SendMessages', 'EmbedLinks', 'ViewChannel'])) {
            logger.warning('Bot não tem permissão para enviar logs de call', {
                guildId: guild.id,
                channelId: logChannel.id
            });
            return;
        }
        
        // User joined a voice channel
        // Se oldState não existe ou não tem channelId, significa que o usuário acabou de entrar
        if ((!oldState || !oldState.channelId) && newState.channelId) {
        // Filtrar para excluir a pessoa que acabou de entrar (mostrar apenas quem já estava lá)
        const membersAlreadyInChannel = newState.channel.members
            .filter(m => m.id !== member.id)
            .map(m => ({
                id: m.id,
                tag: m.user.tag
            }));
        
        const session = {
            userId: member.id,
            username: member.user.tag,
            channelId: newState.channelId,
            channelName: newState.channel.name,
            joinTime: new Date(),
            membersInChannel: newState.channel.members.map(m => ({
                id: m.id,
                tag: m.user.tag
            }))
        };
        
        voiceSessions.set(member.id, session);
        
        const membersCount = membersAlreadyInChannel.length;
        const membersList = membersCount > 0 
            ? membersAlreadyInChannel.map(m => `• <@${m.id}>`).join('\n')
            : 'Ninguém mais no canal';
        
        const embed = new EmbedBuilder()
            .setColor(0x2ecc71) // Verde suave
            .setAuthor({ 
                name: 'Entrada em Call', 
                iconURL: guild.iconURL({ dynamic: true }) || undefined 
            })
            .setTitle(`🔊 ${member.user.username} entrou na call`)
            .setDescription(`**${member.user}** conectou-se ao canal de voz`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { 
                    name: membersCount > 0 ? `👥 Pessoas que já estavam na Call (${membersCount})` : `👥 Pessoas na Call (1)`, 
                    value: membersList.length > 1024 ? membersList.slice(0, 1020) + '...' : membersList, 
                    inline: false 
                },
                { 
                    name: '📞 Canal', 
                    value: `<#${newState.channelId}>`, 
                    inline: true 
                },
                { 
                    name: '⏰ Horário', 
                    value: `<t:${Math.floor(session.joinTime.getTime() / 1000)}:R>`, 
                    inline: true 
                }
            )
            .setFooter({ 
                text: `ID: ${member.id}`, 
                iconURL: member.user.displayAvatarURL({ dynamic: true }) 
            })
            .setTimestamp();

            await logChannel.send({ ...toEmbedReply(embed) }).catch(err => {
                logger.error('Erro ao enviar log de entrada em call', {
                    error: err.message,
                    guildId: guild.id,
                    userId: member.id,
                    channelId: logChannel.id
                });
            });
            return;
        }
        
        // User left a voice channel
        if (oldState && oldState.channelId && !newState.channelId) {
        // Verificar se o membro ainda está no servidor
        // Se não estiver, significa que ele saiu do servidor enquanto estava em call
        const memberStillInGuild = guild.members.cache.has(member.id);
        
        const session = voiceSessions.get(member.id);
        // Se não tem sessão, criar uma temporária com informações do oldState
        if (!session) {
            logger.debug('Sessão não encontrada ao sair da call, criando sessão temporária', {
                userId: member.id,
                guildId: guild.id
            });
            // Criar sessão temporária para o log
            const tempSession = {
                userId: member.id,
                username: member.user.tag,
                channelId: oldState.channelId,
                channelName: oldState.channel?.name || 'Canal desconhecido',
                joinTime: new Date(Date.now() - 60000) // Aproximação: 1 minuto atrás
            };
            
            const duration = Math.floor((new Date() - tempSession.joinTime) / 1000);
            const days = Math.floor(duration / 86400);
            const hours = Math.floor((duration % 86400) / 3600);
            const minutes = Math.floor((duration % 3600) / 60);
            const seconds = duration % 60;
            
            const timeParts = [];
            if (days > 0) timeParts.push(`${days} dia${days !== 1 ? 's' : ''}`);
            if (hours > 0) timeParts.push(`${hours} hora${hours !== 1 ? 's' : ''}`);
            if (minutes > 0) timeParts.push(`${minutes} minuto${minutes !== 1 ? 's' : ''}`);
            if (seconds > 0 && days === 0 && hours === 0) timeParts.push(`${seconds} segundo${seconds !== 1 ? 's' : ''}`);
            const timeString = timeParts.length > 0 ? timeParts.join(', ') : 'Menos de 1 segundo';
            
            // Usar os membros que estavam no canal no momento da saída (não os que estavam quando entrou)
            // Filtrar para excluir a pessoa que está saindo
            const membersInChannelAtExit = oldState.channel?.members
                ? Array.from(oldState.channel.members.values())
                    .filter(m => m.id !== member.id)
                    .map(m => ({
                        id: m.id,
                        tag: m.user.tag
                    }))
                : [];
            
            const membersList = membersInChannelAtExit.length > 0 
                ? membersInChannelAtExit.map(m => `• <@${m.id}>`).join('\n')
                : 'Ninguém mais no canal';
            
            const embed = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setAuthor({ 
                    name: memberStillInGuild ? 'Saída de Call' : 'Saída de Call e Servidor', 
                    iconURL: guild.iconURL({ dynamic: true }) || undefined 
                })
                .setTitle(`🔇 ${member.user.username} saiu da call${memberStillInGuild ? '' : ' e do servidor'}`)
                .setDescription(memberStillInGuild 
                    ? `**${member.user}** desconectou-se do canal de voz`
                    : `**${member.user}** saiu do servidor enquanto estava em call`)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
                .addFields(
                    { 
                        name: '⏱️ Tempo na Call', 
                        value: `**${timeString}** (aproximado)`, 
                        inline: true 
                    },
                    { 
                        name: '📞 Canal', 
                        value: `<#${oldState.channelId}>`, 
                        inline: true 
                    },
                    { 
                        name: `👥 Pessoas que Estavam na Call (${membersInChannelAtExit.length})`, 
                        value: membersList.length > 1024 ? membersList.slice(0, 1020) + '...' : membersList, 
                        inline: false 
                    }
                )
                .setFooter({ 
                    text: `ID: ${member.id}`, 
                    iconURL: member.user.displayAvatarURL({ dynamic: true }) 
                })
                .setTimestamp();
            
            // Limpar sessão se o membro não estiver mais no servidor
            if (!memberStillInGuild) {
                voiceSessions.delete(member.id);
            }
            
            await logChannel.send({ ...toEmbedReply(embed) }).catch(err => {
                logger.error('Erro ao enviar log de saída de call', {
                    error: err.message,
                    guildId: guild.id,
                    userId: member.id
                });
            });
            return;
        }
        
        const duration = Math.floor((new Date() - session.joinTime) / 1000);
        const days = Math.floor(duration / 86400);
        const hours = Math.floor((duration % 86400) / 3600);
        const minutes = Math.floor((duration % 3600) / 60);
        const seconds = duration % 60;
        
        // Format time string de forma mais legível
        const timeParts = [];
        if (days > 0) timeParts.push(`${days} dia${days !== 1 ? 's' : ''}`);
        if (hours > 0) timeParts.push(`${hours} hora${hours !== 1 ? 's' : ''}`);
        if (minutes > 0) timeParts.push(`${minutes} minuto${minutes !== 1 ? 's' : ''}`);
        if (seconds > 0 && days === 0 && hours === 0) timeParts.push(`${seconds} segundo${seconds !== 1 ? 's' : ''}`);
        const timeString = timeParts.length > 0 ? timeParts.join(', ') : 'Menos de 1 segundo';

        // Usar os membros que estavam no canal no momento da saída (não os que estavam quando entrou)
        // Filtrar para excluir a pessoa que está saindo
        const membersInChannelAtExit = oldState.channel?.members
            ? Array.from(oldState.channel.members.values())
                .filter(m => m.id !== member.id)
                .map(m => ({
                    id: m.id,
                    tag: m.user.tag
                }))
            : [];

        const membersList = membersInChannelAtExit.length > 0 
            ? membersInChannelAtExit.map(m => `• <@${m.id}>`).join('\n')
            : 'Ninguém mais no canal';

        const embed = new EmbedBuilder()
            .setColor(0xe74c3c) // Vermelho suave
            .setAuthor({ 
                name: memberStillInGuild ? 'Saída de Call' : 'Saída de Call e Servidor', 
                iconURL: guild.iconURL({ dynamic: true }) || undefined 
            })
            .setTitle(`🔇 ${member.user.username} saiu da call${memberStillInGuild ? '' : ' e do servidor'}`)
            .setDescription(memberStillInGuild 
                ? `**${member.user}** desconectou-se do canal de voz`
                : `**${member.user}** saiu do servidor enquanto estava em call`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { 
                    name: '⏱️ Tempo na Call', 
                    value: `**${timeString}**`, 
                    inline: true 
                },
                { 
                    name: '📞 Canal', 
                    value: `<#${oldState.channelId}>`, 
                    inline: true 
                },
                { 
                    name: '📅 Período', 
                    value: `**Entrou:** <t:${Math.floor(session.joinTime.getTime() / 1000)}:R>\n**Saiu:** <t:${Math.floor(Date.now() / 1000)}:R>`, 
                    inline: false 
                },
                { 
                    name: `👥 Pessoas que Estavam na Call (${membersInChannelAtExit.length})`, 
                    value: membersList.length > 1024 ? membersList.slice(0, 1020) + '...' : membersList, 
                    inline: false 
                }
            )
            .setFooter({ 
                text: `ID: ${member.id}`, 
                iconURL: member.user.displayAvatarURL({ dynamic: true }) 
            })
            .setTimestamp();

            // Limpar sessão
            voiceSessions.delete(member.id);
            
            await logChannel.send({ ...toEmbedReply(embed) }).catch(err => {
                logger.error('Erro ao enviar log de saída de call', {
                    error: err.message,
                    guildId: guild.id,
                    userId: member.id,
                    channelId: logChannel.id
                });
            });
            return;
        }
        
        // User switched voice channels
        if (oldState && oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        let session = voiceSessions.get(member.id);
        // Se não tem sessão, criar uma nova
        if (!session) {
            logger.debug('Sessão não encontrada ao trocar de call, criando nova sessão', {
                userId: member.id,
                guildId: guild.id
            });
            session = {
                userId: member.id,
                username: member.user.tag,
                channelId: oldState.channelId,
                channelName: oldState.channel?.name || 'Canal desconhecido',
                joinTime: new Date(Date.now() - 60000), // Aproximação: 1 minuto atrás
                membersInChannel: oldState.channel?.members?.map(m => ({
                    id: m.id,
                    tag: m.user.tag
                })) || []
            };
        }
        
        const duration = Math.floor((new Date() - session.joinTime) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        const timeString = minutes > 0 ? `${minutes} minuto${minutes !== 1 ? 's' : ''} e ${seconds} segundo${seconds !== 1 ? 's' : ''}` : `${seconds} segundo${seconds !== 1 ? 's' : ''}`;
        
        // Update session for new channel
        session.channelId = newState.channelId;
        session.channelName = newState.channel.name;
        session.joinTime = new Date();
        session.membersInChannel = newState.channel.members.map(m => ({
            id: m.id,
            tag: m.user.tag
        }));
        
        // Filtrar para excluir a pessoa que trocou de call (mostrar apenas quem já estava lá)
        const membersAlreadyInChannel = newState.channel.members
            .filter(m => m.id !== member.id)
            .map(m => ({
                id: m.id,
                tag: m.user.tag
            }));
        
        const membersCount = membersAlreadyInChannel.length;
        const membersList = membersCount > 0 
            ? membersAlreadyInChannel.map(m => `• <@${m.id}>`).join('\n')
            : 'Ninguém mais no canal';
        
        const embed = new EmbedBuilder()
            .setColor(0xf39c12) // Laranja suave
            .setAuthor({ 
                name: 'Troca de Call', 
                iconURL: guild.iconURL({ dynamic: true }) || undefined 
            })
            .setTitle(`🔄 ${member.user.username} trocou de call`)
            .setDescription(`**${member.user}** mudou de canal de voz`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { 
                    name: '📞 Canais', 
                    value: `**De:** <#${oldState.channelId}>\n**Para:** <#${newState.channelId}>`, 
                    inline: false 
                },
                { 
                    name: '⏱️ Tempo no Canal Anterior', 
                    value: `**${timeString}**`, 
                    inline: true 
                },
                { 
                    name: membersCount > 0 ? `👥 Pessoas que já estavam no Novo Canal (${membersCount})` : `👥 Pessoas no Novo Canal (1)`, 
                    value: membersList.length > 1024 ? membersList.slice(0, 1020) + '...' : membersList, 
                    inline: false 
                }
            )
            .setFooter({ 
                text: `ID: ${member.id}`, 
                iconURL: member.user.displayAvatarURL({ dynamic: true }) 
            })
            .setTimestamp();

            await logChannel.send({ ...toEmbedReply(embed) }).catch(err => {
                logger.error('Erro ao enviar log de troca de call', {
                    error: err.message,
                    guildId: guild.id,
                    userId: member.id,
                    channelId: logChannel.id
                });
            });
            return;
        }
    } catch (err) {
        logger.error('Erro em voiceStateUpdate', {
            error: err.message,
            stack: err.stack,
            guildId: newState?.guild?.id
        });
    }
}