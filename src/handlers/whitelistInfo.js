import { EmbedBuilder } from 'discord.js';
import { database as db } from '../database/database.js';
import { toEmbedReply } from '../utils/embedBuilderV2.js';
import { getColors } from '../utils/configHelper.js';
import logger from '../utils/logger.js';

export async function handleWhitelistInfo(interaction) {
    try {
        const targetUser = interaction.options.getUser('usuário') || interaction.user;
        const guild = interaction.guild;
        const colors = getColors();

        await interaction.deferReply({ ephemeral: true });

        const whitelist = db.getWhitelist(targetUser.id);

        if (!whitelist) {
            const embed = new EmbedBuilder()
                .setColor(colors.warning || 0xf39c12)
                .setTitle('📋 Informações de Whitelist')
                .setDescription(`${targetUser} não possui uma whitelist registrada neste servidor.`)
                .setFooter({
                    text: `Solicitado por ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL({ dynamic: true })
                })
                .setTimestamp();

            return await interaction.editReply(toEmbedReply(embed, true));
        }

        const platformIcon = whitelist.platform === 'bedrock' ? '🔷' : '☕';
        const platformName = whitelist.platform === 'bedrock' ? 'Bedrock' : 'Java';
        const submittedAt = whitelist.submittedAt
            ? `<t:${Math.floor(new Date(whitelist.submittedAt).getTime() / 1000)}:F>`
            : 'Desconhecido';
        const updatedAt = whitelist.updatedAt
            ? `<t:${Math.floor(new Date(whitelist.updatedAt).getTime() / 1000)}:F>`
            : 'Desconhecido';

        const serverMode = db.getWhitelistMode(guild.id) || 'offline';
        const isOfflineMode = serverMode === 'offline';

        const embed = new EmbedBuilder()
            .setColor(whitelist.status === 'approved' ? (colors.success || 0x2ecc71) : (colors.warning || 0xf39c12))
            .setTitle('📋 Informações da Whitelist')
            .setDescription(`Informações da whitelist de ${targetUser}:`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                {
                    name: '👤 Usuário',
                    value: `${targetUser} \n**Tag:** ${targetUser.tag}\n**ID:** \`${targetUser.id}\``,
                    inline: false
                },
                {
                    name: '🎮 Nome de Usuário Minecraft',
                    value: `\`${whitelist.minecraftUsername || 'Não informado'}\``,
                    inline: true
                },
                {
                    name: '📱 Plataforma',
                    value: `${platformIcon} **${platformName}**`,
                    inline: true
                },
                {
                    name: '🛈 Status',
                    value: `\`${whitelist.status || 'desconhecido'}\``,
                    inline: true
                },
                {
                    name: '⏱️ Datas',
                    value: `**Enviada:** ${submittedAt}\n**Última atualização:** ${updatedAt}`,
                    inline: false
                },
                {
                    name: '⚙️ Modo do Servidor',
                    value: isOfflineMode ? '🔌 **Offline Mode**' : '🌐 **Online Mode**',
                    inline: true
                }
            )
            .setFooter({
                text: `Solicitado por ${interaction.user.tag}`,
                iconURL: interaction.user.displayAvatarURL({ dynamic: true })
            })
            .setTimestamp();

        return await interaction.editReply(toEmbedReply(embed, true));
    } catch (error) {
        logger.error('Erro ao buscar informações de whitelist', {
            error: error.message,
            stack: error.stack,
            userId: interaction.user.id
        });

        try {
            await interaction.editReply({
                content: '❌ Ocorreu um erro ao buscar as informações de whitelist.'
            });
        } catch {
            // ignore
        }
    }
}


