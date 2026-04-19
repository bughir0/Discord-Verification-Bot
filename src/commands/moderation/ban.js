import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { createModerationEmbed, logModerationAction } from '../../utils/moderationUtils.js';
import { mergeEmbedWithRows, toEmbedReply } from '../../utils/embedBuilderV2.js';
import { success, error, warning } from '../../utils/responseUtils.js';
import logger from '../../utils/logger.js';
import { updateWithAutoDelete, replyWithAutoDelete } from '../../utils/autoDeleteMessage.js';

export const data = new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bane um membro do servidor')
    .addUserOption(option =>
        option.setName('usuário')
            .setDescription('O usuário a ser banido')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('motivo')
            .setDescription('Motivo do banimento')
            .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false);

export async function handleBanCommand(interaction) {
    const targetUser = interaction.options.getUser('usuário');
    const reason = interaction.options.getString('motivo');
    const moderator = interaction.user;

    // Log inicial do comando
    logger.info('Comando /ban executado', {
        guildId: interaction.guild.id,
        guildName: interaction.guild.name,
        moderatorId: moderator.id,
        moderatorTag: moderator.tag,
        targetId: targetUser.id,
        targetTag: targetUser.tag,
        reason: reason,
        channelId: interaction.channel?.id,
        channelName: interaction.channel?.name
    });

    // Verificar se o alvo é um bot
    if (targetUser.bot) {
        logger.warning('Tentativa de banir bot bloqueada', {
            guildId: interaction.guild.id,
            moderatorId: moderator.id,
            moderatorTag: moderator.tag,
            targetId: targetUser.id,
            targetTag: targetUser.tag
        });
        return await replyWithAutoDelete(interaction, {
            ...error({
                title: 'Erro',
                description: 'Não é possível banir outros bots!',
                ephemeral: true
            })
        });
    }

    // Verificar se o bot tem permissão para banir
    if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
        logger.warning('Bot sem permissão para banir', {
            guildId: interaction.guild.id,
            moderatorId: moderator.id,
            moderatorTag: moderator.tag,
            targetId: targetUser.id
        });
        return await interaction.reply(error({
            title: 'Permissão Insuficiente',
            description: 'Eu não tenho permissão para banir membros.',
            ephemeral: true
        }));
    }

    // Verificar se o alvo é o dono do servidor
    if (interaction.guild.ownerId === targetUser.id) {
        logger.warning('Tentativa de banir dono do servidor bloqueada', {
            guildId: interaction.guild.id,
            moderatorId: moderator.id,
            moderatorTag: moderator.tag,
            targetId: targetUser.id
        });
        return await replyWithAutoDelete(interaction, {
            ...error({
                title: 'Erro',
                description: 'Você não pode banir o dono do servidor!',
                ephemeral: true
            })
        });
    }

    // Verificar se o alvo tem um cargo mais alto
    const targetMember = interaction.guild.members.cache.get(targetUser.id);
    if (targetMember && targetMember.roles.highest.position >= interaction.member.roles.highest.position) {
        logger.warning('Tentativa de banir usuário com cargo superior bloqueada', {
            guildId: interaction.guild.id,
            moderatorId: moderator.id,
            moderatorTag: moderator.tag,
            moderatorHighestRole: interaction.member.roles.highest.position,
            targetId: targetUser.id,
            targetHighestRole: targetMember.roles.highest.position
        });
        return await replyWithAutoDelete(interaction, {
            ...error({
                title: 'Erro',
                description: 'Você não pode banir alguém com um cargo igual ou superior ao seu!',
                ephemeral: true
            })
        });
    }

    // Verificar permissões
    if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        logger.warning('Tentativa de usar /ban sem permissão', {
            guildId: interaction.guild.id,
            userId: moderator.id,
            userTag: moderator.tag
        });
        return await interaction.reply(error({
            title: 'Permissão Negada',
            description: 'Você não tem permissão para usar este comando.',
            ephemeral: true
        }));
    }

    // Criar embed de confirmação
    const confirmEmbed = warning({
        title: 'Confirmar Banimento',
        description: `Você tem certeza que deseja banir **<@${targetUser.id}>**?`,
        fields: [
            { name: 'Motivo', value: reason || 'Nenhum motivo fornecido.' }
        ],
        ephemeral: true
    });

    // Botões de confirmação
    const confirmRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_ban')
                .setLabel('Confirmar')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('cancel_ban')
                .setLabel('Cancelar')
                .setStyle(ButtonStyle.Secondary)
        );

    // Enviar mensagem de confirmação
    await interaction.reply(mergeEmbedWithRows(confirmEmbed, [confirmRow]));

    // Buscar a mensagem de confirmação
    const confirmationMessage = await interaction.fetchReply();

    // Coletor de interações
    const filter = i => (i.customId === 'confirm_ban' || i.customId === 'cancel_ban') && i.user.id === interaction.user.id;
    
    try {
        const confirmation = await confirmationMessage.awaitMessageComponent({
            filter,
            time: 60000 // 1 minuto para responder
        });

        if (confirmation.customId === 'confirm_ban') {
            // Notificar o usuário antes de banir
            const dmEmbed = new EmbedBuilder()
                .setColor(0xe74c3c) // Vermelho
                .setTitle('🚫 Você foi banido')
                .setDescription(`Você foi banido do servidor **${interaction.guild.name}**\n\n` +
                             `**Motivo:** ${reason || 'Nenhum motivo fornecido.'}\n` +
                             `**Moderador:** <@${moderator.id}>`)
                .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
                .setTimestamp();

            // Tentar enviar DM, mas não bloquear se falhar
            await targetUser.send({ ...toEmbedReply(dmEmbed) })
                .catch(error => {
                    if (error.code === 50007) {
                        // Usuário tem DMs desativadas ou bloqueou o bot
                        logger.warning('Não foi possível enviar mensagem direta para o usuário', {
                            userId: targetUser.id,
                            error: error.message
                        });
                    } else {
                        logger.error('Erro ao enviar mensagem direta', {
                            userId: targetUser.id,
                            error: error.message,
                            stack: error.stack
                        });
                    }
                });

            // Executar o banimento
            await interaction.guild.members.ban(targetUser.id, { 
                reason: `<@${moderator.id}>: ${reason}`
            });

            // Criar embed de sucesso
            const successEmbed = success({
                title: 'Banimento Concluído',
                description: `**<@${targetUser.id}>** foi banido com sucesso.`,
                fields: [
                    { name: 'Motivo', value: reason || 'Nenhum motivo fornecido.' }
                ],
                ephemeral: true
            });

            // Atualizar mensagem de confirmação
            try {
                await updateWithAutoDelete(confirmation, {
                    ...successEmbed,
                    components: []
                });
            } catch (updateError) {
                // Se a interação expirou, tentar enviar uma nova mensagem
                if (updateError.code === 10062 || updateError.message?.includes('Unknown interaction')) {
                    console.warn('Interação de confirmação expirada, enviando nova mensagem:', {
                        interactionId: confirmation.id,
                        userId: interaction.user.id
                    });
                    
                    try {
                        const { sendAutoDeleteMessage } = await import('../../utils/autoDeleteMessage.js');
                        await sendAutoDeleteMessage(interaction.channel, {
                            ...successEmbed
                        });
                    } catch (followUpError) {
                        console.error('Erro ao enviar follow-up:', followUpError);
                    }
                } else {
                    throw updateError;
                }
            }

            // Log de sucesso
            logger.info('Banimento executado com sucesso', {
                guildId: interaction.guild.id,
                guildName: interaction.guild.name,
                moderatorId: moderator.id,
                moderatorTag: moderator.tag,
                targetId: targetUser.id,
                targetTag: targetUser.tag,
                reason: reason,
                dmSent: true // Assumindo que foi tentado enviar
            });

            // Registrar a ação no canal de logs
            await logModerationAction(interaction.guild, {
                action: 'BAN',
                target: targetUser,
                moderator: moderator,
                reason: reason
            });

        } else {
            // Se o usuário cancelar
            logger.info('Banimento cancelado pelo usuário', {
                guildId: interaction.guild.id,
                moderatorId: moderator.id,
                moderatorTag: moderator.tag,
                targetId: targetUser.id,
                targetTag: targetUser.tag
            });
            try {
                await updateWithAutoDelete(confirmation, {
                    ...error({
                        title: 'Operação Cancelada',
                        description: 'A operação de banimento foi cancelada pelo usuário.',
                        ephemeral: false
                    }),
                    components: []
                });
            } catch (updateError) {
                // Se a interação expirou, tentar enviar uma nova mensagem
                if (updateError.code === 10062 || updateError.message?.includes('Unknown interaction')) {
                    console.warn('Interação de cancelamento expirada, enviando nova mensagem:', {
                        interactionId: confirmation.id,
                        userId: interaction.user.id
                    });
                    
                    try {
                        const { sendAutoDeleteMessage } = await import('../../utils/autoDeleteMessage.js');
                        const cancelResponse = error({
                            title: 'Operação Cancelada',
                            description: 'A operação de banimento foi cancelada pelo usuário.',
                            ephemeral: false
                        });
                        await sendAutoDeleteMessage(interaction.channel, {
                            ...cancelResponse
                        });
                    } catch (followUpError) {
                        console.error('Erro ao enviar follow-up de cancelamento:', followUpError);
                    }
                } else {
                    throw updateError;
                }
            }
        }
    } catch (err) {
        // Se o tempo esgotar
        if (err.code === 'INTERACTION_COLLECTOR_ERROR') {
            logger.warning('Tempo esgotado no comando /ban', {
                guildId: interaction.guild.id,
                moderatorId: moderator.id,
                moderatorTag: moderator.tag,
                targetId: targetUser.id
            });
            try {
                await replyWithAutoDelete(interaction, {
                    ...warning({
                        title: 'Tempo Esgotado',
                        description: 'Tempo esgotado. O banimento não foi realizado.',
                        ephemeral: false
                    }),
                    components: []
                });
            } catch (editError) {
                // Se não conseguir editar, tentar follow-up
                if (editError.code === 10062 || editError.message?.includes('Unknown interaction')) {
                    try {
                        const { sendAutoDeleteMessage } = await import('../../utils/autoDeleteMessage.js');
                        const timeoutResponse = warning({
                            title: 'Tempo Esgotado',
                            description: 'Tempo esgotado. O banimento não foi realizado.',
                            ephemeral: false
                        });
                        await sendAutoDeleteMessage(interaction.channel, {
                            ...timeoutResponse
                        });
                    } catch (followUpError) {
                        console.error('Erro ao enviar follow-up de timeout:', followUpError);
                    }
                } else {
                    console.error('Erro ao editar mensagem de timeout:', editError);
                }
            }
        } else {
            logger.error('Erro ao executar comando de banimento', {
                guildId: interaction.guild.id,
                moderatorId: moderator.id,
                moderatorTag: moderator.tag,
                targetId: targetUser.id,
                error: err.message,
                stack: err.stack,
                code: err.code
            });
            try {
                await interaction.followUp({
                    ...error({
                        title: 'Erro',
                        description: 'Ocorreu um erro ao executar este comando.',
                        ephemeral: true
                    })
                });
            } catch (followUpError) {
                logger.error('Erro ao enviar follow-up de erro', {
                    error: followUpError.message,
                    stack: followUpError.stack
                });
            }
        }
    }
}
