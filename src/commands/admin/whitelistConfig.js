import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { database as db } from '../../database/database.js';
import { success, error, info } from '../../utils/responseUtils.js';
import logger from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
    .setName('whitelist-config')
    .setDescription('Configura o modo do servidor Minecraft (online/offline)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
        subcommand
            .setName('modo')
            .setDescription('Configura o modo do servidor Minecraft')
            .addStringOption(option =>
                option.setName('tipo')
                    .setDescription('Tipo de servidor')
                    .setRequired(true)
                    .addChoices(
                        { name: '🟢 Online (Original/Mojang)', value: 'online' },
                        { name: '🔴 Offline (Pirata/Crack)', value: 'offline' }
                    )))
    .addSubcommand(subcommand =>
        subcommand
            .setName('status')
            .setDescription('Verifica o modo atual configurado para o servidor'));

export async function handleWhitelistConfigCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    try {
        switch (subcommand) {
            case 'modo':
                return await handleSetMode(interaction, guildId);
            case 'status':
                return await handleGetStatus(interaction, guildId);
            default:
                return await interaction.reply(error({
                    title: 'Subcomando Inválido',
                    description: 'Subcomando não reconhecido.',
                    ephemeral: true
                }));
        }
    } catch (err) {
        logger.error('Erro ao executar comando whitelist-config', {
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

async function handleSetMode(interaction, guildId) {
    const mode = interaction.options.getString('tipo');
    
    try {
        // Salvar configuração no banco de dados
        db.setWhitelistMode(guildId, mode);
        
        logger.info('Modo do servidor Minecraft configurado', {
            guildId: guildId,
            mode: mode,
            userId: interaction.user.id
        });
        
        const modeText = mode === 'online' 
            ? '🟢 **Online (Original/Mojang)**\n\nO bot irá buscar a UUID real do jogador na API do Mojang.'
            : '🔴 **Offline (Pirata/Crack)**\n\nO bot irá calcular a UUID offline baseada no nome do jogador.';
        
        return await interaction.reply(success({
            title: 'Modo do Servidor Configurado!',
            description: `O modo do servidor Minecraft foi configurado para:\n\n${modeText}`,
            ephemeral: true
        }));
    } catch (err) {
        logger.error('Erro ao configurar modo do servidor', {
            error: err.message,
            guildId: guildId,
            mode: mode
        });
        
        return await interaction.reply(error({
            title: 'Erro',
            description: 'Não foi possível configurar o modo do servidor.',
            ephemeral: true
        }));
    }
}

async function handleGetStatus(interaction, guildId) {
    try {
        const mode = db.getWhitelistMode(guildId) || 'offline'; // Padrão: offline
        
        const modeText = mode === 'online'
            ? '🟢 **Online (Original/Mojang)**\n\nO bot busca a UUID real do jogador na API do Mojang.'
            : '🔴 **Offline (Pirata/Crack)**\n\nO bot calcula a UUID offline baseada no nome do jogador.';
        
        const modeDescription = mode === 'online'
            ? 'Servidor autenticado pela Mojang. Jogadores precisam ter conta original do Minecraft.'
            : 'Servidor não autenticado. Jogadores podem usar qualquer nome (modo pirata/crack).';
        
        return await interaction.reply(info({
            title: '📊 Status do Modo do Servidor',
            description: `**Modo Atual:**\n${modeText}\n\n**Descrição:**\n${modeDescription}\n\nUse \`/whitelist-config modo\` para alterar.`,
            ephemeral: true
        }));
    } catch (err) {
        logger.error('Erro ao verificar status do modo', {
            error: err.message,
            guildId: guildId
        });
        
        return await interaction.reply(error({
            title: 'Erro',
            description: 'Não foi possível verificar o status do modo do servidor.',
            ephemeral: true
        }));
    }
}

