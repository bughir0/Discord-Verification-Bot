import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { database as db } from '../../database/database.js';
import { mergeV2WithRows } from '../../utils/embedBuilderV2.js';
import { success, error, warning, info } from '../../utils/responseUtils.js';
import logger from '../../utils/logger.js';
import { getRoleId } from '../../utils/configHelper.js';
import config from '../../config.js';
import { updateWithAutoDelete, replyWithAutoDelete } from '../../utils/autoDeleteMessage.js';

export const data = new SlashCommandBuilder()
    .setName('pd')
    .setDescription('Gerencia o cargo de Primeira Dama')
    .addSubcommand(subcommand =>
        subcommand
            .setName('give')
            .setDescription('Dá o cargo de Primeira Dama para alguém')
            .addUserOption(option =>
                option.setName('usuário')
                    .setDescription('O usuário que receberá o cargo')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('remove')
            .setDescription('Remove o cargo de Primeira Dama da pessoa atual'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('view')
            .setDescription('Mostra quem é sua Primeira Dama'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('list')
            .setDescription('Lista todas as Primeiras Damas do servidor e quem deu para cada uma'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('config')
            .setDescription('Configura o sistema de Primeira Dama')
            .addStringOption(option =>
                option.setName('ação')
                    .setDescription('Ação a realizar')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Definir Limite', value: 'limit' },
                        { name: 'Ver Configurações', value: 'view' }
                    ))
            .addIntegerOption(option =>
                option.setName('limite')
                    .setDescription('Número máximo de Primeiras Damas (0 para desabilitar)')
                    .setRequired(false)
                    .setMinValue(0)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false);

/**
 * Valida se o usuário tem permissão para usar o comando
 */
async function validatePermissions(interaction) {
    const guild = interaction.guild;
    const user = interaction.user;
    
    // Verificar se o servidor existe
    if (!guild) {
        return {
            valid: false,
            error: error({
                title: 'Erro',
                description: 'Este comando só pode ser usado em servidores.',
                ephemeral: true
            })
        };
    }
    
    // Buscar membro no servidor
    let member;
    try {
        member = await guild.members.fetch(user.id);
    } catch (err) {
        logger.error('Erro ao buscar membro', { userId: user.id, guildId: guild.id, error: err.message });
        return {
            valid: false,
            error: error({
                title: 'Erro',
                description: 'Não foi possível encontrar seu perfil no servidor.',
                ephemeral: true
            })
        };
    }
    
    // Verificar se há cargos de doador configurados (sistema de múltiplos cargos)
    const giverRoleIds = config.getFirstLadyGiverRoleIds(guild.id);
    
    if (giverRoleIds.length === 0) {
        const firstLadyRoleId = getRoleId(guild.id, 'firstLady');
    const hasFirstLadyRole = firstLadyRoleId ? '<a:sucesso:1443149628085244036>' : '<a:erro:1443149642580758569>';
        
        return {
            valid: false,
            error: error({
                title: 'Configuração Incompleta',
                description: 'Nenhum cargo de **Doador de Primeira Dama** está configurado.\n\n**Status da Configuração:**\n' +
                    `${hasFirstLadyRole} Cargo Primeira Dama: ${firstLadyRoleId ? 'Configurado' : 'Não configurado'}\n` +
                    `❌ Cargos Doadores: Não configurado\n\n` +
                    `**Como configurar:**\n` +
                    `\`/config cargo tipo:Doador de Primeira Dama cargo:@NomeDoCargo\`\n\n` +
                    `**Exemplo:**\n` +
                    `\`/config cargo tipo:Doador de Primeira Dama cargo:@Doador\`\n\n` +
                    `**Nota:** Você precisa configurar pelo menos um cargo que pode **dar** Primeira Dama para outros.`,
                ephemeral: true
            })
        };
    }
    
    // Verificar se algum dos cargos existe no servidor
    const giverRoles = giverRoleIds
        .map(roleId => guild.roles.cache.get(roleId))
        .filter(Boolean);
    
    if (giverRoles.length === 0) {
        return {
            valid: false,
            error: error({
                title: 'Cargos Não Encontrados',
                description: `Nenhum dos cargos de Doador de Primeira Dama configurados foi encontrado no servidor.\n\n**Solução:**\n1. Verifique se os cargos ainda existem\n2. Reconfigure usando: \`/pd config ação:add_role cargo:@NomeDoCargo\``,
                ephemeral: true
            })
        };
    }
    
    // Verificar se o membro tem algum dos cargos necessários
    const hasGiverRole = giverRoleIds.some(roleId => member.roles.cache.has(roleId));
    if (!hasGiverRole) {
        const roleMentions = giverRoles.map(r => r.toString()).join(', ');
        return {
            valid: false,
            error: error({
                title: 'Permissão Negada',
                description: `Você precisa ter um dos seguintes cargos para usar este comando:\n${roleMentions}`,
                ephemeral: true
            })
        };
    }
    
    return { valid: true, member, giverRoles };
}

/**
 * Valida se o cargo de Primeira Dama está configurado e existe
 */
function validateFirstLadyRole(guild) {
    const firstLadyRoleId = getRoleId(guild.id, 'firstLady');
    
    if (!firstLadyRoleId) {
        return {
            valid: false,
            error: error({
                title: 'Configuração Incompleta',
                description: 'O cargo de Primeira Dama não está configurado.\n\n**Como configurar:**\n`/config cargo tipo:firstLady cargo:@NomeDoCargo`',
                ephemeral: true
            })
        };
    }
    
    const firstLadyRole = guild.roles.cache.get(firstLadyRoleId);
    if (!firstLadyRole) {
        return {
            valid: false,
            error: error({
                title: 'Cargo Não Encontrado',
                description: `O cargo de Primeira Dama (ID: ${firstLadyRoleId}) não foi encontrado no servidor.\n\n**Solução:**\n1. Verifique se o cargo ainda existe\n2. Reconfigure usando: \`/config cargo tipo:firstLady cargo:@NomeDoCargo\``,
                ephemeral: true
            })
        };
    }
    
    // Verificar se o bot tem permissão para gerenciar este cargo
    const botMember = guild.members.me;
    if (!botMember) {
        return {
            valid: false,
            error: error({
                title: 'Erro',
                description: 'Não foi possível encontrar o bot no servidor.',
                ephemeral: true
            })
        };
    }
    
    // Verificar permissões do bot
    const botPermissions = botMember.permissions;
    if (!botPermissions.has('ManageRoles')) {
        return {
            valid: false,
            error: error({
                title: 'Permissão do Bot Insuficiente',
                description: 'O bot não tem permissão para gerenciar cargos. Por favor, dê a permissão "Gerenciar Cargos" ao bot.',
                ephemeral: true
            })
        };
    }
    
    // Verificar hierarquia de roles (bot precisa ter role acima da primeira dama)
    if (botMember.roles.highest.position <= firstLadyRole.position) {
        return {
            valid: false,
            error: error({
                title: 'Hierarquia de Cargos',
                description: `O cargo do bot precisa estar acima do cargo de Primeira Dama na hierarquia do servidor.\n\n**Solução:**\n1. Vá em Configurações do Servidor > Cargos\n2. Arraste o cargo do bot acima do cargo de Primeira Dama`,
                ephemeral: true
            })
        };
    }
    
    return { valid: true, firstLadyRole, firstLadyRoleId };
}

export async function handleFirstLadyCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    try {
        // O subcomando 'config' só precisa de permissão de administrador
        if (subcommand === 'config') {
            return await handleConfigFirstLady(interaction);
        }
        
        // O subcomando 'list' pode ser usado por qualquer pessoa (apenas visualização)
        if (subcommand === 'list') {
            return await handleListFirstLadies(interaction);
        }
        
        // Validar permissões do usuário para outros subcomandos
        const permissionCheck = await validatePermissions(interaction);
        if (!permissionCheck.valid) {
            return await interaction.reply(permissionCheck.error);
        }
        
        switch (subcommand) {
            case 'give':
                return await handleGiveFirstLady(interaction);
            case 'remove':
                return await handleRemoveFirstLady(interaction);
            case 'view':
                return await handleStatusFirstLady(interaction);
            default:
                return await interaction.reply(error({
                    title: 'Subcomando Inválido',
                    description: `O subcomando "${subcommand}" não é válido.\n\n**Subcomandos disponíveis:**\n• \`/pd give\` - Dar cargo de Primeira Dama\n• \`/pd remove\` - Remover cargo\n• \`/pd view\` - Ver status\n• \`/pd list\` - Listar todas as Primeiras Damas\n• \`/pd config\` - Configurar sistema`,
                    ephemeral: true
                }));
        }
    } catch (err) {
        logger.error('Erro ao executar comando de Primeira Dama', {
            error: err.message,
            stack: err.stack,
            guildId: interaction.guild?.id,
            userId: interaction.user?.id,
            subcommand
        });
        
        return await interaction.reply(error({
            title: 'Erro',
            description: 'Ocorreu um erro ao executar este comando. Por favor, tente novamente.',
            ephemeral: true
        }));
    }
}

async function handleGiveFirstLady(interaction) {
    const targetUser = interaction.options.getUser('usuário');
    const giverId = interaction.user.id;
    const guild = interaction.guild;
    
    // Validar cargo de Primeira Dama
    const roleCheck = validateFirstLadyRole(guild);
    if (!roleCheck.valid) {
        return await interaction.reply(roleCheck.error);
    }
    
    const { firstLadyRole, firstLadyRoleId } = roleCheck;
    
    // Verificar se o alvo é um bot
    if (targetUser.bot) {
        return await interaction.reply(error({
            title: 'Erro',
            description: 'Não é possível dar o cargo de Primeira Dama para bots!',
            ephemeral: true
        }));
    }
    
    // Verificar se o alvo é o próprio usuário
    if (targetUser.id === giverId) {
        return await interaction.reply(error({
            title: 'Erro',
            description: 'Você não pode dar o cargo de Primeira Dama para si mesmo!',
            ephemeral: true
        }));
    }
    
    // Verificar se o usuário alvo está no servidor
    let targetMember;
    try {
        targetMember = await guild.members.fetch(targetUser.id);
    } catch (err) {
        logger.warning('Usuário alvo não encontrado no servidor', {
            targetUserId: targetUser.id,
            guildId: guild.id,
            error: err.message
        });
        
        return await interaction.reply(error({
            title: 'Usuário Não Encontrado',
            description: `O usuário ${targetUser.tag} não está neste servidor.`,
            ephemeral: true
        }));
    }
    
    // Verificar limite de Primeiras Damas no servidor
    const limit = db.getFirstLadyLimit(guild.id);
    if (limit !== null && limit > 0) {
        const currentCount = db.getFirstLadyCount(guild.id);
        if (currentCount >= limit) {
            return await interaction.reply(error({
                title: 'Limite Atingido',
                description: `O servidor atingiu o limite máximo de **${limit}** Primeira(s) Dama(s).\n\n**Atualmente:** ${currentCount}/${limit}\n\n**Solução:**\n• Remova uma Primeira Dama existente usando \`/pd remove\`\n• Ou aumente o limite usando \`/pd config ação:limit limite:<número>\``,
                ephemeral: true
            }));
        }
    }
    
    // Verificar e limpar Primeiras Damas inválidas (usuários que não estão mais no servidor)
    const allFirstLadiesByGiver = db.getAllFirstLadiesByGiver(guild.id, giverId);
    for (const firstLady of allFirstLadiesByGiver) {
        try {
            await guild.members.fetch(firstLady.receiverId);
        } catch (err) {
            // Se não encontrou o membro, limpar do banco de dados
            logger.warning('Primeira Dama não encontrada no servidor, limpando do banco', {
                receiverId: firstLady.receiverId,
                guildId: guild.id
            });
            db.removeFirstLady(guild.id, giverId, firstLady.receiverId);
        }
    }
    
    // Verificar se o alvo já é Primeira Dama de alguém neste servidor
    const isAlreadyFirstLady = db.getFirstLadyByReceiver(guild.id, targetUser.id);
    if (isAlreadyFirstLady) {
        // Verificar se realmente tem o cargo (validação de estado)
        const hasRole = targetMember.roles.cache.has(firstLadyRoleId);
        
        if (hasRole) {
            return await interaction.reply(error({
                title: 'Usuário Indisponível',
                description: `**${targetUser.tag}** já é Primeira Dama de outra pessoa neste servidor!`,
                ephemeral: true
            }));
        } else {
            // Se tem no banco mas não tem o cargo, limpar do banco
            logger.warning('Inconsistência detectada: usuário tem primeira dama no banco mas não tem o cargo', {
                receiverId: targetUser.id,
                guildId: guild.id
            });
            const existingGiver = db.getFirstLadyByGiver(guild.id, isAlreadyFirstLady.giverId);
            if (existingGiver) {
                db.removeFirstLady(guild.id, isAlreadyFirstLady.giverId);
            }
        }
    }
    
    // Verificar se o alvo já tem o cargo (caso tenha sido dado manualmente)
    if (targetMember.roles.cache.has(firstLadyRoleId)) {
        return await interaction.reply(warning({
            title: 'Cargo Já Atribuído',
            description: `**${targetUser.tag}** já possui o cargo de Primeira Dama, mas não está registrado no sistema.\n\n**Solução:**\n1. Remova o cargo manualmente\n2. Ou use \`/pd remover\` se você for o doador`,
            ephemeral: true
        }));
    }
    
    // Criar embed de confirmação
    const confirmEmbed = warning({
        title: 'Confirmar Primeira Dama',
        description: `Você tem certeza que deseja dar o cargo de Primeira Dama para **${targetUser.tag}**?`,
        fields: [
            { name: '👤 Usuário', value: `${targetUser} (${targetUser.tag})`, inline: true },
            { name: '🆔 ID', value: targetUser.id, inline: true },
            { name: '👑 Cargo', value: `${firstLadyRole}`, inline: false }
        ],
        thumbnail: targetUser.displayAvatarURL({ dynamic: true }),
        ephemeral: false
    });
    
    // Botões de confirmação com IDs únicos por servidor e usuário
    const confirmId = `confirm_first_lady_${guild.id}_${giverId}_${targetUser.id}`;
    const cancelId = `cancel_first_lady_${guild.id}_${giverId}`;
    
    const confirmRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(confirmId)
                .setLabel('Confirmar')
                .setEmoji('sucesso:1443149628085244036')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(cancelId)
                .setLabel('❌ Cancelar')
                .setStyle(ButtonStyle.Danger)
        );
    
    // Enviar mensagem de confirmação
    await interaction.reply(mergeV2WithRows(confirmEmbed, [confirmRow]));
    
    // Buscar a mensagem de confirmação
    const confirmationMessage = await interaction.fetchReply();
    
    // Coletor de interações
    const filter = i => {
        const isConfirm = i.customId === confirmId;
        const isCancel = i.customId === cancelId;
        const isCorrectUser = i.user.id === interaction.user.id;
        return (isConfirm || isCancel) && isCorrectUser;
    };
    
    try {
        const confirmation = await confirmationMessage.awaitMessageComponent({
            filter,
            time: 60000 // 1 minuto para responder
        });
        
        // Defer update imediatamente para evitar timeout
        if (!confirmation.replied && !confirmation.deferred) {
            await confirmation.deferUpdate();
        }
        
        if (confirmation.customId === confirmId) {
            // Re-validar estado antes de confirmar (double-check)
            // Verificar limite do servidor
            const limit = db.getFirstLadyLimit(guild.id);
            if (limit !== null && limit > 0) {
                const currentCount = db.getFirstLadyCount(guild.id);
                if (currentCount >= limit) {
                    await updateWithAutoDelete(confirmation, {
                        ...error({
                            title: 'Limite Atingido',
                            description: 'O servidor atingiu o limite máximo de Primeiras Damas. A operação foi cancelada.',
                            ephemeral: false
                        }),
                        components: []
                    });
                    return;
                }
            }
            
            const recheckReceiver = db.getFirstLadyByReceiver(guild.id, targetUser.id);
            if (recheckReceiver) {
                await updateWithAutoDelete(confirmation, {
                    ...error({
                        title: 'Usuário Já É Primeira Dama',
                        description: 'Este usuário já é Primeira Dama de outra pessoa. A operação foi cancelada.',
                        ephemeral: false
                    }),
                    components: []
                });
                return;
            }
            
            // Buscar membro novamente para garantir que ainda está no servidor
            let finalTargetMember;
            try {
                finalTargetMember = await guild.members.fetch(targetUser.id);
            } catch (err) {
                await updateWithAutoDelete(confirmation, {
                    ...error({
                        title: 'Usuário Não Encontrado',
                        description: 'O usuário não está mais no servidor. A operação foi cancelada.',
                        ephemeral: false
                    }),
                    components: []
                });
                return;
            }
            
            // Verificar novamente se já tem o cargo
            if (finalTargetMember.roles.cache.has(firstLadyRoleId)) {
                await updateWithAutoDelete(confirmation, {
                    ...error({
                        title: 'Cargo Já Atribuído',
                        description: 'O usuário já possui o cargo de Primeira Dama. A operação foi cancelada.',
                        ephemeral: false
                    }),
                    components: []
                });
                return;
            }
            
            // Dar o cargo
            try {
                await finalTargetMember.roles.add(firstLadyRole);
            } catch (roleError) {
                logger.error('Erro ao adicionar cargo de Primeira Dama', {
                    error: roleError.message,
                    guildId: guild.id,
                    targetUserId: targetUser.id,
                    roleId: firstLadyRoleId
                });
                
                await updateWithAutoDelete(confirmation, {
                    ...error({
                        title: 'Erro ao Adicionar Cargo',
                        description: 'Erro ao adicionar o cargo. Verifique se o bot tem permissões suficientes.',
                        ephemeral: false
                    }),
                    components: []
                });
                return;
            }
            
            // Registrar no banco de dados
            try {
                db.assignFirstLady(guild.id, giverId, targetUser.id);
            } catch (dbError) {
                logger.error('Erro ao registrar Primeira Dama no banco', {
                    error: dbError.message,
                    guildId: guild.id,
                    giverId,
                    receiverId: targetUser.id
                });
                
                // Tentar remover o cargo se falhou ao salvar no banco
                try {
                    await finalTargetMember.roles.remove(firstLadyRole);
                } catch (removeError) {
                    logger.error('Erro ao remover cargo após falha no banco', {
                        error: removeError.message
                    });
                }
                
                await updateWithAutoDelete(confirmation, {
                    ...error({
                        title: 'Erro ao Salvar',
                        description: 'Erro ao salvar no banco de dados. O cargo foi removido.',
                        ephemeral: false
                    }),
                    components: []
                });
                return;
            }
            
            // Criar embed de sucesso
            const successEmbed = success({
                title: 'Primeira Dama Atribuída',
                description: `**${targetUser.tag}** agora é Primeira Dama de **${interaction.user.tag}**!`,
                fields: [
                    { name: '👤 Usuário', value: `${targetUser} (${targetUser.tag})`, inline: true },
                    { name: '🆔 ID', value: targetUser.id, inline: true },
                    { name: '👑 Cargo', value: `${firstLadyRole}`, inline: false },
                    { name: '👤 Atribuído por', value: `${interaction.user} (${interaction.user.tag})`, inline: false }
                ],
                thumbnail: targetUser.displayAvatarURL({ dynamic: true }),
                ephemeral: false
            });
            
            // Atualizar mensagem de confirmação com auto-delete
            await updateWithAutoDelete(confirmation, {
                ...successEmbed,
                components: []
            });
            
            // Log da ação
            logger.info('Primeira Dama atribuída', {
                guildId: guild.id,
                giverId: giverId,
                giverTag: interaction.user.tag,
                receiverId: targetUser.id,
                receiverTag: targetUser.tag,
                roleId: firstLadyRoleId
            });
            
        } else {
            // Se o usuário cancelar
            await updateWithAutoDelete(confirmation, {
                ...error({
                    title: 'Operação Cancelada',
                    description: 'A operação foi cancelada pelo usuário.',
                    ephemeral: false
                }),
                components: []
            });
        }
    } catch (timeoutError) {
        // Se o tempo esgotar
        if (timeoutError.code === 'INTERACTION_COLLECTOR_ERROR' || timeoutError.message.includes('time')) {
            try {
                await replyWithAutoDelete(interaction, {
                    ...warning({
                        title: 'Tempo Esgotado',
                        description: 'Tempo esgotado. A operação não foi realizada.',
                        ephemeral: false
                    }),
                    components: []
                });
            } catch (editError) {
                // Se não conseguir editar, tentar followUp
                await interaction.followUp({
                    ...warning({
                        title: 'Tempo Esgotado',
                        description: 'Tempo esgotado. A operação não foi realizada.',
                        ephemeral: true
                    })
                });
            }
        } else {
            logger.error('Erro no coletor de confirmação', {
                error: timeoutError.message,
                stack: timeoutError.stack,
                guildId: guild.id
            });
            
            await interaction.followUp({
                ...error({
                    title: 'Erro ao Processar',
                    description: 'Ocorreu um erro ao processar a confirmação.',
                    ephemeral: true
                })
            });
        }
    }
}

async function handleRemoveFirstLady(interaction) {
    const giverId = interaction.user.id;
    const guild = interaction.guild;
    
    // Validar cargo de Primeira Dama
    const roleCheck = validateFirstLadyRole(guild);
    if (!roleCheck.valid) {
        return await interaction.reply(roleCheck.error);
    }
    
    const { firstLadyRole, firstLadyRoleId } = roleCheck;
    
    // Buscar todas as Primeiras Damas do usuário
    const allFirstLadies = db.getAllFirstLadiesByGiver(guild.id, giverId);
    
    if (!allFirstLadies || allFirstLadies.length === 0) {
        return await interaction.reply(error({
            title: 'Nenhuma Primeira Dama',
            description: 'Você não tem Primeiras Damas para remover neste servidor.',
            ephemeral: true
        }));
    }
    
    // Validar e limpar Primeiras Damas inválidas
    const validFirstLadies = [];
    for (const firstLadyData of allFirstLadies) {
        try {
            const member = await guild.members.fetch(firstLadyData.receiverId);
            const hasRole = member.roles.cache.has(firstLadyRoleId);
            
            if (hasRole) {
                validFirstLadies.push({
                    data: firstLadyData,
                    member: member
                });
            } else {
                // Limpar do banco se não tem o cargo
                logger.warning('Inconsistência: primeira dama no banco mas sem o cargo', {
                    receiverId: firstLadyData.receiverId,
                    guildId: guild.id
                });
                db.removeFirstLady(guild.id, giverId, firstLadyData.receiverId);
            }
        } catch (err) {
            // Se o membro não está mais no servidor, limpar do banco
            logger.warning('Primeira Dama não encontrada ao tentar remover, limpando do banco', {
                receiverId: firstLadyData.receiverId,
                guildId: guild.id
            });
            db.removeFirstLady(guild.id, giverId, firstLadyData.receiverId);
        }
    }
    
    if (validFirstLadies.length === 0) {
        return await interaction.reply(warning({
            title: 'Nenhuma Primeira Dama Válida',
            description: 'Todas as suas Primeiras Damas foram removidas ou não estão mais no servidor.',
            ephemeral: true
        }));
    }
    
    // Se houver apenas uma, mostrar confirmação antes de remover
    if (validFirstLadies.length === 1) {
        const { data: firstLadyData, member: targetMember } = validFirstLadies[0];
        return await showRemoveConfirmation(interaction, guild, giverId, targetMember, firstLadyData, firstLadyRole, firstLadyRoleId);
    }
    
    // Se houver múltiplas, mostrar lista para escolher
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`remove_first_lady_select_${guild.id}_${giverId}`)
        .setPlaceholder('Selecione a Primeira Dama para remover')
        .setMinValues(1)
        .setMaxValues(1);
    
    for (const { data: firstLadyData, member } of validFirstLadies) {
        const assignedDate = new Date(firstLadyData.assignedAt);
        const dateStr = assignedDate.toLocaleDateString('pt-BR');
        
        selectMenu.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(member.user.tag.length > 100 ? member.user.tag.substring(0, 97) + '...' : member.user.tag)
                .setDescription(`ID: ${member.user.id} • Atribuída em: ${dateStr}`)
                .setValue(firstLadyData.receiverId)
                .setEmoji('👑')
        );
    }
    
    const selectRow = new ActionRowBuilder().addComponents(selectMenu);
    
    const listEmbed = info({
        title: 'Remover Primeira Dama',
        description: `Você tem **${validFirstLadies.length}** Primeira(s) Dama(s). Selecione qual deseja remover:`,
        fields: validFirstLadies.map(({ member }, index) => ({
            name: `${index + 1}. ${member.user.tag}`,
            value: `ID: ${member.user.id}\nMembro: ${member.user}`,
            inline: false
        })),
        ephemeral: false
    });
    
    await interaction.reply({
        ...listEmbed,
        components: [selectRow]
    });
    
    // Aguardar seleção
    try {
        const confirmationMessage = await interaction.fetchReply();
        const selection = await confirmationMessage.awaitMessageComponent({
            filter: i => {
                return i.customId === `remove_first_lady_select_${guild.id}_${giverId}` &&
                       i.user.id === interaction.user.id;
            },
            time: 60000
        });
        
        // Defer update imediatamente
        if (!selection.replied && !selection.deferred) {
            await selection.deferUpdate();
        }
        
        const selectedReceiverId = selection.values[0];
        const selectedFirstLady = validFirstLadies.find(fl => fl.data.receiverId === selectedReceiverId);
        
        if (!selectedFirstLady) {
            return await updateWithAutoDelete(selection, {
                ...error({
                    title: 'Primeira Dama Não Encontrada',
                    description: 'A Primeira Dama selecionada não foi encontrada.',
                    ephemeral: false
                }),
                components: []
            });
        }
        
        // Mostrar confirmação antes de remover a Primeira Dama selecionada
        // Criar um objeto de interação que combine a original com métodos da seleção
        const combinedInteraction = {
            ...interaction,
            editReply: selection.editReply.bind(selection),
            fetchReply: selection.fetchReply ? selection.fetchReply.bind(selection) : interaction.fetchReply.bind(interaction),
            followUp: selection.followUp ? selection.followUp.bind(selection) : interaction.followUp.bind(interaction),
            replied: selection.replied || interaction.replied,
            deferred: selection.deferred || interaction.deferred
        };
        
        return await showRemoveConfirmation(
            combinedInteraction,
            guild,
            giverId,
            selectedFirstLady.member,
            selectedFirstLady.data,
            firstLadyRole,
            firstLadyRoleId
        );
        
    } catch (timeoutError) {
        // Se o tempo esgotar, editar a mensagem
        if (timeoutError.code === 'INTERACTION_COLLECTOR_ERROR' || timeoutError.message?.includes('time')) {
            try {
                await replyWithAutoDelete(interaction, {
                    ...warning({
                        title: 'Tempo Esgotado',
                        description: 'Tempo esgotado. A seleção foi cancelada.',
                        ephemeral: false
                    }),
                    components: []
                });
            } catch (editError) {
                // Se não conseguir editar, tentar followUp
                if (editError.code === 10062 || editError.code === 10008 || editError.message?.includes('Unknown interaction')) {
                    try {
                        await interaction.followUp({
                            ...warning({
                                title: 'Tempo Esgotado',
                                description: 'Tempo esgotado. A seleção foi cancelada.',
                                ephemeral: true
                            })
                        });
                    } catch (followUpError) {
                        logger.warning('Erro ao enviar follow-up de timeout no remove first lady', {
                            error: followUpError.message,
                            guildId: guild.id
                        });
                    }
                } else {
                    logger.warning('Erro ao editar mensagem de timeout no remove first lady', {
                        error: editError.message,
                        guildId: guild.id
                    });
                }
            }
        } else {
            logger.error('Erro no coletor de seleção do remove first lady', {
                error: timeoutError.message,
                stack: timeoutError.stack,
                guildId: guild.id
            });
        }
    }
}

