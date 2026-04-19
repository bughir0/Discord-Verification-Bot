import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from 'discord.js';
import { toEmbedReply } from '../../utils/embedBuilderV2.js';
import { success, error } from '../../utils/responseUtils.js';
import logger from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
    .setName('nuke')
    .setDescription('💣 Reseta o canal atual (deleta e recria com as mesmas configurações)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false);

export async function handleNukeCommand(interaction) {
    try {
        // Verificar se o comando foi usado em um canal
        if (!interaction.channel) {
            return await interaction.reply(error({
                title: 'Erro',
                description: 'Este comando deve ser usado em um canal.',
                ephemeral: true
            }));
        }

        // Verificar se o usuário tem permissão de administrador
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await interaction.reply(error({
                title: 'Sem Permissão',
                description: 'Apenas administradores podem usar este comando.',
                ephemeral: true
            }));
        }

        // Verificar se o bot tem permissões necessárias
        const botMember = interaction.guild.members.me;
        if (!botMember.permissionsIn(interaction.channel).has([
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages
        ])) {
            return await interaction.reply(error({
                title: 'Sem Permissão',
                description: 'O bot precisa das permissões: Gerenciar Canais, Ver Canal e Enviar Mensagens.',
                ephemeral: true
            }));
        }

        // Salvar informações do canal atual
        const channel = interaction.channel;
        const channelName = channel.name;
        const channelType = channel.type;
        const channelParent = channel.parent;
        const channelPosition = channel.position;
        const channelTopic = channel.topic;
        const channelNSFW = channel.nsfw;
        const channelRateLimitPerUser = channel.rateLimitPerUser;
        const channelPermissions = channel.permissionOverwrites.cache.map(overwrite => ({
            id: overwrite.id,
            allow: overwrite.allow,
            deny: overwrite.deny,
            type: overwrite.type
        }));

        // Verificar se é um canal de texto ou voz
        if (channelType !== ChannelType.GuildText && channelType !== ChannelType.GuildVoice) {
            return await interaction.reply(error({
                title: 'Tipo de Canal Inválido',
                description: 'Este comando só funciona em canais de texto ou voz.',
                ephemeral: true
            }));
        }

        // Responder ao usuário antes de deletar o canal
        await interaction.reply(success({
            title: '💣 Nuke Iniciado',
            description: `O canal **${channelName}** será resetado em instantes...`,
            ephemeral: true
        }));

        logger.info('💣 Comando /nuke executado', {
            channelId: channel.id,
            channelName: channelName,
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            guildId: interaction.guild.id
        });

        // Deletar o canal
        await channel.delete(`Nuke executado por ${interaction.user.tag} (${interaction.user.id})`);

        // Criar novo canal com as mesmas configurações + mesmas permissões de cargo/usuário
        const newChannel = await interaction.guild.channels.create({
            name: channelName,
            type: channelType,
            parent: channelParent,
            topic: channelTopic,
            nsfw: channelNSFW,
            rateLimitPerUser: channelRateLimitPerUser,
            permissionOverwrites: channelPermissions,
            reason: `Canal resetado por ${interaction.user.tag} via /nuke`
        });

        // Definir a posição do canal para manter na mesma posição que estava antes
        try {
            await newChannel.setPosition(channelPosition, {
                reason: `Restaurando posição após nuke por ${interaction.user.tag}`
            });
        } catch (positionError) {
            logger.warning('Erro ao definir posição do canal após nuke', {
                channelId: newChannel.id,
                position: channelPosition,
                error: positionError.message
            });
        }

        // Montar resumo das permissões mantidas (todas as permissões do overwrite)
        const permsLines = [];
        const maxOverwritesToShow = 10;

        for (const overwrite of channelPermissions.slice(0, maxOverwritesToShow)) {
            const role = interaction.guild.roles.cache.get(overwrite.id);
            const member = role ? null : interaction.guild.members.cache.get(overwrite.id);

            const targetName = role
                ? `Cargo: <@&${role.id}>`
                : member
                    ? `Membro: <@${member.id}>`
                    : `ID: ${overwrite.id}`;

            const allowed = typeof overwrite.allow?.toArray === 'function' ? overwrite.allow.toArray() : [];
            const denied = typeof overwrite.deny?.toArray === 'function' ? overwrite.deny.toArray() : [];

            const allowedText = allowed.length ? `✅ Allow: ${allowed.join(', ')}` : '✅ Allow: nenhuma';
            const deniedText = denied.length ? `❌ Deny: ${denied.join(', ')}` : '❌ Deny: nenhuma';

            permsLines.push(`• ${targetName} → ${allowedText} | ${deniedText}`);
        }

        if (!permsLines.length) {
            permsLines.push('Nenhuma permissão de canal específica foi configurada. O canal usa apenas as permissões padrão da categoria.');
        } else if (channelPermissions.length > maxOverwritesToShow) {
            permsLines.push(`… e mais ${channelPermissions.length - maxOverwritesToShow} cargos/usuários com permissões específicas.`);
        }

        const permsSummary = permsLines.join('\n').slice(0, 1024);

        // Enviar mensagem de aviso no novo canal com resumo das permissões
        const adminEmbed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('💣 Canal Resetado')
            .setDescription(`**Canal resetado por:** <@${interaction.user.id}> (\`${interaction.user.tag}\`)`)
            .addFields(
                {
                    name: '🕐 Data/Hora',
                    value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                    inline: false
                },
                {
                    name: '🔐 Permissões de canal mantidas',
                    value: permsSummary,
                    inline: false
                }
            )
            .setFooter({ text: 'Informação para administradores • Esta mensagem será deletada em 1 minuto' })
            .setTimestamp();

        // Enviar mensagem no novo canal
        const nukeMessage = await newChannel.send({
            ...toEmbedReply(adminEmbed)
        });

        // Deletar a mensagem após 1 minuto (60000ms)
        setTimeout(async () => {
            try {
                await nukeMessage.delete();
            } catch (deleteError) {
                // Ignorar erros se a mensagem já foi deletada ou não existe mais
                if (deleteError.code !== 10008) { // Unknown Message
                    logger.warning('Erro ao deletar mensagem de nuke após timeout', {
                        messageId: nukeMessage.id,
                        channelId: newChannel.id,
                        error: deleteError.message
                    });
                }
            }
        }, 60000); // 60 segundos = 1 minuto

        logger.info('✅ Canal resetado com sucesso', {
            oldChannelId: channel.id,
            newChannelId: newChannel.id,
            channelName: channelName,
            userId: interaction.user.id,
            userTag: interaction.user.tag
        });

    } catch (err) {
        logger.error('❌ Erro ao executar comando /nuke', {
            error: err.message,
            stack: err.stack,
            userId: interaction.user?.id,
            channelId: interaction.channel?.id
        });

        // Tentar responder se ainda não foi respondido
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply(error({
                    title: 'Erro',
                    description: `Ocorreu um erro ao resetar o canal: ${err.message}`,
                    ephemeral: true
                }));
            } catch (replyError) {
                logger.error('Erro ao enviar mensagem de erro', {
                    error: replyError.message
                });
            }
        }
    }
}

