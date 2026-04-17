import { EmbedBuilder } from 'discord.js';
import { database as db } from '../database/database.js';
import { success, error } from '../utils/responseUtils.js';
import logger from '../utils/logger.js';
import { getColors } from '../utils/configHelper.js';

/**
 * Handles verification toggle confirmation buttons
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction
 * @returns {Promise<void>}
 */
export async function handleVerificationToggleButton(interaction) {
    try {
        // Extrair ação e userId do customId
        // Formato: verification_confirm_activate_123456789 ou verification_confirm_deactivate_123456789
        const customIdParts = interaction.customId.split('_');
        if (customIdParts.length < 4) {
            logger.error('Custom ID inválido para toggle de verificação', {
                customId: interaction.customId
            });
            return;
        }

        const action = customIdParts[2]; // activate ou deactivate
        const userId = customIdParts[3];

        // Verificar se o usuário que clicou é o mesmo que iniciou a ação
        if (interaction.user.id !== userId) {
            const colors = getColors();
            const embed = new EmbedBuilder()
                .setColor(colors.danger || 0xe74c3c)
                .setTitle('❌ Acesso Negado')
                .setDescription('Apenas quem iniciou esta ação pode confirmá-la.')
                .setFooter({ text: 'Acesso Negado', iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            return await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }

        // Verificar se é cancelamento
        if (customIdParts[1] === 'cancel') {
            const colors = getColors();
            const embed = new EmbedBuilder()
                .setColor(colors.warning || 0xf39c12)
                .setTitle('❌ Ação Cancelada')
                .setDescription('A ação foi cancelada. Nenhuma alteração foi feita.')
                .setFooter({ text: 'Cancelado', iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            return await interaction.update({
                embeds: [embed],
                components: []
            });
        }

        // Executar ação
        const guildId = interaction.guild.id;
        const isActivate = action === 'activate';

        // Verificar estado atual antes de executar
        const currentState = db.isSystemEnabled(guildId, 'verification');
        
        if (isActivate && currentState) {
            return await interaction.update(error({
                title: 'Sistema Já Está Ativo',
                description: 'O sistema de verificação já está ativado.',
                components: []
            }));
        }

        if (!isActivate && !currentState) {
            return await interaction.update(error({
                title: 'Sistema Já Está Desativado',
                description: 'O sistema de verificação já está desativado.',
                components: []
            }));
        }

        // Executar ação
        db.setSystemEnabled(guildId, 'verification', isActivate);

        logger.info(`Sistema de verificação ${isActivate ? 'ativado' : 'desativado'}`, {
            guildId,
            userId: interaction.user.id,
            action: action
        });

        const colors = getColors();
        const embed = new EmbedBuilder()
            .setColor(isActivate ? colors.success || 0x2ecc71 : colors.warning || 0xf39c12)
            .setTitle(isActivate ? '✅ Sistema de Verificação Ativado' : '🔴 Sistema de Verificação Desativado')
            .setDescription(
                isActivate
                    ? 'O sistema de verificação foi **ativado** com sucesso! Agora os usuários podem solicitar verificação.'
                    : 'O sistema de verificação foi **desativado**. Os usuários não poderão mais solicitar verificação até que seja reativado.'
            )
            .setFooter({ text: `Ação executada por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        return await interaction.update({
            embeds: [embed],
            components: []
        });

    } catch (error) {
        logger.error('Erro ao processar botão de toggle de verificação', {
            error: error.message,
            stack: error.stack,
            customId: interaction.customId,
            userId: interaction.user.id
        });

        const colors = getColors();
        const errorEmbed = new EmbedBuilder()
            .setColor(colors.danger || 0xe74c3c)
            .setTitle('❌ Erro')
            .setDescription('Ocorreu um erro ao processar sua ação. Por favor, tente novamente.')
            .setFooter({ text: 'Erro', iconURL: interaction.guild?.iconURL() })
            .setTimestamp();

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    embeds: [errorEmbed]
                });
            } else {
                await interaction.reply({
                    embeds: [errorEmbed],
                    ephemeral: true
                });
            }
        } catch (replyError) {
            logger.error('Erro ao enviar mensagem de erro', {
                error: replyError.message
            });
        }
    }
}

