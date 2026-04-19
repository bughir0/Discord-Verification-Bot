import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { logModerationAction } from '../../utils/moderationUtils.js';
import { mergeEmbedWithRows, toEmbedReply } from '../../utils/embedBuilderV2.js';
import { success, error, warning, info } from '../../utils/responseUtils.js';
import logger from '../../utils/logger.js';
import { updateWithAutoDelete, replyWithAutoDelete } from '../../utils/autoDeleteMessage.js';

export const data = new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulsa um membro do servidor')
    .addUserOption(option =>
        option.setName('usuário')
            .setDescription('O usuário a ser expulso')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('motivo')
            .setDescription('Motivo da expulsão')
            .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setDMPermission(false);

export async function handleKickCommand(interaction) {
    const targetUser = interaction.options.getUser('usuário');
    const reason = interaction.options.getString('motivo');
    const moderator = interaction.user;

    // Log inicial do comando
    logger.info('Comando /kick executado', {
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

    // Verificar se o usuário tem permissão para expulsar
    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        logger.warning('Tentativa de usar /kick sem permissão', {
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

    // Verificar se o bot tem permissão para expulsar
    if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
        logger.warning('Bot sem permissão para expulsar', {
            guildId: interaction.guild.id,
            moderatorId: moderator.id,
            moderatorTag: moderator.tag,
            targetId: targetUser.id
        });
        return await interaction.reply(error({
            title: 'Permissão Insuficiente',
            description: 'Eu não tenho permissão para expulsar membros.',
            ephemeral: true
        }));
    }

    // Verificar se o alvo é um bot
    if (targetUser.bot) {
        logger.warning('Tentativa de expulsar bot bloqueada', {
            guildId: interaction.guild.id,
            moderatorId: moderator.id,
            moderatorTag: moderator.tag,
            targetId: targetUser.id,
            targetTag: targetUser.tag
        });
        return interaction.reply(error({
            title: 'Erro',
            description: 'Não é possível expulsar outros bots!',
            ephemeral: true
        }));
    }

    // Verificar se o alvo é o dono do servidor
    if (interaction.guild.ownerId === targetUser.id) {
        logger.warning('Tentativa de expulsar dono do servidor bloqueada', {
            guildId: interaction.guild.id,
            moderatorId: moderator.id,
            moderatorTag: moderator.tag,
            targetId: targetUser.id
        });
        return interaction.reply(error({
            title: 'Erro',
            description: 'Você não pode expulsar o dono do servidor!',
            ephemeral: true
        }));
    }

    // Verificar se o alvo tem um cargo mais alto
    const targetMember = interaction.guild.members.cache.get(targetUser.id);
    if (targetMember && targetMember.roles.highest.position >= interaction.member.roles.highest.position) {
        logger.warning('Tentativa de expulsar usuário com cargo superior bloqueada', {
            guildId: interaction.guild.id,
            moderatorId: moderator.id,
            moderatorTag: moderator.tag,
            moderatorHighestRole: interaction.member.roles.highest.position,
            targetId: targetUser.id,
            targetHighestRole: targetMember.roles.highest.position
        });
        return interaction.reply(error({
            title: 'Erro',
            description: 'Você não pode expulsar alguém com um cargo igual ou superior ao seu!',
            ephemeral: true
        }));
    }

    // Criar embed de confirmação
    const confirmEmbed = warning({
        title: 'Confirmar Expulsão',
        description: `Você tem certeza que deseja expulsar **<@${targetUser.id}>**?`,
        fields: [
            { name: 'Motivo', value: reason || 'Nenhum motivo fornecido.' }
        ],
        ephemeral: true
    });

    // Botões de confirmação
    const confirmRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_kick')
                .setLabel('Confirmar')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('cancel_kick')
                .setLabel('Cancelar')
                .setStyle(ButtonStyle.Secondary)
        );

    // Enviar mensagem de confirmação
    await interaction.reply(mergeEmbedWithRows(confirmEmbed, [confirmRow]));

    // Buscar a mensagem de confirmação
    const confirmationMessage = await interaction.fetchReply();

    // Coletor de interações
    const filter = i => (i.customId === 'confirm_kick' || i.customId === 'cancel_kick') && i.user.id === interaction.user.id;
    
    try {
        const confirmation = await confirmationMessage.awaitMessageComponent({
            filter,
            time: 60000 // 1 minuto para responder
        });

        if (confirmation.customId === 'confirm_kick') {
            // Notificar o usuário antes de expulsar
            const dmEmbed = new EmbedBuilder()
                .setColor(0xf39c12) // Laranja
                .setTitle('⚠️ Você foi expulso')
                .setDescription(`Você foi expulso do servidor **${interaction.guild.name}**\n\n` +
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

            // Executar a expulsão
            await interaction.guild.members.kick(targetUser.id, `<@${moderator.id}>: ${reason}`);

            // Log de sucesso
            logger.info('Expulsão executada com sucesso', {
                guildId: interaction.guild.id,
                guildName: interaction.guild.name,
                moderatorId: moderator.id,
                moderatorTag: moderator.tag,
                targetId: targetUser.id,
                targetTag: targetUser.tag,
                reason: reason,
                dmSent: true // Assumindo que foi tentado enviar
            });

            // Atualizar mensagem de confirmação
            const successEmbed = success({
                    title: 'Expulsão Concluída',
                    description: `**<@${targetUser.id}>** foi expulso com sucesso.`,
                    fields: [
                        { name: 'Motivo', value: reason || 'Nenhum motivo fornecido.' }
                    ],
                    ephemeral: true
            });
            
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
                        const publicSuccessEmbed = success({
                            title: 'Expulsão Concluída',
                            description: `**<@${targetUser.id}>** foi expulso com sucesso.`,
                            fields: [
                                { name: 'Motivo', value: reason || 'Nenhum motivo fornecido.' }
                            ],
                            ephemeral: false
                        });
                        await sendAutoDeleteMessage(interaction.channel, {
                            ...publicSuccessEmbed
                        });
                    } catch (followUpError) {
                        console.error('Erro ao enviar follow-up:', followUpError);
                    }
                } else {
                    throw updateError;
                }
            }

            // Registrar a ação no canal de logs
            await logModerationAction(interaction.guild, {
                action: 'KICK',
                target: targetUser,
                moderator: moderator,
                reason: reason
            });

        } else {
            // Se o usuário cancelar
            logger.info('Expulsão cancelada pelo usuário', {
                guildId: interaction.guild.id,
                moderatorId: moderator.id,
                moderatorTag: moderator.tag,
                targetId: targetUser.id,
                targetTag: targetUser.tag
            });
            await updateWithAutoDelete(confirmation, {
                ...error({
                    title: 'Operação Cancelada',
                    description: 'A operação de expulsão foi cancelada pelo usuário.',
                    ephemeral: false
                }),
                components: []
            });
        }
    } catch (err) {
        // Se o tempo esgotar
        if (err.code === 'INTERACTION_COLLECTOR_ERROR') {
            logger.warning('Tempo esgotado no comando /kick', {
                guildId: interaction.guild.id,
                moderatorId: moderator.id,
                moderatorTag: moderator.tag,
                targetId: targetUser.id
            });
            await replyWithAutoDelete(interaction, {
                ...warning({
                    title: 'Tempo Esgotado',
                    description: 'Tempo esgotado. A expulsão não foi realizada.',
                    ephemeral: false
                }),
                components: []
            });
        } else {
            logger.error('Erro ao executar comando de expulsão', {
                guildId: interaction.guild.id,
                moderatorId: moderator.id,
                moderatorTag: moderator.tag,
                targetId: targetUser.id,
                error: err.message,
                stack: err.stack,
                code: err.code
            });
            await interaction.followUp({
                ...error({
                    title: 'Erro',
                    description: 'Ocorreu um erro ao executar este comando.',
                ephemeral: true
                })
            });
        }
    }
}
