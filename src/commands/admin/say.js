import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { success, error } from '../../utils/responseUtils.js';
import logger from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
    .setName('say')
    .setDescription('Faz o bot enviar uma mensagem personalizada em um canal')
    .addStringOption(option =>
        option.setName('mensagem')
            .setDescription('Conteúdo que o bot irá enviar')
            .setRequired(true)
            .setMaxLength(1900))
    .addChannelOption(option =>
        option.setName('canal')
            .setDescription('Canal onde a mensagem será enviada (padrão: atual)')
            .addChannelTypes(
                ChannelType.GuildText,
                ChannelType.GuildAnnouncement,
                ChannelType.PublicThread,
                ChannelType.PrivateThread
            )
            .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false);

export async function handleSayCommand(interaction) {
    const rawMessage = interaction.options.getString('mensagem');
    const targetChannel = interaction.options.getChannel('canal') || interaction.channel;
    const content = rawMessage?.trim();

    if (!content) {
        return await interaction.reply(error({
            title: 'Mensagem inválida',
            description: 'Digite algum conteúdo para que eu possa enviar.',
            ephemeral: true
        }));
    }

    if (!targetChannel || !targetChannel.isTextBased()) {
        return await interaction.reply(error({
            title: 'Canal inválido',
            description: 'Selecione um canal de texto ou utilize o comando diretamente no canal desejado.',
            ephemeral: true
        }));
    }

    const botMember = interaction.guild.members.me;
    const permissions = botMember?.permissionsIn(targetChannel);
    if (!permissions?.has(['ViewChannel', 'SendMessages'])) {
        return await interaction.reply(error({
            title: 'Sem permissão',
            description: `Não consigo enviar mensagens em ${targetChannel}. Ajuste as permissões e tente novamente.`,
            ephemeral: true
        }));
    }

    try {
        const sentMessage = await targetChannel.send({ content });

        logger.info('Mensagem enviada via /say', {
            guildId: interaction.guild.id,
            guildName: interaction.guild.name,
            moderatorId: interaction.user.id,
            moderatorTag: interaction.user.tag,
            channelId: targetChannel.id,
            channelName: targetChannel.name
        });

        const response = success({
            title: 'Mensagem enviada!',
            description: targetChannel.id === interaction.channelId
                ? `[Ver mensagem](${sentMessage.url})`
                : `Mensagem enviada em ${targetChannel} • [Ver mensagem](${sentMessage.url})`,
            ephemeral: true
        });

        return await interaction.reply(response);
    } catch (err) {
        logger.error('Erro ao executar /say', {
            error: err.message,
            stack: err.stack,
            guildId: interaction.guild.id,
            channelId: targetChannel.id,
            moderatorId: interaction.user.id
        });

        return await interaction.reply(error({
            title: 'Erro ao enviar',
            description: 'Não consegui enviar a mensagem. Tente novamente ou confira minha permissão no canal escolhido.',
            ephemeral: true
        }));
    }
}


