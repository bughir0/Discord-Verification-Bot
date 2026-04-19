import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logModerationAction } from '../../utils/moderationUtils.js';
import { mergeEmbedWithRows } from '../../utils/embedBuilderV2.js';
import { success, error, warning, info } from '../../utils/responseUtils.js';
import logger from '../../utils/logger.js';
import { updateWithAutoDelete, replyWithAutoDelete } from '../../utils/autoDeleteMessage.js';

export const data = new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Remove o banimento de um usuário')
    .addStringOption(option =>
        option.setName('usuário')
            .setDescription('ID ou Tag do usuário a ser desbanido')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('motivo')
            .setDescription('Motivo do desbanimento')
            .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false);

export async function handleUnbanCommand(interaction) {
    const userInput = interaction.options.getString('usuário');
    const reason = interaction.options.getString('motivo');
    const moderator = interaction.user;

    // Log inicial do comando
    logger.info('Comando /unban executado', {
        guildId: interaction.guild.id,
        guildName: interaction.guild.name,
        moderatorId: moderator.id,
        moderatorTag: moderator.tag,
        userInput: userInput,
        reason: reason,
        channelId: interaction.channel?.id,
        channelName: interaction.channel?.name
    });

    // Tentar encontrar o usuário banido
    let targetUser;
    try {
        // Verificar se é um ID
        if (/^\d+$/.test(userInput)) {
            targetUser = await interaction.client.users.fetch(userInput);
        } else {
            // Se for uma tag, extrair o ID
            const match = userInput.match(/^<@!?(\d+)>$/);
            if (match) {
                targetUser = await interaction.client.users.fetch(match[1]);
            } else {
                // Tentar encontrar por nome#discriminator
                const bans = await interaction.guild.bans.fetch();
                const bannedUser = bans.find(ban => 
                    ban.user.tag.toLowerCase() === userInput.toLowerCase() ||
                    ban.user.id === userInput
                );
                if (bannedUser) {
                    targetUser = bannedUser.user;
                }
            }
        }

        if (!targetUser) {
            logger.warning('Usuário não encontrado no comando /unban', {
                guildId: interaction.guild.id,
                moderatorId: moderator.id,
                moderatorTag: moderator.tag,
                userInput: userInput
            });
            return await replyWithAutoDelete(interaction, {
                ...error({
                    title: 'Usuário Não Encontrado',
                    description: 'Não foi possível encontrar o usuário banido. Verifique o ID ou a tag fornecida.',
                ephemeral: true
                })
            });
        }
    } catch (error) {
        logger.error('Erro ao buscar usuário banido', {
            guildId: interaction.guild.id,
            moderatorId: moderator.id,
            moderatorTag: moderator.tag,
            userInput: userInput,
            error: error.message,
            stack: error.stack
        });
        return await replyWithAutoDelete(interaction, {
            ...error({
                title: 'Erro ao Buscar Usuário',
                description: 'Ocorreu um erro ao buscar o usuário banido. Verifique o ID ou a tag fornecida.',
            ephemeral: true
            })
        });
    }

    // Verificar se o usuário está realmente banido
    try {
        const banInfo = await interaction.guild.bans.fetch(targetUser.id);
        if (!banInfo) {
            logger.warning('Tentativa de desbanir usuário não banido', {
                guildId: interaction.guild.id,
                moderatorId: moderator.id,
                moderatorTag: moderator.tag,
                targetId: targetUser.id,
                targetTag: targetUser.tag
            });
            return interaction.reply(warning({
                title: 'Usuário não banido',
                description: 'Este usuário não está banido.',
                ephemeral: true
            }));
        }
    } catch (error) {
        if (error.code === 10026) { // Unknown Ban
            logger.warning('Tentativa de desbanir usuário não banido (Unknown Ban)', {
                guildId: interaction.guild.id,
                moderatorId: moderator.id,
                moderatorTag: moderator.tag,
                targetId: targetUser.id,
                targetTag: targetUser.tag
            });
            return interaction.reply(warning({
                title: 'Usuário não banido',
                description: 'Este usuário não está banido.',
                ephemeral: true
            }));
        }
        throw error;
    }

    // Verificar permissões
    if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        logger.warning('Tentativa de usar /unban sem permissão', {
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
        title: 'Confirmar Desbanimento',
        description: `Você tem certeza que deseja desbanir **<@${targetUser.id}>** (${targetUser.id})?`,
        fields: [
            { name: 'Motivo', value: reason || 'Nenhum motivo fornecido.' }
        ],
        ephemeral: true
    });

    // Botões de confirmação
    const confirmRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_unban')
                .setLabel('Confirmar')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('cancel_unban')
                .setLabel('Cancelar')
                .setStyle(ButtonStyle.Secondary)
        );

    // Enviar mensagem de confirmação
    await interaction.reply(mergeEmbedWithRows(confirmEmbed, [confirmRow]));

    // Buscar a mensagem de confirmação
    const confirmationMessage = await interaction.fetchReply();

    // Coletor de interações
    const filter = i => (i.customId === 'confirm_unban' || i.customId === 'cancel_unban') && i.user.id === interaction.user.id;
    
    try {
        const confirmation = await confirmationMessage.awaitMessageComponent({
            filter,
            time: 60000 // 1 minuto para responder
        });

        if (confirmation.customId === 'confirm_unban') {
            // Executar o desbanimento
            await interaction.guild.members.unban(targetUser.id, `<@${moderator.id}>: ${reason}`);

            // Log de sucesso
            logger.info('Desbanimento executado com sucesso', {
                guildId: interaction.guild.id,
                guildName: interaction.guild.name,
                moderatorId: moderator.id,
                moderatorTag: moderator.tag,
                targetId: targetUser.id,
                targetTag: targetUser.tag,
                reason: reason
            });

            // Criar embed de sucesso
            const successEmbed = success({
                title: 'Desbanimento Concluído',
                description: `**<@${targetUser.id}>** foi desbanido com sucesso.`,
                fields: [
                    { name: 'Motivo', value: reason || 'Nenhum motivo fornecido.' }
                ],
                ephemeral: true
            });

            // Atualizar mensagem de confirmação
            await updateWithAutoDelete(confirmation, {
                ...successEmbed,
                components: []
            });

            // Registrar a ação no canal de logs
            await logModerationAction(interaction.guild, {
                action: 'UNBAN',
                target: targetUser,
                moderator: moderator,
                reason: reason
            });

        } else {
            // Se o usuário cancelar
            logger.info('Desbanimento cancelado pelo usuário', {
                guildId: interaction.guild.id,
                moderatorId: moderator.id,
                moderatorTag: moderator.tag,
                targetId: targetUser.id,
                targetTag: targetUser.tag
            });
            // Atualizar mensagem de confirmação
            await confirmation.update({
                ...error({
                    title: 'Operação Cancelada',
                    description: 'O desbanimento foi cancelado.',
                    ephemeral: true
                }),
                components: []
            });
        }
    } catch (error) {
        // Se o tempo esgotar
        if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
            logger.warning('Tempo esgotado no comando /unban', {
                guildId: interaction.guild.id,
                moderatorId: moderator.id,
                moderatorTag: moderator.tag,
                targetId: targetUser?.id
            });
            await interaction.editReply({
                ...error({
                    title: 'Tempo Esgotado',
                    description: 'O tempo para responder expirou.',
                    ephemeral: true
                }),
                components: []
            });
        } else {
            logger.error('Erro ao executar comando de desbanimento', {
                guildId: interaction.guild.id,
                moderatorId: moderator.id,
                moderatorTag: moderator.tag,
                targetId: targetUser?.id,
                error: error.message,
                stack: error.stack,
                code: error.code
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
