import {
    ModalBuilder,
    ActionRowBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder
} from 'discord.js';
import { mergeEmbedWithRows, toEmbedReply } from '../utils/embedBuilderV2.js';
import { getColors } from '../utils/configHelper.js';
import logger from '../utils/logger.js';

/**
 * Handles platform selection button click (Java or Bedrock)
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction
 * @returns {Promise<void>}
 */
async function handleWhitelistPlatform(interaction) {
    try {
        // Verificar se a interação já foi respondida
        if (interaction.replied || interaction.deferred) {
            logger.warning('Tentativa de processar interação já respondida', {
                interactionId: interaction.id,
                customId: interaction.customId,
                userId: interaction.user.id
            });
            return;
        }

        // Extrair plataforma e userId do customId
        // Formato: whitelist_platform_java_123456789 ou whitelist_platform_bedrock_123456789
        const customIdParts = interaction.customId.split('_');
        if (customIdParts.length < 4) {
            logger.error('Custom ID inválido para seleção de plataforma', {
                customId: interaction.customId
            });
            return;
        }

        const platform = customIdParts[2]; // java ou bedrock
        const userId = customIdParts[3];

        // Verificar se o usuário que clicou é o mesmo que iniciou a solicitação
        if (interaction.user.id !== userId) {
            const colors = getColors();
            const embed = new EmbedBuilder()
                .setColor(colors.danger || 0xe74c3c)
                .setTitle('❌ Erro')
                .setDescription('Esta solicitação não é sua. Por favor, inicie uma nova solicitação de whitelist.')
                .setFooter({ text: 'Erro', iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            return await interaction.reply(toEmbedReply(embed, true));
        }

        // Validar plataforma
        if (platform !== 'java' && platform !== 'bedrock') {
            logger.error('Plataforma inválida', {
                platform: platform,
                customId: interaction.customId
            });
            return;
        }

        // Mostrar modal apenas com campo de nome de usuário
        const modal = new ModalBuilder()
            .setCustomId(`whitelist_modal_${platform}`)
            .setTitle(`Solicitar Whitelist - ${platform === 'java' ? 'Java Edition' : 'Bedrock Edition'}`);

        const minecraftUsernameInput = new TextInputBuilder()
            .setCustomId('minecraft_username')
            .setLabel('Nome de Usuário do Minecraft')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('Digite seu nome de usuário do Minecraft (ex: Steve)')
            .setMinLength(3)
            .setMaxLength(16);

        const firstActionRow = new ActionRowBuilder().addComponents(minecraftUsernameInput);
        modal.addComponents(firstActionRow);

        // Mostrar o modal
        await interaction.showModal(modal);
        
        logger.info('Modal de whitelist aberto', {
            userId: interaction.user.id,
            platform: platform,
            guildId: interaction.guild.id
        });

    } catch (error) {
        logger.error('Erro ao processar seleção de plataforma', {
            error: error.message,
            stack: error.stack,
            customId: interaction.customId,
            userId: interaction.user.id
        });

        const colors = getColors();
        const errorEmbed = new EmbedBuilder()
            .setColor(colors.danger || 0xe74c3c)
            .setTitle('❌ Erro')
            .setDescription('Ocorreu um erro ao processar sua seleção. Por favor, tente novamente.')
            .setFooter({ text: 'Erro', iconURL: interaction.guild?.iconURL() })
            .setTimestamp();

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply(toEmbedReply(errorEmbed, true));
            } else {
                await interaction.reply(toEmbedReply(errorEmbed, true));
            }
        } catch (replyError) {
            logger.error('Erro ao enviar mensagem de erro', {
                error: replyError.message
            });
        }
    }
}

export { handleWhitelistPlatform };