async function showRemoveConfirmation(interaction, guild, giverId, targetMember, firstLadyData, firstLadyRole, firstLadyRoleId) {
    // Criar embed de confirmação
    const confirmEmbed = warning({
        title: 'Confirmar Remoção de Primeira Dama',
        description: `Você tem certeza que deseja remover o cargo de Primeira Dama de **${targetMember.user.tag}**?`,
        fields: [
            { name: '👤 Usuário', value: `${targetMember.user} (${targetMember.user.tag})`, inline: true },
            { name: '🆔 ID', value: targetMember.user.id, inline: true },
            { name: '👑 Cargo', value: `${firstLadyRole}`, inline: false }
        ],
        thumbnail: targetMember.user.displayAvatarURL({ dynamic: true }),
        ephemeral: false
    });
    
    // Botões de confirmação com IDs únicos por servidor e usuário
    const confirmId = `confirm_remove_first_lady_${guild.id}_${giverId}_${targetMember.user.id}`;
    const cancelId = `cancel_remove_first_lady_${guild.id}_${giverId}`;
    
    const confirmRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(confirmId)
                .setLabel('Confirmar')
                .setEmoji('sucesso:1443149628085244036')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(cancelId)
                .setLabel('❌ Cancelar')
                .setStyle(ButtonStyle.Danger)
        );
    
    // Enviar mensagem de confirmação
    let confirmationMessage;
    if (interaction.replied || interaction.deferred) {
        // Se já foi respondida, usar editReply
        await interaction.editReply(mergeV2WithRows(confirmEmbed, [confirmRow]));
        // Buscar a mensagem atualizada
        try {
            if (interaction.fetchReply && typeof interaction.fetchReply === 'function') {
                confirmationMessage = await interaction.fetchReply();
            } else if (interaction.message) {
                confirmationMessage = interaction.message;
            } else {
                // Se não tiver nenhum método, tentar buscar pelo canal
                const channel = interaction.channel;
                if (channel) {
                    // Buscar a última mensagem do bot no canal
                    const messages = await channel.messages.fetch({ limit: 1 });
                    confirmationMessage = messages.first();
                }
            }
        } catch (fetchError) {
            logger.warning('Erro ao buscar mensagem de confirmação', {
                error: fetchError.message,
                guildId: guild.id
            });
            // Se não conseguir buscar, usar a mensagem da interação se disponível
            confirmationMessage = interaction.message;
        }
    } else {
        // Primeira resposta, usar reply
        await interaction.reply(mergeV2WithRows(confirmEmbed, [confirmRow]));
        confirmationMessage = await interaction.fetchReply();
    }
    
    // Coletor de interações
    const filter = i => {
        const isConfirm = i.customId === confirmId;
        const isCancel = i.customId === cancelId;
        const isCorrectUser = i.user.id === interaction.user.id;
        return (isConfirm || isCancel) && isCorrectUser;
    };
    
    try {
        const confirmation = await confirmationMessage.awaitMessageComponent({
            filter,
            time: 60000 // 1 minuto para responder
        });
        
        // Defer update imediatamente para evitar timeout
        if (!confirmation.replied && !confirmation.deferred) {
            await confirmation.deferUpdate();
        }
        
        if (confirmation.customId === confirmId) {
            // Confirmar remoção
            return await removeFirstLadyDirectly(
                { ...interaction, editReply: confirmation.editReply.bind(confirmation) },
                guild,
                giverId,
                targetMember,
                firstLadyData,
                firstLadyRole,
                firstLadyRoleId
            );
        } else {
            // Se o usuário cancelar
            await updateWithAutoDelete(confirmation, {
                ...error({
                    title: 'Operação Cancelada',
                    description: 'A operação foi cancelada pelo usuário.',
                    ephemeral: false
                }),
                components: []
            });
        }
    } catch (timeoutError) {
        // Se o tempo esgotar, editar a mensagem
        if (timeoutError.code === 'INTERACTION_COLLECTOR_ERROR' || timeoutError.message?.includes('time')) {
            try {
                // Tentar usar editReply se disponível, senão editar a mensagem diretamente
                if (interaction.editReply) {
                    await replyWithAutoDelete(interaction, {
                        ...warning({
                            title: 'Tempo Esgotado',
                            description: 'Tempo esgotado. A operação foi cancelada.',
                            ephemeral: false
                        }),
                        components: []
                    });
                } else {
                    const { scheduleAutoDelete } = await import('../../utils/autoDeleteMessage.js');
                    await confirmationMessage.edit({
                        ...warning({
                            title: 'Tempo Esgotado',
                            description: 'Tempo esgotado. A operação foi cancelada.',
                            ephemeral: false
                        }),
                        components: []
                    });
                    scheduleAutoDelete(confirmationMessage);
                }
            } catch (editError) {
                // Se não conseguir editar, tentar followUp
                if (editError.code === 10062 || editError.code === 10008 || editError.message?.includes('Unknown interaction')) {
                    try {
                        if (interaction.followUp) {
                            await interaction.followUp({
                                ...warning({
                                    title: 'Tempo Esgotado',
                                    description: 'Tempo esgotado. A operação foi cancelada.',
                                    ephemeral: true
                                })
                            });
                        }
                    } catch (followUpError) {
                        logger.warning('Erro ao enviar follow-up de timeout no showRemoveConfirmation', {
                            error: followUpError.message,
                            guildId: guild.id
                        });
                    }
                } else {
                    logger.warning('Erro ao editar mensagem de timeout no showRemoveConfirmation', {
                        error: editError.message,
                        guildId: guild.id
                    });
                }
            }
        } else {
            logger.error('Erro no coletor de confirmação do showRemoveConfirmation', {
                error: timeoutError.message,
                stack: timeoutError.stack,
                guildId: guild.id
            });
        }
    }
}

