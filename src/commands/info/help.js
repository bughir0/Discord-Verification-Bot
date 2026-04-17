import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getColors } from '../../utils/configHelper.js';

export const data = new SlashCommandBuilder()
    .setName('help')
    .setDescription('Mostra informações sobre os comandos do bot')
    .addStringOption(option =>
        option.setName('comando')
            .setDescription('Comando específico para ver ajuda detalhada')
            .setRequired(false)
            .addChoices(
                { name: 'Config', value: 'config' },
                { name: 'Verificação', value: 'verification' },
                { name: 'Ban', value: 'ban' },
                { name: 'Kick', value: 'kick' },
                { name: 'Unban', value: 'unban' },
                { name: 'Primeira Dama', value: 'pd' }
            ));

export async function handleHelpCommand(interaction) {
    const command = interaction.options.getString('comando');
    const colors = getColors();

    if (command) {
        return await showCommandHelp(interaction, command, colors);
    }

    const embed = new EmbedBuilder()
        .setColor(colors.primary)
        .setTitle('📚 Central de Ajuda')
        .setDescription('Aqui estão todos os comandos disponíveis do bot:')
        .addFields(
            {
                name: '⚙️ Configuração',
                value: '`/config canal` - Configura canais\n`/config cargo` - Configura cargos únicos (Verificado, Primeira Dama)\n`/config staff` - Gerencia múltiplos cargos staff\n`/config doador-pd` - Gerencia múltiplos cargos de doador\n`/config ver` - Visualiza todas as configurações',
                inline: false
            },
            {
                name: '🔒 Verificação',
                value: '`/setup-verification` - Configura mensagem de verificação\n`/verification-stats` - Estatísticas de verificação\n`/clear-database` - Limpa dados de verificação',
                inline: false
            },
            {
                name: '🛡️ Moderação',
                value: '`/ban` - Bane um membro\n`/kick` - Expulsa um membro\n`/unban` - Remove banimento',
                inline: false
            },
            {
                name: '👑 Primeira Dama',
                value: '`/pd dar` - Dá cargo de Primeira Dama\n`/pd remover` - Remove cargo\n`/pd status` - Ver status',
                inline: false
            },
            {
                name: 'ℹ️ Informações',
                value: '`/help` - Mostra esta mensagem\n`/help <comando>` - Ajuda específica',
                inline: false
            }
        )
        .setFooter({ 
            text: 'Use /help <comando> para ajuda detalhada sobre um comando específico',
            iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function showCommandHelp(interaction, command, colors) {
    const helpData = {
        'config': {
            title: '⚙️ Comando: /config',
            description: 'Gerencia as configurações do servidor',
            fields: [
                { name: '📺 Configurar Canais', value: '`/config canal tipo:<tipo> canal:<canal>`\nTipos: Verificação, Notificações, Logs, etc.', inline: false },
                { name: '👤 Configurar Cargos Únicos', value: '`/config cargo tipo:<tipo> cargo:<cargo>`\nTipos: Verificado, Primeira Dama', inline: false },
                { name: '👥 Gerenciar Cargos Staff (Múltiplos)', value: '`/config staff adicionar cargo:<cargo>`\n`/config staff remover cargo:<cargo>`\n`/config staff listar`', inline: false },
                { name: '👑 Gerenciar Doadores de PD (Múltiplos)', value: '`/config doador-pd adicionar cargo:<cargo>`\n`/config doador-pd remover cargo:<cargo>`\n`/config doador-pd listar`', inline: false },
                { name: '📋 Ver Configurações', value: '`/config ver` - Mostra todas as configurações', inline: false },
                { name: '🗑️ Remover Configuração', value: '`/config remover tipo:<tipo>`', inline: false },
                { name: '⚠️ Limpar Tudo', value: '`/config limpar` - Remove TODAS as configurações', inline: false },
                { name: 'Permissões', value: 'Apenas administradores', inline: false },
                { name: '💡 Dica', value: 'Use `/config staff` ou `/config doador-pd` para adicionar múltiplos cargos. Use `/config cargo` apenas para cargos únicos.', inline: false }
            ]
        },
        'verification': {
            title: '🔒 Sistema de Verificação',
            description: 'Sistema completo de verificação de membros',
            fields: [
                { name: 'Setup', value: '`/setup-verification` - Configura mensagem no canal atual', inline: false },
                { name: 'Estatísticas', value: '`/verification-stats` - Mostra estatísticas', inline: false },
                { name: 'Limpar Dados', value: '`/clear-database` - Remove todos os dados (ADMIN)', inline: false },
                { name: 'Como Funciona', value: '1. Configure com `/setup-verification`\n2. Membros clicam em "Iniciar Verificação"\n3. Staff aprova/recusa no canal de notificações (se configurado)', inline: false }
            ]
        },
        'ban': {
            title: '🛡️ Comando: /ban',
            description: 'Bane um membro do servidor',
            fields: [
                { name: 'Uso', value: '`/ban usuário:<usuário> motivo:<motivo> [dias:<0-7>]`', inline: false },
                { name: 'Parâmetros', value: '**usuário**: Membro a banir\n**motivo**: Motivo do banimento\n**dias**: Dias de mensagens para apagar (0-7)', inline: false },
                { name: 'Permissões', value: 'Requer permissão `BanMembers`', inline: false },
                { name: 'Notas', value: 'O usuário receberá uma DM antes de ser banido', inline: false }
            ]
        },
        'kick': {
            title: '🛡️ Comando: /kick',
            description: 'Expulsa um membro do servidor',
            fields: [
                { name: 'Uso', value: '`/kick usuário:<usuário> motivo:<motivo>`', inline: false },
                { name: 'Parâmetros', value: '**usuário**: Membro a expulsar\n**motivo**: Motivo da expulsão', inline: false },
                { name: 'Permissões', value: 'Requer permissão `KickMembers`', inline: false }
            ]
        },
        'unban': {
            title: '🛡️ Comando: /unban',
            description: 'Remove banimento de um usuário',
            fields: [
                { name: 'Uso', value: '`/unban usuário:<id_ou_tag>`', inline: false },
                { name: 'Parâmetros', value: '**usuário**: ID ou tag do usuário banido', inline: false },
                { name: 'Permissões', value: 'Requer permissão `BanMembers`', inline: false }
            ]
        },
        'pd': {
            title: '👑 Sistema de Primeira Dama',
            description: 'Gerencia o cargo de Primeira Dama',
            fields: [
                { name: 'Dar Cargo', value: '`/pd dar usuário:<usuário>`', inline: false },
                { name: 'Remover Cargo', value: '`/pd remover`', inline: false },
                { name: 'Ver Status', value: '`/pd status`', inline: false },
                { name: 'Limitações', value: '• Apenas 1 Primeira Dama por usuário\n• Não pode dar para bots\n• Requer cargo de doador', inline: false }
            ]
        }
    };

    const help = helpData[command];
    if (!help) {
        return await interaction.reply({
            content: '❌ Comando não encontrado. Use `/help` para ver todos os comandos.',
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setColor(colors.primary)
        .setTitle(help.title)
        .setDescription(help.description)
        .addFields(help.fields)
        .setFooter({ 
            text: `Solicitado por ${interaction.user.tag}`,
            iconURL: interaction.user.displayAvatarURL()
        })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

