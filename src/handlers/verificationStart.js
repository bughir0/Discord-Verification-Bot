import {
    ModalBuilder,
    ActionRowBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder
} from 'discord.js';
import { mergeV2WithRows, toV2FromEmbedBuilder } from '../utils/embedBuilderV2.js';
import { database as db } from '../database/database.js';
import { getRoleId, getColors } from '../utils/configHelper.js';

/**
 * Handles the verification start process when a user clicks the verification button
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction
 * @returns {Promise<void>}
 */

async function handleVerificationStart(interaction) {
    // Early return if not a button interaction
    if (!interaction.isButton()) return;
    
    // Check if already handled
    if (interaction.replied || interaction.deferred) {
        console.log(`[${new Date().toISOString()}] Interaction already handled:`, interaction.id);
        return;
    }
    
    // For modal interactions, we don't need to defer the reply
    // as we'll be showing a modal instead of replying immediately
    if (!interaction.isButton()) {
        return;
    }
    
    // Verificar se o sistema de verificação está ativado
    const isEnabled = db.isSystemEnabled(interaction.guild.id, 'verification');
    if (!isEnabled) {
        const colors = getColors();
        const embed = new EmbedBuilder()
            .setColor(colors.warning || 0xf39c12)
            .setAuthor({ 
                name: 'Sistema Desativado', 
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined 
            })
            .setTitle('⚠️ Sistema de Verificação Desativado')
            .setDescription('O sistema de verificação está temporariamente desativado. Entre em contato com um administrador para mais informações.')
            .setFooter({ 
                text: 'Use /verification status para verificar o status', 
                iconURL: interaction.guild.iconURL({ dynamic: true }) 
            })
            .setTimestamp();
        
        return await interaction.reply(toV2FromEmbedBuilder(embed, true));
    }
    
    const member = interaction.member;
    const verifiedRoleId = getRoleId(interaction.guild.id, 'verified');
    const userId = member.id;
    const colors = getColors();
    
    // Check for pending verification
    const existingVerification = await db.getVerification(userId);
    if (existingVerification && existingVerification.status === 'pending') {
        const embed = new EmbedBuilder()
            .setColor(colors.warning || 0xf39c12)
            .setAuthor({ 
                name: 'Verificação em Andamento', 
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined 
            })
            .setTitle('⏳ Você já tem uma verificação pendente')
            .setDescription('Sua solicitação de verificação está sendo analisada pela equipe. Por favor, aguarde até que um moderador revise sua solicitação.')
            .addFields(
                {
                    name: '📝 Status',
                    value: '```🟡 PENDENTE - Aguardando análise```',
                    inline: false
                },
                {
                    name: '⏰ Quando',
                    value: existingVerification.submittedAt 
                        ? `<t:${Math.floor(new Date(existingVerification.submittedAt).getTime() / 1000)}:R>`
                        : 'Desconhecido',
                    inline: true
                }
            )
            .setFooter({ 
                text: 'Você será notificado quando sua verificação for processada', 
                iconURL: interaction.guild.iconURL({ dynamic: true }) 
            })
            .setTimestamp();

        if (!interaction.replied && !interaction.deferred) {
            return interaction.reply(toV2FromEmbedBuilder(embed, true));
        } else {
            return interaction.editReply(toV2FromEmbedBuilder(embed, true));
        }
    }
    
    // Check if member already has verified role
    if (verifiedRoleId && member.roles.cache.has(verifiedRoleId)) {
        const embed = new EmbedBuilder()
            .setColor(colors.success || 0x2ecc71)
            .setAuthor({ 
                name: 'Você já está verificado!', 
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined 
            })
            .setTitle('✅ Verificação Completa')
            .setDescription(`Parabéns, <@${member.user.id}>! Você já está verificado neste servidor e tem acesso a todos os canais.`)
            .addFields(
                {
                    name: '🎉 Status',
                    value: '```🟢 VERIFICADO - Acesso completo ao servidor```',
                    inline: false
                }
            )
            .setFooter({ 
                text: 'Aproveite o servidor!', 
                iconURL: interaction.guild.iconURL({ dynamic: true }) 
            })
            .setTimestamp();

        // First reply to the interaction if not already done
        if (!interaction.replied && !interaction.deferred) {
            return interaction.reply(toV2FromEmbedBuilder(embed, true)).catch(err => console.error('Error sending already verified message:', err));
        } else {
            // If already replied or deferred, use editReply
            return interaction.editReply(toV2FromEmbedBuilder(embed, true)).catch(err => console.error('Error updating already verified message:', err));
        }
    }
        
    try {
        // Show the modal directly without deferring first
        const modal = new ModalBuilder()
            .setCustomId('verification_modal')
            .setTitle('Verificação de Membro');

        const referralInput = new TextInputBuilder()
            .setCustomId('referral_name')
            .setLabel('Quem te convidou para o servidor?')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('Digite o nome da pessoa que te convidou')
            .setMinLength(2)
            .setMaxLength(100);

        const firstActionRow = new ActionRowBuilder().addComponents(referralInput);
        modal.addComponents(firstActionRow);

        // Show the modal
        await interaction.showModal(modal);
        return; // Successfully showed the modal
    } catch (modalError) {
        console.error('Error showing verification modal:', modalError);
        
        // Try to send an error message
        try {
            const modalErr = new EmbedBuilder()
                .setColor(colors.danger)
                .setTitle('❌ Erro')
                .setDescription('Não foi possível abrir o formulário de verificação. Por favor, tente novamente.');
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply(toV2FromEmbedBuilder(modalErr, true));
            } else {
                await interaction.reply(toV2FromEmbedBuilder(modalErr, true));
            }
        } catch (replyError) {
            console.error('Failed to send error message:', replyError);
            
            // Last resort: try to DM the user
            try {
                if (interaction.member) {
                    const dmErr = new EmbedBuilder()
                        .setColor(colors.danger)
                        .setTitle('❌ Erro na Verificação')
                        .setDescription('Ocorreu um erro ao processar sua solicitação de verificação. Por favor, tente novamente mais tarde.');
                    await interaction.member.send({ ...toV2FromEmbedBuilder(dmErr) });
                }
            } catch (dmError) {
                console.error('Failed to send DM:', dmError);
            }
        }
        
        return;
    }
}

export { handleVerificationStart };
