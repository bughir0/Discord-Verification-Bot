import {
    ModalBuilder,
    ActionRowBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { mergeV2WithRows, toV2FromEmbedBuilder } from '../utils/embedBuilderV2.js';
import { database as db } from '../database/database.js';
import { getColors } from '../utils/configHelper.js';

/**
 * Handles the whitelist start process when a user clicks the whitelist button
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction
 * @returns {Promise<void>}
 */
async function handleWhitelistStart(interaction) {
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
    
    // Verificar se o sistema de whitelist está ativado
    const isEnabled = db.isSystemEnabled(interaction.guild.id, 'whitelist');
    if (!isEnabled) {
        const colors = getColors();
        const embed = new EmbedBuilder()
            .setColor(colors.warning || 0xf39c12)
            .setAuthor({ 
                name: 'Sistema Desativado', 
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined 
            })
            .setTitle('⚠️ Sistema de Whitelist Desativado')
            .setDescription('O sistema de whitelist está temporariamente desativado. Entre em contato com um administrador para mais informações.')
            .setFooter({ 
                text: 'Use /wl-ativar status para verificar o status', 
                iconURL: interaction.guild.iconURL({ dynamic: true }) 
            })
            .setTimestamp();
        
        return await interaction.reply(toV2FromEmbedBuilder(embed, true));
    }
    
    const member = interaction.member;
    const userId = member.id;
    const colors = getColors();
    
    // Check for pending whitelist
    const existingWhitelist = await db.getWhitelist(userId);
    if (existingWhitelist && existingWhitelist.status === 'pending') {
        const embed = new EmbedBuilder()
            .setColor(colors.warning || 0xf39c12)
            .setAuthor({ 
                name: 'Whitelist em Andamento', 
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined 
            })
            .setTitle('⏳ Você já tem uma whitelist pendente')
            .setDescription('Sua solicitação de whitelist está sendo analisada pela equipe. Por favor, aguarde até que um moderador revise sua solicitação.')
            .addFields(
                {
                    name: '📝 Status',
                    value: '```🟡 PENDENTE - Aguardando análise```',
                    inline: false
                },
                {
                    name: '🎮 Nome de Usuário',
                    value: existingWhitelist.minecraftUsername ? `\`${existingWhitelist.minecraftUsername}\`` : 'Não informado',
                    inline: false
                },
                {
                    name: '⏰ Quando',
                    value: existingWhitelist.submittedAt 
                        ? `<t:${Math.floor(new Date(existingWhitelist.submittedAt).getTime() / 1000)}:R>`
                        : 'Desconhecido',
                    inline: true
                }
            )
            .setFooter({ 
                text: 'Você será notificado quando sua whitelist for processada', 
                iconURL: interaction.guild.iconURL({ dynamic: true }) 
            })
            .setTimestamp();

        if (!interaction.replied && !interaction.deferred) {
            return interaction.reply(toV2FromEmbedBuilder(embed, true));
        } else {
            return interaction.editReply(toV2FromEmbedBuilder(embed, true));
        }
    }
    
    // Check if member already has approved whitelist
    if (existingWhitelist && existingWhitelist.status === 'approved') {
        const embed = new EmbedBuilder()
            .setColor(colors.success || 0x2ecc71)
            .setAuthor({ 
                name: 'Você já está na whitelist!', 
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined 
            })
            .setTitle('✅ Whitelist Aprovada')
            .setDescription(`Parabéns, <@${member.user.id}>! Você já está na whitelist do servidor e pode entrar usando seu nome de usuário do Minecraft.`)
            .addFields(
                {
                    name: '🎉 Status',
                    value: '```🟢 APROVADO - Você pode entrar no servidor```',
                    inline: false
                },
                {
                    name: '🎮 Nome de Usuário',
                    value: existingWhitelist.minecraftUsername ? `\`${existingWhitelist.minecraftUsername}\`` : 'Não informado',
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
            return interaction.reply(toV2FromEmbedBuilder(embed, true)).catch(err => console.error('Error sending already whitelisted message:', err));
        } else {
            // If already replied or deferred, use editReply
            return interaction.editReply(toV2FromEmbedBuilder(embed, true)).catch(err => console.error('Error updating already whitelisted message:', err));
        }
    }
        
    try {
        // Mostrar mensagem com botões para escolher plataforma
        const embed = new EmbedBuilder()
            .setColor(colors.primary || 0x9b59b6)
            .setAuthor({ 
                name: 'Solicitar Whitelist', 
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined 
            })
            .setTitle('🎮 Escolha sua Plataforma')
            .setDescription('Selecione a plataforma do Minecraft que você usa para jogar no servidor:')
            .addFields(
                {
                    name: '☕ Java Edition',
                    value: 'Versão para PC (Windows, Mac, Linux)',
                    inline: true
                },
                {
                    name: '🔷 Bedrock Edition',
                    value: 'Versão para Mobile, Console ou Windows 10/11',
                    inline: true
                }
            )
            .setFooter({ 
                text: 'Clique em um dos botões abaixo para continuar', 
                iconURL: interaction.guild.iconURL({ dynamic: true }) 
            })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`whitelist_platform_java_${member.id}`)
                    .setLabel('Java Edition')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('☕'),
                new ButtonBuilder()
                    .setCustomId(`whitelist_platform_bedrock_${member.id}`)
                    .setLabel('Bedrock Edition')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔷')
            );

        await interaction.reply({
            ...mergeV2WithRows(toV2FromEmbedBuilder(embed, true), [row])
        });
        return; // Successfully showed the platform selection
    } catch (modalError) {
        console.error('Error showing whitelist modal:', modalError);
        
        // Try to send an error message
        try {
            const modalErr = new EmbedBuilder()
                .setColor(colors.danger)
                .setTitle('❌ Erro')
                .setDescription('Não foi possível abrir o formulário de whitelist. Por favor, tente novamente.');
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
                        .setTitle('❌ Erro na Whitelist')
                        .setDescription('Ocorreu um erro ao processar sua solicitação de whitelist. Por favor, tente novamente mais tarde.');
                    await interaction.member.send({ ...toV2FromEmbedBuilder(dmErr) });
                }
            } catch (dmError) {
                console.error('Failed to send DM:', dmError);
            }
        }
        
        return;
    }
}

export { handleWhitelistStart };

