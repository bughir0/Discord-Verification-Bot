import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { database as db } from '../../database/database.js';
import { mergeEmbedWithRows, toEmbedReply } from '../../utils/embedBuilderV2.js';
import { success, error, info } from '../../utils/responseUtils.js';
import logger from '../../utils/logger.js';
import { getColors } from '../../utils/configHelper.js';

export const data = new SlashCommandBuilder()
    .setName('wl-ativar')
    .setDescription('Ativa ou desativa o sistema de whitelist')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
        subcommand
            .setName('ativar')
            .setDescription('Ativa o sistema de whitelist'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('desativar')
            .setDescription('Desativa o sistema de whitelist'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('status')
            .setDescription('Verifica se o sistema de whitelist está ativo'));

export async function handleWhitelistToggleCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    try {
        switch (subcommand) {
            case 'ativar':
                return await handleWhitelistActivate(interaction, guildId);
            case 'desativar':
                return await handleWhitelistDeactivate(interaction, guildId);
            case 'status':
                return await handleWhitelistStatus(interaction, guildId);
            default:
                return await interaction.reply(error({
                    title: 'Subcomando Inválido',
                    description: 'Subcomando não reconhecido.',
                    ephemeral: true
                }));
        }
    } catch (err) {
        logger.error('Erro ao executar comando whitelist toggle', {
            error: err.message,
            subcommand,
            guildId
        });
        
        return await interaction.reply(error({
            title: 'Erro',
            description: 'Ocorreu um erro ao executar este comando.',
            ephemeral: true
        }));
    }
}

async function handleWhitelistActivate(interaction, guildId) {
    // Verificar se já está ativo
    const isEnabled = db.isSystemEnabled(guildId, 'whitelist');
    
    if (isEnabled) {
        return await interaction.reply(error({
            title: 'Sistema Já Está Ativo',
            description: 'O sistema de whitelist já está **ativado**. Não é necessário ativá-lo novamente.',
            ephemeral: true
        }));
    }

    // Mostrar confirmação
    const colors = getColors();
    const confirmEmbed = new EmbedBuilder()
        .setColor(colors.warning || 0xf39c12)
        .setTitle('⚠️ Confirmar Ativação')
        .setDescription('Tem certeza que deseja **ativar** o sistema de whitelist?')
        .addFields({
            name: '📋 O que acontecerá',
            value: '• Usuários poderão solicitar whitelist\n• O sistema ficará disponível para todos',
            inline: false
        })
        .setFooter({ text: 'Esta ação pode ser revertida a qualquer momento', iconURL: interaction.guild.iconURL() })
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`wl_confirm_activate_${interaction.user.id}`)
                .setLabel('Sim, Ativar')
                .setStyle(ButtonStyle.Success)
                .setEmoji('sucesso:1443149628085244036'),
            new ButtonBuilder()
                .setCustomId(`wl_cancel_activate_${interaction.user.id}`)
                .setLabel('Cancelar')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('erro:1443149642580758569')
        );

    return await interaction.reply({
        ...mergeEmbedWithRows(toEmbedReply(confirmEmbed, true), [row])
    });
}

async function handleWhitelistDeactivate(interaction, guildId) {
    // Verificar se já está desativado
    const isEnabled = db.isSystemEnabled(guildId, 'whitelist');
    
    if (!isEnabled) {
        return await interaction.reply(error({
            title: 'Sistema Já Está Desativado',
            description: 'O sistema de whitelist já está **desativado**. Não é necessário desativá-lo novamente.',
            ephemeral: true
        }));
    }

    // Mostrar confirmação
    const colors = getColors();
    const confirmEmbed = new EmbedBuilder()
        .setColor(colors.danger || 0xe74c3c)
        .setTitle('⚠️ Confirmar Desativação')
        .setDescription('Tem certeza que deseja **desativar** o sistema de whitelist?')
        .addFields({
            name: '📋 O que acontecerá',
            value: '• Usuários NÃO poderão mais solicitar whitelist\n• O sistema ficará indisponível até ser reativado',
            inline: false
        })
        .setFooter({ text: 'Esta ação pode ser revertida a qualquer momento', iconURL: interaction.guild.iconURL() })
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`wl_confirm_deactivate_${interaction.user.id}`)
                .setLabel('Sim, Desativar')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('erro:1443149642580758569'),
            new ButtonBuilder()
                .setCustomId(`wl_cancel_deactivate_${interaction.user.id}`)
                .setLabel('Cancelar')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('↩️')
        );

    return await interaction.reply({
        ...mergeEmbedWithRows(toEmbedReply(confirmEmbed, true), [row])
    });
}

async function handleWhitelistStatus(interaction, guildId) {
    const isEnabled = db.isSystemEnabled(guildId, 'whitelist');
    const statusText = isEnabled ? '🟢 **ATIVADO**' : '🔴 **DESATIVADO**';
    const statusDescription = isEnabled 
        ? 'O sistema de whitelist está ativo e funcionando normalmente.'
        : 'O sistema de whitelist está desativado. Use `/wl-ativar ativar` para reativá-lo.';

    return await interaction.reply(info({
        title: '📊 Status do Sistema de Whitelist',
        description: statusDescription,
        fields: [
            {
                name: 'Status',
                value: statusText,
                inline: true
            },
            {
                name: 'Ação',
                value: isEnabled 
                    ? 'Use `/wl-ativar desativar` para desativar'
                    : 'Use `/wl-ativar ativar` para ativar',
                inline: true
            }
        ],
        ephemeral: true
    }));
}