async function removeFirstLadyDirectly(interaction, guild, giverId, targetMember, firstLadyData, firstLadyRole, firstLadyRoleId) {
    // Remover o cargo
    try {
        await targetMember.roles.remove(firstLadyRole);
    } catch (roleError) {
        logger.error('Erro ao remover cargo de Primeira Dama', {
            error: roleError.message,
            guildId: guild.id,
            targetUserId: firstLadyData.receiverId,
            roleId: firstLadyRoleId
        });
        
        const errorResponse = error({
            title: 'Erro ao Remover Cargo',
            description: 'Não foi possível remover o cargo. Verifique se o bot tem permissões suficientes.',
            ephemeral: false
        });
        
        try {
            if (interaction.editReply) {
                return await interaction.editReply(errorResponse);
            } else if (interaction.replied || interaction.deferred) {
                return await interaction.editReply(errorResponse);
            } else {
                return await interaction.reply(errorResponse);
            }
        } catch (replyErr) {
            logger.error('Erro ao enviar mensagem de erro após falha ao remover cargo', {
                error: replyErr.message
            });
            // Se ainda não foi respondida, tentar reply novamente
            if (!interaction.replied && !interaction.deferred) {
                try {
                    return await interaction.reply(errorResponse);
                } catch (retryError) {
                    logger.error('Erro ao tentar reply novamente após erro ao remover cargo', {
                        error: retryError.message
                    });
                }
            }
        }
    }
    
    // Remover do banco de dados
    try {
        db.removeFirstLady(guild.id, giverId, firstLadyData.receiverId);
    } catch (dbError) {
        logger.error('Erro ao remover Primeira Dama do banco', {
            error: dbError.message,
            guildId: guild.id,
            giverId,
            receiverId: firstLadyData.receiverId
        });
        
        const warningResponse = warning({
            title: 'Cargo Removido',
            description: 'O cargo foi removido, mas houve um erro ao atualizar o banco de dados. Tente novamente.',
            ephemeral: false
        });
        
        try {
            if (interaction.editReply) {
                return await interaction.editReply(warningResponse);
            } else if (interaction.replied || interaction.deferred) {
                return await interaction.editReply(warningResponse);
            } else {
                return await interaction.reply(warningResponse);
            }
        } catch (replyErr) {
            logger.error('Erro ao enviar mensagem de warning após remover cargo', {
                error: replyErr.message
            });
            // Se ainda não foi respondida, tentar reply novamente
            if (!interaction.replied && !interaction.deferred) {
                try {
                    return await interaction.reply(warningResponse);
                } catch (retryError) {
                    logger.error('Erro ao tentar reply novamente após warning ao remover cargo', {
                        error: retryError.message
                    });
                }
            }
        }
    }
    
    // Criar embed de sucesso
    const successEmbed = success({
        title: 'Primeira Dama Removida',
        description: `O cargo de Primeira Dama foi removido de **${targetMember.user.tag}** por **${interaction.user.tag}**.`,
        fields: [
            { name: '👤 Usuário', value: `${targetMember.user} (${targetMember.user.tag})`, inline: true },
            { name: '🆔 ID', value: targetMember.user.id, inline: true },
            { name: '👤 Removido por', value: `${interaction.user} (${interaction.user.tag})`, inline: false }
        ],
        thumbnail: targetMember.user.displayAvatarURL({ dynamic: true }),
        ephemeral: false,
        color: 0xe74c3c
    });
    
    try {
        // Verificar se já foi respondida ou deferida
        if (interaction.replied || interaction.deferred) {
            // Se já foi respondida, usar editReply com auto-delete
            await updateWithAutoDelete(interaction, {
                ...successEmbed,
                components: []
            });
        } else if (interaction.editReply) {
            // Se tem editReply mas não foi respondida, pode ser de um select menu
            await updateWithAutoDelete(interaction, {
                ...successEmbed,
                components: []
            });
        } else {
            // Primeira resposta, usar reply com auto-delete
            await replyWithAutoDelete(interaction, successEmbed);
        }
    } catch (replyError) {
        logger.error('Erro ao enviar mensagem de sucesso após remover Primeira Dama', {
            error: replyError.message,
            guildId: guild.id,
            giverId: giverId,
            receiverId: firstLadyData.receiverId,
            replied: interaction.replied,
            deferred: interaction.deferred,
            hasEditReply: !!interaction.editReply
        });
        
        // Se ainda não foi respondida, tentar reply novamente
        if (!interaction.replied && !interaction.deferred) {
            try {
                await replyWithAutoDelete(interaction, successEmbed);
            } catch (retryError) {
                logger.error('Erro ao tentar reply novamente após remover Primeira Dama', {
                    error: retryError.message
                });
            }
        }
    }
    
    // Log da ação
    logger.info('Primeira Dama removida', {
        guildId: guild.id,
        giverId: giverId,
        giverTag: interaction.user.tag,
        receiverId: firstLadyData.receiverId,
        receiverTag: targetMember.user.tag
    });
}

