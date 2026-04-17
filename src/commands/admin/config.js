import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from 'discord.js';
import { database as db } from '../../database/database.js';
import { success, error, info, warning } from '../../utils/responseUtils.js';
import logger from '../../utils/logger.js';
import config from '../../config.js';

export const data = new SlashCommandBuilder()
    .setName('config')
    .setDescription('Gerencia as configurações do servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
        subcommand
            .setName('canal')
            .setDescription('Configura um canal')
            .addStringOption(option =>
                option.setName('tipo')
                    .setDescription('Tipo de canal a configurar')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Verificação', value: 'verification' },
                        { name: 'Notificações de Verificação', value: 'notification' },
                        { name: 'Logs', value: 'log' },
                        { name: 'Log Ficha', value: 'logFicha' },
                        { name: 'Logs de Moderação', value: 'modLogs' },
                        { name: 'Logs de Call', value: 'logCall' },
                        { name: 'Logs de Cargo', value: 'logRole' },
                        { name: 'Logs de Membros (Entrada/Saída)', value: 'memberLogs' },
                        { name: 'Logs de Username', value: 'logUsername' },
                        { name: 'Logs de Avatar', value: 'logAvatar' },
                        { name: 'Logs de Display Name', value: 'logDisplayName' },
                        { name: 'Logs de Mensagens', value: 'logMessage' },
                        { name: 'Log de Boost', value: 'boostLog' },
                        { name: 'Whitelist (wl-mine)', value: 'whitelist' },
                        { name: 'Whitelist Solicitação (wl-solicitacao)', value: 'whitelistSolicitacao' },
                        { name: 'Whitelist Log (wl-mine-log)', value: 'whitelistLog' },
                        { name: 'Whitelist Resultado', value: 'whitelistResult' }
                    ))
            .addChannelOption(option =>
                option.setName('canal')
                    .setDescription('O canal a ser configurado')
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('cargo')
            .setDescription('Configura um cargo único (Verificado ou Primeira Dama)')
            .addStringOption(option =>
                option.setName('tipo')
                    .setDescription('Tipo de cargo a configurar')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Verificado', value: 'verified' },
                        { name: 'Primeira Dama', value: 'firstLady' },
                        { name: 'Whitelist', value: 'wl' }
                    ))
            .addRoleOption(option =>
                option.setName('cargo')
                    .setDescription('O cargo a ser configurado')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('ver')
            .setDescription('Visualiza todas as configurações do servidor'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('diagnostico')
            .setDescription('Verifica se canais e cargos configurados ainda existem'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('remover')
            .setDescription('Remove uma configuração')
            .addStringOption(option =>
                option.setName('tipo')
                    .setDescription('Tipo de configuração a remover')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Canal de Verificação', value: 'channel_verification' },
                        { name: 'Canal de Notificações de Verificação', value: 'channel_notification' },
                        { name: 'Canal de Logs', value: 'channel_log' },
                        { name: 'Canal de Log Ficha', value: 'channel_logFicha' },
                        { name: 'Canal de Logs de Moderação', value: 'channel_modLogs' },
                        { name: 'Canal de Logs de Call', value: 'channel_logCall' },
                        { name: 'Canal de Logs de Cargo', value: 'channel_logRole' },
                        { name: 'Canal de Logs de Membros', value: 'channel_memberLogs' },
                        { name: 'Canal de Logs de Username', value: 'channel_logUsername' },
                        { name: 'Canal de Logs de Avatar', value: 'channel_logAvatar' },
                        { name: 'Canal de Logs de Display Name', value: 'channel_logDisplayName' },
                        { name: 'Canal de Logs de Mensagens', value: 'channel_logMessage' },
                        { name: 'Canal de Log de Boost', value: 'channel_boostLog' },
                        { name: 'Canal de Whitelist (wl-mine)', value: 'channel_whitelist' },
                        { name: 'Canal de Whitelist Solicitação (wl-solicitacao)', value: 'channel_whitelistSolicitacao' },
                        { name: 'Canal de Whitelist Log (wl-mine-log)', value: 'channel_whitelistLog' },
                        { name: 'Canal de Whitelist Resultado', value: 'channel_whitelistResult' },
                        { name: 'Cargo Verificado', value: 'role_verified' },
                        { name: 'Cargo Primeira Dama', value: 'role_firstLady' },
                        { name: 'Cargo Whitelist', value: 'role_wl' }
                    )))
    .addSubcommand(subcommand =>
        subcommand
            .setName('limpar')
            .setDescription('⚠️ Remove TODAS as configurações do servidor'))
    .addSubcommandGroup(group =>
        group
            .setName('staff')
            .setDescription('Gerencia múltiplos cargos staff (use este para adicionar vários cargos)')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('adicionar')
                    .setDescription('Adiciona um cargo staff')
                    .addRoleOption(option =>
                        option.setName('cargo')
                            .setDescription('Cargo staff a adicionar')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('remover')
                    .setDescription('Remove um cargo staff')
                    .addRoleOption(option =>
                        option.setName('cargo')
                            .setDescription('Cargo staff a remover')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('listar')
                    .setDescription('Lista todos os cargos staff configurados')))
    .addSubcommandGroup(group =>
        group
            .setName('doador-pd')
            .setDescription('Gerencia múltiplos cargos de doador de Primeira Dama (use este para adicionar vários cargos)')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('adicionar')
                    .setDescription('Adiciona um cargo de doador de Primeira Dama')
                    .addRoleOption(option =>
                        option.setName('cargo')
                            .setDescription('Cargo de doador a adicionar')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('remover')
                    .setDescription('Remove um cargo de doador de Primeira Dama')
                    .addRoleOption(option =>
                        option.setName('cargo')
                            .setDescription('Cargo de doador a remover')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('listar')
                    .setDescription('Lista todos os cargos de doador configurados')))
    .addSubcommandGroup(group =>
        group
            .setName('boost')
            .setDescription('Gerencia cargos removíveis quando boost é removido')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('adicionar')
                    .setDescription('Adiciona um cargo removível quando boost é removido')
                    .addRoleOption(option =>
                        option.setName('cargo')
                            .setDescription('Cargo a ser removido quando boost é removido')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('remover')
                    .setDescription('Remove um cargo da lista de removíveis')
                    .addRoleOption(option =>
                        option.setName('cargo')
                            .setDescription('Cargo a remover da lista')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('listar')
                    .setDescription('Lista todos os cargos removíveis configurados')));

export async function handleConfigCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const subcommandGroup = interaction.options.getSubcommandGroup();
    const guildId = interaction.guild.id;

    try {
        // Verificar se é um subcomando do grupo staff
        if (subcommandGroup === 'staff') {
            switch (subcommand) {
                case 'adicionar':
                    return await handleAddStaffRole(interaction, guildId);
                case 'remover':
                    return await handleRemoveStaffRole(interaction, guildId);
                case 'listar':
                    return await handleListStaffRoles(interaction, guildId);
            }
        }
        
        // Verificar se é um subcomando do grupo doador-pd
        if (subcommandGroup === 'doador-pd') {
            switch (subcommand) {
                case 'adicionar':
                    return await handleAddFirstLadyGiverRole(interaction, guildId);
                case 'remover':
                    return await handleRemoveFirstLadyGiverRole(interaction, guildId);
                case 'listar':
                    return await handleListFirstLadyGiverRoles(interaction, guildId);
            }
        }
        
        // Verificar se é um subcomando do grupo boost
        if (subcommandGroup === 'boost') {
            switch (subcommand) {
                case 'adicionar':
                    return await handleAddBoostRemovableRole(interaction, guildId);
                case 'remover':
                    return await handleRemoveBoostRemovableRole(interaction, guildId);
                case 'listar':
                    return await handleListBoostRemovableRoles(interaction, guildId);
            }
        }

        switch (subcommand) {
            case 'canal':
                return await handleSetChannel(interaction, guildId);
            case 'cargo':
                return await handleSetRole(interaction, guildId);
            case 'ver':
                return await handleViewConfig(interaction, guildId);
            case 'diagnostico':
                return await handleConfigDiagnostics(interaction, guildId);
            case 'remover':
                return await handleRemoveConfig(interaction, guildId);
            case 'limpar':
                return await handleClearConfig(interaction, guildId);
        }
    } catch (err) {
        logger.error('Erro ao executar comando de configuração', {
            error: err.message,
            subcommand,
            guildId
        });
        
        // Verificar se já foi respondido
        if (interaction.replied || interaction.deferred) {
            try {
                return await interaction.followUp({
                    embeds: [error({
                        title: 'Erro',
                        description: 'Ocorreu um erro ao executar este comando.',
                        ephemeral: true
                    }).embeds[0]],
                    ephemeral: true
                });
            } catch (e) {
                return;
            }
        }
        
        return await interaction.reply({
            embeds: [error({
                title: 'Erro',
                description: 'Ocorreu um erro ao executar este comando.',
                ephemeral: true
            }).embeds[0]],
            ephemeral: true
        });
    }
}

async function handleSetChannel(interaction, guildId) {
    const channelType = interaction.options.getString('tipo');
    const channel = interaction.options.getChannel('canal');

    // Verificar se o canal é válido
    if (!channel) {
        return await interaction.reply(error({
            title: 'Erro',
            description: 'Canal inválido.',
            ephemeral: true
        }));
    }

    // Salvar configuração
    db.setConfig(guildId, `channel_${channelType}`, channel.id);

    const channelNames = {
        verification: 'Verificação',
        notification: 'Notificações de Verificação',
        log: 'Logs',
        logFicha: 'Log Ficha',
        modLogs: 'Logs de Moderação',
        logCall: 'Logs de Call',
        logRole: 'Logs de Cargo',
        memberLogs: 'Logs de Membros (Entrada/Saída)',
        logUsername: 'Logs de Username',
        logAvatar: 'Logs de Avatar',
        logDisplayName: 'Logs de Display Name',
        logMessage: 'Logs de Mensagens',
        boostLog: 'Log de Boost',
        whitelist: 'Whitelist (wl-mine)',
        whitelistSolicitacao: 'Whitelist Solicitação (wl-solicitacao)',
        whitelistLog: 'Whitelist Log (wl-mine-log)',
        whitelistResult: 'Whitelist Resultado'
    };

    logger.info('Canal configurado', {
        guildId,
        channelType,
        channelId: channel.id,
        channelName: channel.name
    });

    return await interaction.reply(success({
        title: 'Canal Configurado',
        description: `O canal de **${channelNames[channelType]}** foi configurado para ${channel}.`,
        fields: [
            { name: 'Tipo', value: channelNames[channelType], inline: true },
            { name: 'Canal', value: `${channel} (${channel.id})`, inline: true }
        ],
        ephemeral: true
    }));
}

async function handleSetRole(interaction, guildId) {
    const roleType = interaction.options.getString('tipo');
    const role = interaction.options.getRole('cargo');

    // Verificar se o cargo é válido
    if (!role) {
        return await interaction.reply(error({
            title: 'Erro',
            description: 'Cargo inválido.',
            ephemeral: true
        }));
    }

    // Salvar configuração para cargos únicos
    db.setConfig(guildId, `role_${roleType}`, role.id);

    const roleNames = {
        verified: 'Verificado',
        firstLady: 'Primeira Dama',
        wl: 'Whitelist'
    };

    logger.info('Cargo configurado', {
        guildId,
        roleType,
        roleId: role.id,
        roleName: role.name
    });

    return await interaction.reply(success({
        title: 'Cargo Configurado',
        description: `O cargo **${roleNames[roleType]}** foi configurado para ${role}.`,
        fields: [
            { name: 'Tipo', value: roleNames[roleType], inline: true },
            { name: 'Cargo', value: `${role} (${role.id})`, inline: true }
        ],
        ephemeral: true
    }));
}

async function handleAddStaffRole(interaction, guildId) {
    const role = interaction.options.getRole('cargo');

    if (!role) {
        return await interaction.reply(error({
            title: 'Erro',
            description: 'Cargo inválido.',
            ephemeral: true
        }));
    }

    const added = config.addStaffRole(guildId, role.id);
    if (!added) {
            return await interaction.reply(warning({
                title: 'Cargo Já Adicionado',
                description: `O cargo ${role} já está configurado como staff.`,
            ephemeral: true
        }));
    }

    logger.info('Cargo staff adicionado', {
        guildId,
        roleId: role.id,
        roleName: role.name
    });

    const staffCount = config.getStaffRoleIds(guildId).length;

        return await interaction.reply(success({
            title: 'Cargo Staff Adicionado',
        description: `O cargo ${role} foi adicionado aos cargos staff.`,
        fields: [
            { name: 'Cargo', value: `${role} (${role.id})`, inline: true },
            { name: 'Total de Cargos Staff', value: `${staffCount}`, inline: true }
        ],
        ephemeral: true
    }));
}

async function handleRemoveStaffRole(interaction, guildId) {
    const role = interaction.options.getRole('cargo');

    if (!role) {
        return await interaction.reply(error({
            title: 'Erro',
            description: 'Cargo inválido.',
            ephemeral: true
        }));
    }

    const removed = config.removeStaffRole(guildId, role.id);
    if (!removed) {
        return await interaction.reply(warning({
            title: 'Cargo Não Encontrado',
            description: `O cargo ${role} não está configurado como staff.`,
            ephemeral: true
        }));
    }

    logger.info('Cargo staff removido', {
        guildId,
        roleId: role.id,
        roleName: role.name
    });

    const staffCount = config.getStaffRoleIds(guildId).length;

    return await interaction.reply(success({
        title: 'Cargo Staff Removido',
        description: `O cargo ${role} foi removido dos cargos staff.`,
        fields: [
            { name: 'Cargo Removido', value: `${role} (${role.id})`, inline: true },
            { name: 'Cargos Staff Restantes', value: `${staffCount}`, inline: true }
        ],
        ephemeral: true
    }));
}

async function handleListStaffRoles(interaction, guildId) {
    const staffRoleIds = config.getStaffRoleIds(guildId);

    if (staffRoleIds.length === 0) {
            return await interaction.reply(warning({
                title: 'Nenhum Cargo Staff',
            description: 'Nenhum cargo staff foi configurado ainda. Use `/config staff adicionar` para adicionar cargos.',
            ephemeral: true
        }));
    }

    const fields = staffRoleIds.map((roleId, index) => {
        const role = interaction.guild.roles.cache.get(roleId);
        return {
            name: `Cargo Staff #${index + 1}`,
            value: role ? `${role} (${roleId})` : `❌ Cargo não encontrado (${roleId})`,
            inline: true
        };
    });

    return await interaction.reply(info({
        title: '👥 Cargos Staff Configurados',
        description: `Total de **${staffRoleIds.length}** cargo(s) staff configurado(s):`,
        fields: fields,
        ephemeral: true
    }));
}

async function handleAddFirstLadyGiverRole(interaction, guildId) {
    const role = interaction.options.getRole('cargo');

    if (!role) {
        return await interaction.reply(error({
            title: 'Erro',
            description: 'Cargo inválido.',
            ephemeral: true
        }));
    }

    const added = config.addFirstLadyGiverRole(guildId, role.id);
    if (!added) {
        return await interaction.reply(warning({
            title: 'Cargo Já Adicionado',
            description: `O cargo ${role} já está configurado como doador de Primeira Dama.`,
            ephemeral: true
        }));
    }

    logger.info('Cargo de doador de Primeira Dama adicionado', {
        guildId,
        roleId: role.id,
        roleName: role.name
    });

    const giverCount = config.getFirstLadyGiverRoleIds(guildId).length;

    return await interaction.reply(success({
        title: 'Cargo de Doador Adicionado',
        description: `O cargo ${role} foi adicionado aos cargos de doador de Primeira Dama.`,
        fields: [
            { name: 'Cargo', value: `${role} (${role.id})`, inline: true },
            { name: 'Total de Cargos Doadores', value: `${giverCount}`, inline: true }
        ],
        ephemeral: true
    }));
}

async function handleRemoveFirstLadyGiverRole(interaction, guildId) {
    const role = interaction.options.getRole('cargo');

    if (!role) {
        return await interaction.reply(error({
            title: 'Erro',
            description: 'Cargo inválido.',
            ephemeral: true
        }));
    }

    const removed = config.removeFirstLadyGiverRole(guildId, role.id);
    if (!removed) {
            return await interaction.reply(warning({
                title: 'Cargo Não Encontrado',
                description: `O cargo ${role} não está configurado como doador de Primeira Dama.`,
            ephemeral: true
        }));
    }

    logger.info('Cargo de doador de Primeira Dama removido', {
        guildId,
        roleId: role.id,
        roleName: role.name
    });

    const giverCount = config.getFirstLadyGiverRoleIds(guildId).length;

    return await interaction.reply(success({
        title: 'Cargo de Doador Removido',
        description: `O cargo ${role} foi removido dos cargos de doador de Primeira Dama.`,
        fields: [
            { name: 'Cargo Removido', value: `${role} (${role.id})`, inline: true },
            { name: 'Cargos Doadores Restantes', value: `${giverCount}`, inline: true }
        ],
        ephemeral: true
    }));
}

async function handleListFirstLadyGiverRoles(interaction, guildId) {
    const giverRoleIds = config.getFirstLadyGiverRoleIds(guildId);

    if (giverRoleIds.length === 0) {
            return await interaction.reply(warning({
                title: 'Nenhum Cargo de Doador',
            description: 'Nenhum cargo de doador de Primeira Dama foi configurado ainda. Use `/config doador-pd adicionar` para adicionar cargos.',
            ephemeral: true
        }));
    }

    const fields = giverRoleIds.map((roleId, index) => {
        const role = interaction.guild.roles.cache.get(roleId);
        return {
            name: `Cargo Doador #${index + 1}`,
            value: role ? `${role} (${roleId})` : `❌ Cargo não encontrado (${roleId})`,
            inline: true
        };
    });

    return await interaction.reply(info({
        title: '👥 Cargos de Doador Configurados',
        description: `Total de **${giverRoleIds.length}** cargo(s) de doador configurado(s):`,
        fields: fields,
        ephemeral: true
    }));
}

async function handleViewConfig(interaction, guildId) {
    const configs = db.getAllConfigs(guildId);

    if (Object.keys(configs).length === 0) {
            return await interaction.reply(warning({
                title: 'Nenhuma Configuração',
                description: 'Nenhuma configuração foi definida ainda. Use `/config canal` ou `/config cargo` para configurar.',
            ephemeral: true
        }));
    }

    const fields = [];
    const channelNames = {
        verification: 'Verificação',
        notification: 'Notificações de Verificação',
        log: 'Logs',
        logFicha: 'Log Ficha',
        modLogs: 'Logs de Moderação',
        logCall: 'Logs de Call',
        logRole: 'Logs de Cargo',
        memberLogs: 'Logs de Membros (Entrada/Saída)',
        logUsername: 'Logs de Username',
        logAvatar: 'Logs de Avatar',
        logDisplayName: 'Logs de Display Name',
        logMessage: 'Logs de Mensagens',
        boostLog: 'Log de Boost',
        whitelist: 'Whitelist (wl-mine)',
        whitelistSolicitacao: 'Whitelist Solicitação (wl-solicitacao)',
        whitelistLog: 'Whitelist Log (wl-mine-log)',
        whitelistResult: 'Whitelist Resultado'
    };
    const roleNames = {
        verified: 'Verificado',
        firstLady: 'Primeira Dama',
        wl: 'Whitelist'
    };

    // Organizar configurações
    const channels = [];
    const roles = [];

    for (const [key, value] of Object.entries(configs)) {
        if (key.startsWith('channel_')) {
            const type = key.replace('channel_', '');
            const channel = interaction.guild.channels.cache.get(value);
            channels.push({
                name: channelNames[type] || type,
                value: channel ? `${channel} (${value})` : `❌ Canal não encontrado (${value})`,
                inline: true
            });
        } else if (key.startsWith('role_')) {
            // Ignorar role_staff_* aqui, será mostrado separadamente
            if (key.startsWith('role_staff_')) {
                continue;
            }
            
            // Ignorar role_firstLadyGiver_* aqui, será mostrado separadamente
            if (key.startsWith('role_firstLadyGiver_')) {
                continue;
            }
            
            // Ignorar role_boostRemovable_* aqui, será mostrado separadamente
            if (key.startsWith('role_boostRemovable_')) {
                continue;
            }
            
            const type = key.replace('role_', '');
            // Ignorar role_staff também, será mostrado separadamente
            if (type === 'staff') {
                continue;
            }
            
            // Ignorar role_firstLadyGiver também, será mostrado separadamente
            if (type === 'firstLadyGiver') {
                continue;
            }
            
            // Ignorar role_boostRemovable também, será mostrado separadamente
            if (type === 'boostRemovable') {
                continue;
            }
            
            const role = interaction.guild.roles.cache.get(value);
            roles.push({
                name: roleNames[type] || type,
                value: role ? `${role} (${value})` : `❌ Cargo não encontrado (${value})`,
                inline: true
            });
        }
    }

    // Adicionar cargos staff separadamente
    const staffRoleIds = config.getStaffRoleIds(guildId);
    if (staffRoleIds.length > 0) {
        const staffRolesText = staffRoleIds
            .map((roleId, index) => {
                const role = interaction.guild.roles.cache.get(roleId);
                return role ? `${role}` : `❌ Cargo não encontrado (${roleId})`;
            })
            .join(', ');
        
        roles.push({
            name: '👥 Cargos Staff',
            value: staffRolesText || 'Nenhum',
            inline: false
        });
    }
    
    // Adicionar cargos de doador de Primeira Dama separadamente
    const giverRoleIds = config.getFirstLadyGiverRoleIds(guildId);
    if (giverRoleIds.length > 0) {
        const giverRolesText = giverRoleIds
            .map((roleId, index) => {
                const role = interaction.guild.roles.cache.get(roleId);
                return role ? `${role}` : `❌ Cargo não encontrado (${roleId})`;
            })
            .join(', ');
        
        roles.push({
            name: '👥 Cargos de Doador de Primeira Dama',
            value: giverRolesText || 'Nenhum',
            inline: false
        });
    }
    
    // Adicionar cargos de boost removíveis separadamente
    const boostRemovableRoleIds = config.getBoostRemovableRoleIds(guildId);
    if (boostRemovableRoleIds.length > 0) {
        const boostRolesText = boostRemovableRoleIds
            .map((roleId, index) => {
                const role = interaction.guild.roles.cache.get(roleId);
                return role ? `${role}` : `❌ Cargo não encontrado (${roleId})`;
            })
            .join(', ');
        
        roles.push({
            name: '🎁 Cargos Removíveis (Boost)',
            value: boostRolesText || 'Nenhum',
            inline: false
        });
    }

    // Dividir campos em múltiplos embeds se necessário (máximo 25 campos por embed)
    const MAX_FIELDS_PER_EMBED = 24; // 24 campos + 1 campo de separador = 25 total
    
    const allFields = [
        ...(channels.length > 0 ? [{ name: '📺 Canais', value: '\u200b', inline: false }, ...channels] : []),
        ...(roles.length > 0 ? [{ name: '👥 Cargos', value: '\u200b', inline: false }, ...roles] : [])
    ];
    
    if (allFields.length === 0) {
            return await interaction.reply(warning({
                title: 'Nenhuma Configuração',
                description: 'Nenhuma configuração foi definida ainda. Use `/config canal` ou `/config cargo` para configurar.',
            ephemeral: true
        }));
    }
    
    // Se houver muitos campos, dividir em múltiplos embeds
    if (allFields.length <= MAX_FIELDS_PER_EMBED) {
        const embed = info({
            title: '⚙️ Configurações do Servidor',
            description: 'Aqui estão todas as configurações atuais do servidor:',
            fields: allFields,
            ephemeral: true
        });
        return await interaction.reply(embed);
    }
    
    // Dividir em múltiplos embeds
    const embeds = [];
    let currentFields = [];
    let embedIndex = 0;
    
    for (let i = 0; i < allFields.length; i++) {
        // Se chegou ao limite, criar novo embed
        if (currentFields.length >= MAX_FIELDS_PER_EMBED) {
            embeds.push(info({
                title: embedIndex === 0 ? '⚙️ Configurações do Servidor (Parte 1)' : `⚙️ Configurações do Servidor (Parte ${embedIndex + 1})`,
                description: embedIndex === 0 ? 'Aqui estão as configurações atuais do servidor:' : '',
                fields: currentFields,
                ephemeral: true
            }));
            currentFields = [];
            embedIndex++;
        }
        
        currentFields.push(allFields[i]);
    }
    
    // Adicionar último embed se houver campos restantes
    if (currentFields.length > 0) {
        embeds.push(info({
            title: embedIndex === 0 ? '⚙️ Configurações do Servidor' : `⚙️ Configurações do Servidor (Parte ${embedIndex + 1})`,
            description: embedIndex === 0 ? 'Aqui estão as configurações atuais do servidor:' : '',
            fields: currentFields,
            ephemeral: true
        }));
    }
    
    // Enviar primeiro embed como reply e os demais como followUp
    await interaction.reply(embeds[0]);
    
    // Enviar embeds restantes como followUp
    for (let i = 1; i < embeds.length; i++) {
        await interaction.followUp(embeds[i]);
    }
}

async function handleConfigDiagnostics(interaction, guildId) {
    const configs = db.getAllConfigs(guildId);

    if (Object.keys(configs).length === 0) {
        return await interaction.reply(warning({
            title: 'Nenhuma Configuração',
            description: 'Nenhuma configuração foi definida ainda. Use `/config canal` ou `/config cargo` para configurar.',
            ephemeral: true
        }));
    }

    const guild = interaction.guild;
    const missingChannels = [];
    const missingRoles = [];
    const okChannels = [];
    const okRoles = [];

    const channelNames = {
        verification: 'Verificação',
        notification: 'Notificações de Verificação',
        log: 'Logs',
        logFicha: 'Log Ficha',
        modLogs: 'Logs de Moderação',
        logCall: 'Logs de Call',
        logRole: 'Logs de Cargo',
        memberLogs: 'Logs de Membros (Entrada/Saída)',
        logUsername: 'Logs de Username',
        logAvatar: 'Logs de Avatar',
        logDisplayName: 'Logs de Display Name',
        logMessage: 'Logs de Mensagens',
        boostLog: 'Log de Boost',
        whitelist: 'Whitelist (wl-mine)',
        whitelistSolicitacao: 'Whitelist Solicitação (wl-solicitacao)',
        whitelistLog: 'Whitelist Log (wl-mine-log)',
        whitelistResult: 'Whitelist Resultado'
    };

    const roleNames = {
        verified: 'Verificado',
        firstLady: 'Primeira Dama',
        wl: 'Whitelist'
    };

    for (const [key, value] of Object.entries(configs)) {
        if (key.startsWith('channel_')) {
            const type = key.replace('channel_', '');
            const channel = guild.channels.cache.get(value);
            const label = channelNames[type] || type;
            if (channel && channel.viewable) {
                okChannels.push(`<a:sucesso:1443149628085244036> ${label}: ${channel} (\`${value}\`)`);
            } else {
                missingChannels.push(`❌ ${label}: canal não encontrado (\`${value}\`)`);
            }
        } else if (key.startsWith('role_')) {
            if (key.startsWith('role_staff_') || key.startsWith('role_firstLadyGiver_') || key.startsWith('role_boostRemovable_')) {
                continue;
            }
            const type = key.replace('role_', '');
            if (type === 'staff' || type === 'firstLadyGiver' || type === 'boostRemovable') continue;

            const role = guild.roles.cache.get(value);
            const label = roleNames[type] || type;
            if (role) {
                okRoles.push(`<a:sucesso:1443149628085244036> ${label}: ${role} (\`${value}\`)`);
            } else {
                missingRoles.push(`❌ ${label}: cargo não encontrado (\`${value}\`)`);
            }
        }
    }

    const fields = [];

    const MAX_FIELD_VALUE = 1024;

    function pushChunkedField(baseName, lines) {
        if (!lines.length) {
            fields.push({
                name: baseName,
                value: 'Nenhum registro.',
                inline: false
            });
            return;
        }

        let buffer = '';
        let part = 1;

        for (const line of lines) {
            const lineWithBreak = (buffer ? '\n' : '') + line;
            if ((buffer + lineWithBreak).length > MAX_FIELD_VALUE) {
                fields.push({
                    name: part === 1 ? baseName : `${baseName} (parte ${part})`,
                    value: buffer,
                    inline: false
                });
                buffer = line;
                part++;
            } else {
                buffer += lineWithBreak;
            }
        }

        if (buffer) {
            fields.push({
                name: part === 1 ? baseName : `${baseName} (parte ${part})`,
                value: buffer,
                inline: false
            });
        }
    }

    // Canais OK e faltando
    if (okChannels.length) {
        pushChunkedField('📺 Canais configurados', okChannels);
    } else {
        fields.push({
            name: '📺 Canais configurados',
            value: 'Nenhum canal configurado.',
            inline: false
        });
    }

    if (missingChannels.length) {
        pushChunkedField('⚠️ Canais ausentes ou inválidos', missingChannels);
    }

    // Cargos OK e faltando
    if (okRoles.length) {
        pushChunkedField('👥 Cargos configurados', okRoles);
    } else {
        fields.push({
            name: '👥 Cargos configurados',
            value: 'Nenhum cargo configurado.',
            inline: false
        });
    }

    if (missingRoles.length) {
        pushChunkedField('⚠️ Cargos ausentes ou inválidos', missingRoles);
    }

    const hasProblems = missingChannels.length > 0 || missingRoles.length > 0;

    const embed = hasProblems
        ? warning({
            title: 'Diagnóstico de Configuração',
            description: 'Algumas configurações parecem estar inválidas ou apontando para recursos que não existem mais.',
            fields,
            ephemeral: true
        })
        : success({
            title: 'Diagnóstico de Configuração',
            description: 'Todas as configurações de canais e cargos parecem válidas. 🎉',
            fields,
            ephemeral: true
        });

    return await interaction.reply(embed);
}

async function handleRemoveConfig(interaction, guildId) {
    const configType = interaction.options.getString('tipo');

    const config = db.getConfig(guildId, configType);
    if (!config) {
        return await interaction.reply(warning({
            title: 'Configuração Não Encontrada',
            description: 'Esta configuração não está definida.',
            ephemeral: true
        }));
    }

    db.deleteConfig(guildId, configType);

    logger.info('Configuração removida', {
        guildId,
        configType
    });

    return await interaction.reply(success({
        title: 'Configuração Removida',
        description: 'A configuração foi removida com sucesso.',
        ephemeral: true
    }));
}

async function handleClearConfig(interaction, guildId) {
    const configs = db.getAllConfigs(guildId);
    
    if (Object.keys(configs).length === 0) {
            return await interaction.reply(warning({
                title: 'Nenhuma Configuração',
                description: 'Não há configurações para remover.',
            ephemeral: true
        }));
    }

    // Criar embed de confirmação
    const confirmEmbed = warning({
        title: 'Confirmar Limpeza',
        description: `Você tem certeza que deseja remover **TODAS** as ${Object.keys(configs).length} configurações do servidor?\n\nEsta ação **NÃO PODE** ser desfeita!`,
        ephemeral: false
    });

    return await interaction.reply({
        ...confirmEmbed,
        components: [
            {
                type: 1,
                components: [
                    {
                        type: 2,
                        style: 4, // Danger
                        label: 'Confirmar',
                        custom_id: 'config_clear_confirm',
                        emoji: { name: '⚠️' }
                    },
                    {
                        type: 2,
                        style: 2, // Secondary
                        label: 'Cancelar',
                        custom_id: 'config_clear_cancel',
                        emoji: { name: '❌' }
                    }
                ]
            }
        ]
    });
}

async function handleAddBoostRemovableRole(interaction, guildId) {
    const role = interaction.options.getRole('cargo');

    if (!role) {
        return await interaction.reply(error({
            title: 'Erro',
            description: 'Cargo inválido.',
            ephemeral: true
        }));
    }

    const added = config.addBoostRemovableRole(guildId, role.id);
    if (!added) {
        return await interaction.reply(warning({
            title: 'Cargo Já Adicionado',
            description: `O cargo ${role} já está configurado como removível quando boost é removido.`,
            ephemeral: true
        }));
    }

    logger.info('Cargo de boost removível adicionado', {
        guildId,
        roleId: role.id,
        roleName: role.name
    });

    const boostCount = config.getBoostRemovableRoleIds(guildId).length;

    return await interaction.reply(success({
        title: 'Cargo Adicionado',
        description: `O cargo ${role} será removido automaticamente quando um membro remover o boost.`,
        fields: [
            { name: 'Cargo', value: `${role} (${role.id})`, inline: true },
            { name: 'Total de Cargos Removíveis', value: `${boostCount}`, inline: true }
        ],
        ephemeral: true
    }));
}

async function handleRemoveBoostRemovableRole(interaction, guildId) {
    const role = interaction.options.getRole('cargo');

    if (!role) {
        return await interaction.reply(error({
            title: 'Erro',
            description: 'Cargo inválido.',
            ephemeral: true
        }));
    }

    const removed = config.removeBoostRemovableRole(guildId, role.id);
    if (!removed) {
        return await interaction.reply(warning({
            title: 'Cargo Não Encontrado',
            description: `O cargo ${role} não está configurado como removível quando boost é removido.`,
            ephemeral: true
        }));
    }

    logger.info('Cargo de boost removível removido', {
        guildId,
        roleId: role.id,
        roleName: role.name
    });

    const boostCount = config.getBoostRemovableRoleIds(guildId).length;

    return await interaction.reply(success({
        title: 'Cargo Removido',
        description: `O cargo ${role} não será mais removido automaticamente quando boost for removido.`,
        fields: [
            { name: 'Cargo Removido', value: `${role} (${role.id})`, inline: true },
            { name: 'Cargos Removíveis Restantes', value: `${boostCount}`, inline: true }
        ],
        ephemeral: true
    }));
}

async function handleListBoostRemovableRoles(interaction, guildId) {
    const boostRoleIds = config.getBoostRemovableRoleIds(guildId);

    if (boostRoleIds.length === 0) {
        return await interaction.reply(warning({
            title: 'Nenhum Cargo Configurado',
            description: 'Nenhum cargo removível foi configurado ainda. Use `/config boost adicionar` para adicionar cargos.',
            ephemeral: true
        }));
    }

    const fields = boostRoleIds.map((roleId, index) => {
        const role = interaction.guild.roles.cache.get(roleId);
        return {
            name: `Cargo Removível #${index + 1}`,
            value: role ? `${role} (${roleId})` : `❌ Cargo não encontrado (${roleId})`,
            inline: true
        };
    });

    return await interaction.reply(info({
        title: '🎁 Cargos Removíveis Configurados',
        description: `Total de **${boostRoleIds.length}** cargo(s) que serão removidos quando boost for removido:`,
        fields: fields,
        ephemeral: true
    }));
}

export async function handleConfigButton(interaction) {
    const guildId = interaction.guild.id;

    if (interaction.customId === 'config_clear_confirm') {
        db.clearAllConfigs(guildId);

        logger.info('Todas as configurações removidas', {
            guildId,
            userId: interaction.user.id
        });

        await interaction.update({
            ...success({
                title: 'Configurações Removidas',
                description: 'Todas as configurações do servidor foram removidas com sucesso.',
                ephemeral: false
            }),
            components: [] // remove botões para evitar cliques duplicados/expirados
        });
    } else if (interaction.customId === 'config_clear_cancel') {
        await interaction.update({
            ...warning({
                title: 'Operação Cancelada',
                description: 'A remoção das configurações foi cancelada.',
                ephemeral: false
            }),
            components: [] // remove botões após cancelar
        });
    }
}

