import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getChannelId, getRoleId, getColors, getStaffRoleIds } from '../../utils/configHelper.js';
import { success, warning, error } from '../../utils/responseUtils.js';

export const data = new SlashCommandBuilder()
    .setName('config-validar')
    .setDescription('Valida se todas as configurações necessárias estão definidas')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false);

export async function handleConfigValidateCommand(interaction) {
    const guildId = interaction.guild.id;
    const colors = getColors();

    const requiredChannels = [
        { key: 'verification', name: 'Canal de Verificação' },
        { key: 'logFicha', name: 'Canal de Log Ficha' },
        { key: 'modLogs', name: 'Canal de Logs de Moderação' }
    ];

    const optionalChannels = [
        { key: 'notification', name: 'Canal de Notificações de Verificação' },
        { key: 'log', name: 'Canal de Logs' },
        { key: 'logCall', name: 'Canal de Logs de Call' },
        { key: 'logRole', name: 'Canal de Logs de Cargo' },
        { key: 'memberLogs', name: 'Canal de Logs de Membros' },
        { key: 'logUsername', name: 'Canal de Logs de Username' },
        { key: 'logAvatar', name: 'Canal de Logs de Avatar' },
        { key: 'logDisplayName', name: 'Canal de Logs de Display Name' },
        { key: 'logMessage', name: 'Canal de Logs de Mensagens' }
    ];

    const requiredRoles = [
        { key: 'verified', name: 'Cargo Verificado' }
    ];

    const optionalRoles = [
        { key: 'firstLadyGiver', name: 'Cargo Doador de Primeira Dama' },
        { key: 'firstLady', name: 'Cargo Primeira Dama' }
    ];

    const missing = [];
    const configured = [];
    const optional = [];

    // Verificar canais obrigatórios
    for (const channel of requiredChannels) {
        const channelId = getChannelId(guildId, channel.key);
        if (channelId) {
            const channelObj = interaction.guild.channels.cache.get(channelId);
            if (channelObj) {
                configured.push({ type: 'canal', name: channel.name, value: channelObj.toString() });
            } else {
                missing.push({ type: 'canal', name: channel.name, reason: 'Canal não encontrado no servidor' });
            }
        } else {
            missing.push({ type: 'canal', name: channel.name, reason: 'Não configurado' });
        }
    }

    // Verificar canais opcionais
    for (const channel of optionalChannels) {
        const channelId = getChannelId(guildId, channel.key);
        if (channelId) {
            const channelObj = interaction.guild.channels.cache.get(channelId);
            if (channelObj) {
                optional.push({ type: 'canal', name: channel.name, value: channelObj.toString() });
            }
        }
    }

    // Verificar cargos obrigatórios
    for (const role of requiredRoles) {
        const roleId = getRoleId(guildId, role.key);
        if (roleId) {
            const roleObj = interaction.guild.roles.cache.get(roleId);
            if (roleObj) {
                configured.push({ type: 'cargo', name: role.name, value: roleObj.toString() });
            } else {
                missing.push({ type: 'cargo', name: role.name, reason: 'Cargo não encontrado no servidor' });
            }
        } else {
            missing.push({ type: 'cargo', name: role.name, reason: 'Não configurado' });
        }
    }

    // Verificar cargos staff (múltiplos)
    const staffRoleIds = getStaffRoleIds(guildId);
    if (staffRoleIds.length > 0) {
        const validStaffRoles = [];
        const invalidStaffRoles = [];
        
        staffRoleIds.forEach(roleId => {
            const roleObj = interaction.guild.roles.cache.get(roleId);
            if (roleObj) {
                validStaffRoles.push(roleObj.toString());
            } else {
                invalidStaffRoles.push(roleId);
            }
        });
        
        if (validStaffRoles.length > 0) {
            configured.push({ 
                type: 'cargo', 
                name: `Cargos Staff (${validStaffRoles.length})`, 
                value: validStaffRoles.join(', ') 
            });
        }
        
        if (invalidStaffRoles.length > 0) {
            invalidStaffRoles.forEach(roleId => {
                missing.push({ type: 'cargo', name: 'Cargo Staff', reason: `Cargo não encontrado (${roleId})` });
            });
        }
    } else {
        missing.push({ type: 'cargo', name: 'Cargos Staff', reason: 'Nenhum cargo staff configurado' });
    }

    // Verificar cargos opcionais
    for (const role of optionalRoles) {
        const roleId = getRoleId(guildId, role.key);
        if (roleId) {
            const roleObj = interaction.guild.roles.cache.get(roleId);
            if (roleObj) {
                optional.push({ type: 'cargo', name: role.name, value: roleObj.toString() });
            }
        }
    }

    // Criar embed de validação
    const embed = new EmbedBuilder()
        .setTitle('<a:sucesso:1443149628085244036> Validação de Configuração')
        .setColor(missing.length === 0 ? colors.success : colors.warning)
        .setDescription(missing.length === 0 
            ? '<a:sucesso:1443149628085244036> Todas as configurações obrigatórias estão configuradas corretamente!'
            : `⚠️ Encontradas ${missing.length} configuração(ões) faltando ou inválida(s).`)
        .setTimestamp();

    // Adicionar campos de configurações válidas
    if (configured.length > 0) {
        const configuredText = configured
            .map(c => `<a:sucesso:1443149628085244036> **${c.name}**: ${c.value}`)
            .join('\n');
        embed.addFields({
            name: '<a:sucesso:1443149628085244036> Configurado',
            value: configuredText || 'Nenhuma',
            inline: false
        });
    }

    // Adicionar campos de configurações faltando
    if (missing.length > 0) {
        const missingText = missing
            .map(m => `❌ **${m.name}**: ${m.reason}`)
            .join('\n');
        embed.addFields({
            name: '❌ Faltando ou Inválido',
            value: missingText,
            inline: false
        });

        // Adicionar sugestões
        const suggestions = missing
            .filter(m => m.reason === 'Não configurado' || m.reason === 'Nenhum cargo staff configurado')
            .map(m => {
                if (m.type === 'canal') {
                    const key = requiredChannels.find(c => c.name === m.name)?.key || optionalChannels.find(c => c.name === m.name)?.key;
                    return `\`/config canal tipo:${key} canal:<canal>\``;
                } else {
                    if (m.name.includes('Staff')) {
                        return `\`/config staff adicionar cargo:<cargo>\``;
                    }
                    const key = requiredRoles.find(r => r.name === m.name)?.key || optionalRoles.find(r => r.name === m.name)?.key;
                    return `\`/config cargo tipo:${key} cargo:<cargo>\``;
                }
            })
            .join('\n');

        if (suggestions) {
            embed.addFields({
                name: '💡 Sugestões',
                value: suggestions,
                inline: false
            });
        }
    }

    // Adicionar configurações opcionais
    if (optional.length > 0) {
        const optionalText = optional
            .map(o => `⚪ **${o.name}**: ${o.value}`)
            .join('\n');
        embed.addFields({
            name: '⚪ Opcional (Configurado)',
            value: optionalText,
            inline: false
        });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