async function handleStatusFirstLady(interaction) {
    const giverId = interaction.user.id;
    const guild = interaction.guild;
    
    // Buscar todas as Primeiras Damas do usuário
    const allFirstLadies = db.getAllFirstLadiesByGiver(guild.id, giverId);
    
    if (!allFirstLadies || allFirstLadies.length === 0) {
        return await interaction.reply(info({
            title: 'Status da Primeira Dama',
            description: 'Você não tem Primeiras Damas atualmente neste servidor.',
            ephemeral: true
        }));
    }
    
    const firstLadyRoleId = getRoleId(guild.id, 'firstLady');
    
    // Validar e processar todas as Primeiras Damas
    const validFirstLadies = [];
    for (const firstLadyData of allFirstLadies) {
        try {
            const member = await guild.members.fetch(firstLadyData.receiverId);
            const hasRole = firstLadyRoleId ? member.roles.cache.has(firstLadyRoleId) : false;
            
            if (hasRole) {
                // Processar data
                let assignedDate;
                if (firstLadyData.assignedAt) {
                    const dateStr = String(firstLadyData.assignedAt);
                    if (dateStr.includes(' ') && !dateStr.includes('T') && !dateStr.includes('Z')) {
                        assignedDate = new Date(dateStr.replace(' ', 'T') + 'Z');
                    } else {
                        assignedDate = new Date(dateStr);
                    }
                    
                    if (isNaN(assignedDate.getTime())) {
                        assignedDate = new Date();
                    } else if (assignedDate.getTime() > Date.now()) {
                        assignedDate = new Date(Date.now() - (60 * 60 * 1000));
                    }
                } else {
                    assignedDate = new Date();
                }
                
                validFirstLadies.push({
                    data: firstLadyData,
                    member: member,
                    assignedDate: assignedDate,
                    hasRole: true
                });
            } else {
                // Limpar do banco se não tem o cargo
                logger.warning('Inconsistência detectada no status: primeira dama no banco mas sem cargo', {
                    receiverId: firstLadyData.receiverId,
                    guildId: guild.id
                });
                db.removeFirstLady(guild.id, giverId, firstLadyData.receiverId);
            }
        } catch (err) {
            // Se não encontrou, limpar do banco
            logger.warning('Primeira Dama não encontrada ao verificar status, limpando do banco', {
                receiverId: firstLadyData.receiverId,
                guildId: guild.id
            });
            db.removeFirstLady(guild.id, giverId, firstLadyData.receiverId);
        }
    }
    
    if (validFirstLadies.length === 0) {
        return await interaction.reply(warning({
            title: 'Nenhuma Primeira Dama Válida',
            description: 'Todas as suas Primeiras Damas foram removidas ou não estão mais no servidor.',
            ephemeral: true
        }));
    }
    
    // Se houver apenas uma, mostrar detalhes completos
    if (validFirstLadies.length === 1) {
        const { member: targetMember, assignedDate } = validFirstLadies[0];
        const timestamp = Math.floor(assignedDate.getTime() / 1000);
        
        const statusEmbed = info({
            title: '👑 Status da Primeira Dama',
            description: `Sua Primeira Dama atual:`,
            fields: [
                { name: '👤 Usuário', value: `${targetMember.user} (${targetMember.user.tag})`, inline: true },
                { name: '🆔 ID', value: targetMember.user.id, inline: true },
                { name: '📅 Atribuída em', value: `<t:${timestamp}:F>`, inline: false },
                { name: '⏱️ Tempo Relativo', value: `<t:${timestamp}:R>`, inline: true },
                { name: '✅ Status do Cargo', value: 'Ativo', inline: true }
            ],
            thumbnail: targetMember.user.displayAvatarURL({ dynamic: true }),
            ephemeral: true
        });
        
        return await interaction.reply(statusEmbed);
    }
    
    // Se houver múltiplas, mostrar lista
    const fields = validFirstLadies.map(({ member, assignedDate }, index) => {
        const timestamp = Math.floor(assignedDate.getTime() / 1000);
        return {
            name: `${index + 1}. ${member.user.tag}`,
            value: `👤 ${member.user}\n🆔 ${member.user.id}\n📅 <t:${timestamp}:F>\n⏱️ <t:${timestamp}:R>`,
            inline: false
        };
    });
    
    // Dividir em múltiplos embeds se necessário (máximo 25 campos por embed)
    const MAX_FIELDS_PER_EMBED = 25;
    
    if (fields.length <= MAX_FIELDS_PER_EMBED) {
        const statusEmbed = info({
            title: `👑 Status das Primeiras Damas (${validFirstLadies.length})`,
            description: `Você tem **${validFirstLadies.length}** Primeira(s) Dama(s) atualmente:`,
            fields: fields,
            ephemeral: true
        });
        
        return await interaction.reply(statusEmbed);
    }
    
    // Se houver muitos campos, dividir em múltiplos embeds
    const embeds = [];
    let currentFields = [];
    let embedIndex = 0;
    
    for (let i = 0; i < fields.length; i++) {
        if (currentFields.length >= MAX_FIELDS_PER_EMBED) {
            embeds.push(info({
                title: embedIndex === 0 ? `👑 Status das Primeiras Damas (${validFirstLadies.length})` : `👑 Primeiras Damas (Parte ${embedIndex + 1})`,
                description: embedIndex === 0 ? `Você tem **${validFirstLadies.length}** Primeira(s) Dama(s) atualmente:` : '',
                fields: currentFields,
                ephemeral: true
            }));
            currentFields = [];
            embedIndex++;
        }
        
        currentFields.push(fields[i]);
    }
    
    // Adicionar último embed se houver campos restantes
    if (currentFields.length > 0) {
        embeds.push(info({
            title: embedIndex === 0 ? `👑 Status das Primeiras Damas (${validFirstLadies.length})` : `👑 Primeiras Damas (Parte ${embedIndex + 1})`,
            description: embedIndex === 0 ? `Você tem **${validFirstLadies.length}** Primeira(s) Dama(s) atualmente:` : '',
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

async function handleListFirstLadies(interaction) {
    const guild = interaction.guild;
    
    // Validar cargo de Primeira Dama
    const roleCheck = validateFirstLadyRole(guild);
    if (!roleCheck.valid) {
        return await interaction.reply(roleCheck.error);
    }
    
    const { firstLadyRoleId } = roleCheck;
    
    // Buscar todas as Primeiras Damas do servidor
    const allFirstLadies = db.getAllFirstLadies(guild.id);
    
    if (!allFirstLadies || allFirstLadies.length === 0) {
        return await interaction.reply(info({
            title: 'Lista de Primeiras Damas',
            description: 'Não há Primeiras Damas registradas neste servidor no momento.',
            ephemeral: true
        }));
    }
    
    // Validar e processar todas as Primeiras Damas
    const validFirstLadies = [];
    const invalidFirstLadies = [];
    
    for (const firstLadyData of allFirstLadies) {
        try {
            // Buscar membro que recebeu o cargo (receiver)
            const receiverMember = await guild.members.fetch(firstLadyData.receiverId);
            const hasRole = receiverMember.roles.cache.has(firstLadyRoleId);
            
            if (hasRole) {
                // Buscar membro que deu o cargo (giver)
                let giverMember;
                let giverTag = `ID: ${firstLadyData.giverId}`;
                let giverMention = `\`${firstLadyData.giverId}\``;
                
                try {
                    giverMember = await guild.members.fetch(firstLadyData.giverId);
                    giverTag = giverMember.user.tag;
                    giverMention = `${giverMember.user} (${giverTag})`;
                } catch (err) {
                    // Giver não está mais no servidor, usar apenas ID
                    logger.debug('Doador de Primeira Dama não encontrado no servidor', {
                        giverId: firstLadyData.giverId,
                        guildId: guild.id
                    });
                }
                
                // Processar data
                let assignedDate;
                if (firstLadyData.assignedAt) {
                    const dateStr = String(firstLadyData.assignedAt);
                    if (dateStr.includes(' ') && !dateStr.includes('T') && !dateStr.includes('Z')) {
                        assignedDate = new Date(dateStr.replace(' ', 'T') + 'Z');
                    } else {
                        assignedDate = new Date(dateStr);
                    }
                    
                    if (isNaN(assignedDate.getTime())) {
                        assignedDate = new Date();
                    } else if (assignedDate.getTime() > Date.now()) {
                        assignedDate = new Date(Date.now() - (60 * 60 * 1000));
                    }
                } else {
                    assignedDate = new Date();
                }
                
                validFirstLadies.push({
                    data: firstLadyData,
                    receiver: receiverMember,
                    giver: giverMember,
                    giverTag,
                    giverMention,
                    assignedDate
                });
            } else {
                // Tem no banco mas não tem o cargo - marcar como inválida
                invalidFirstLadies.push(firstLadyData);
            }
        } catch (err) {
            // Receiver não está mais no servidor - marcar como inválida
            invalidFirstLadies.push(firstLadyData);
            logger.debug('Primeira Dama não encontrada ao listar', {
                receiverId: firstLadyData.receiverId,
                guildId: guild.id
            });
        }
    }
    
    // Limpar inválidas do banco (opcional - pode ser feito em background)
    if (invalidFirstLadies.length > 0) {
        logger.info('Limpando Primeiras Damas inválidas do banco', {
            count: invalidFirstLadies.length,
            guildId: guild.id
        });
        // Não limpar automaticamente aqui para não bloquear a resposta
    }
    
    if (validFirstLadies.length === 0) {
        return await interaction.reply(warning({
            title: 'Nenhuma Primeira Dama Válida',
            description: 'Não há Primeiras Damas válidas no servidor no momento. Todas as registradas foram removidas ou não estão mais no servidor.',
            ephemeral: true
        }));
    }
    
    // Ordenar por data de atribuição (mais recente primeiro)
    validFirstLadies.sort((a, b) => b.assignedDate.getTime() - a.assignedDate.getTime());
    
    // Criar campos para o embed
    const MAX_FIELDS_PER_EMBED = 25;
    const fields = validFirstLadies.map((item, index) => {
        const timestamp = Math.floor(item.assignedDate.getTime() / 1000);
        return {
            name: `${index + 1}. ${item.receiver.user.tag}`,
            value: `👤 **Primeira Dama:** ${item.receiver.user}\n` +
                   `🆔 **ID:** \`${item.receiver.user.id}\`\n` +
                   `👑 **Dado por:** ${item.giverMention}\n` +
                   `📅 **Atribuído em:** <t:${timestamp}:F>\n` +
                   `⏱️ **Há:** <t:${timestamp}:R>`,
            inline: false
        };
    });
    
    // Dividir em múltiplos embeds se necessário
    if (fields.length <= MAX_FIELDS_PER_EMBED) {
        const listEmbed = info({
            title: `👑 Lista de Primeiras Damas (${validFirstLadies.length})`,
            description: `Todas as Primeiras Damas registradas no servidor:\n\n**Total:** ${validFirstLadies.length} Primeira(s) Dama(s)`,
            fields: fields,
            ephemeral: false
        });
        
        return await interaction.reply(listEmbed);
    }
    
    // Se houver muitos campos, dividir em múltiplos embeds
    const embeds = [];
    let currentFields = [];
    let embedIndex = 0;
    
    for (let i = 0; i < fields.length; i++) {
        if (currentFields.length >= MAX_FIELDS_PER_EMBED) {
            embeds.push(info({
                title: embedIndex === 0 
                    ? `👑 Lista de Primeiras Damas (${validFirstLadies.length})` 
                    : `👑 Primeiras Damas (Parte ${embedIndex + 1})`,
                description: embedIndex === 0 
                    ? `Todas as Primeiras Damas registradas no servidor:\n\n**Total:** ${validFirstLadies.length} Primeira(s) Dama(s)` 
                    : '',
                fields: currentFields,
                ephemeral: false
            }));
            currentFields = [];
            embedIndex++;
        }
        
        currentFields.push(fields[i]);
    }
    
    // Adicionar último embed se houver campos restantes
    if (currentFields.length > 0) {
        embeds.push(info({
            title: embedIndex === 0 
                ? `👑 Lista de Primeiras Damas (${validFirstLadies.length})` 
                : `👑 Primeiras Damas (Parte ${embedIndex + 1})`,
            description: embedIndex === 0 
                ? `Todas as Primeiras Damas registradas no servidor:\n\n**Total:** ${validFirstLadies.length} Primeira(s) Dama(s)` 
                : '',
            fields: currentFields,
            ephemeral: false
        }));
    }
    
    // Enviar primeiro embed como reply e os demais como followUp
    await interaction.reply(embeds[0]);
    
    // Enviar embeds restantes como followUp
    for (let i = 1; i < embeds.length; i++) {
        await interaction.followUp(embeds[i]);
    }
    
    // Log da ação
    logger.info('Lista de Primeiras Damas visualizada', {
        guildId: guild.id,
        userId: interaction.user.id,
        totalCount: validFirstLadies.length
    });
}

async function handleConfigFirstLady(interaction) {
    const guild = interaction.guild;
    const action = interaction.options.getString('ação');
    
    // Verificar se o usuário tem permissão de administrador
    if (!interaction.member.permissions.has('Administrator')) {
        return await interaction.reply(error({
            title: 'Permissão Negada',
            description: 'Apenas administradores podem configurar o sistema de Primeira Dama.',
            ephemeral: true
        }));
    }
    
    switch (action) {
        case 'limit': {
            const limit = interaction.options.getInteger('limite');
            if (limit === null) {
                return await interaction.reply(error({
                    title: 'Parâmetro Obrigatório',
                    description: 'Você precisa especificar o limite usando o parâmetro `limite`.\n\n**Exemplo:**\n`/pd config ação:limit limite:10`\n\n**Nota:** Use `0` para desabilitar o limite.',
                    ephemeral: true
                }));
            }
            
            const result = db.setFirstLadyLimit(guild.id, limit);
            const currentCount = db.getFirstLadyCount(guild.id);
            
            const description = result.message || `Limite ${limit === 0 ? 'desabilitado' : `definido para ${limit}`}.`;
            
            return await interaction.reply(success({
                title: 'Limite Configurado',
                description: description,
                fields: [
                    { name: '📊 Limite Atual', value: limit === 0 ? 'Desabilitado' : limit.toString(), inline: true },
                    { name: '👥 Primeiras Damas Atuais', value: currentCount.toString(), inline: true },
                    { name: '📝 Nota', value: limit === 0 ? 'Não há limite de Primeiras Damas no servidor.' : `O servidor pode ter no máximo ${limit} Primeira(s) Dama(s).`, inline: false }
                ],
                ephemeral: true
            }));
        }
        
        case 'view': {
            const limit = db.getFirstLadyLimit(guild.id);
            const currentCount = db.getFirstLadyCount(guild.id);
            const giverRoleIds = config.getFirstLadyGiverRoleIds(guild.id);
            
            const roleMentions = giverRoleIds.length > 0
                ? giverRoleIds
                    .map(roleId => {
                        const r = guild.roles.cache.get(roleId);
                        return r ? `${r.toString()} (${r.name})` : `ID: ${roleId} (Não encontrado)`;
                    })
                    .join('\n')
                : 'Nenhum cargo configurado';
            
            return await interaction.reply(info({
                title: '⚙️ Configurações do Sistema de Primeira Dama',
                description: 'Configurações atuais do sistema:',
                fields: [
                    { name: '📊 Limite de Primeiras Damas', value: limit === null || limit === 0 ? 'Desabilitado' : `${limit}`, inline: true },
                    { name: '👥 Primeiras Damas Atuais', value: `${currentCount}${limit !== null && limit > 0 ? `/${limit}` : ''}`, inline: true },
                    { name: '👤 Cargos Doadores', value: `${giverRoleIds.length} cargo(s) configurado(s)`, inline: false },
                    { name: '📝 Lista de Cargos Doadores', value: roleMentions, inline: false },
                    { name: 'ℹ️ Como Configurar Cargos', value: 'Use `/config doador-pd adicionar cargo:@NomeDoCargo` ou `/config cargo tipo:Doador de Primeira Dama cargo:@NomeDoCargo`', inline: false }
                ],
                ephemeral: true
            }));
        }
        
        default:
            return await interaction.reply(error({
                title: 'Ação Inválida',
                description: `A ação "${action}" não é válida.`,
                ephemeral: true
            }));
    }
}
