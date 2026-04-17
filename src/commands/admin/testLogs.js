import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getChannelId } from '../../utils/configHelper.js';
import { success, error, info } from '../../utils/responseUtils.js';
import logger from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
    .setName('testar-logs')
    .setDescription('Testa se os canais de log estão funcionando corretamente')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false);

export async function handleTestLogsCommand(interaction) {
    // Deferir imediatamente para evitar timeout
    await interaction.deferReply({ ephemeral: true });
    
    const guild = interaction.guild;
    const botMember = guild.members.me;
    
    if (!botMember) {
        return await interaction.editReply(error({
            title: 'Erro',
            description: 'Não foi possível encontrar o bot no servidor.',
            ephemeral: true
        }));
    }

    const logChannels = [
        { key: 'log', name: 'Logs Gerais' },
        { key: 'modLogs', name: 'Logs de Moderação' },
        { key: 'logFicha', name: 'Log Ficha' },
        { key: 'logCall', name: 'Logs de Call' },
        { key: 'logRole', name: 'Logs de Cargo' },
        { key: 'memberLogs', name: 'Logs de Membros' },
        { key: 'notification', name: 'Notificações de Verificação' },
        { key: 'verification', name: 'Verificação' },
    ];

    const results = [];

    for (const channelInfo of logChannels) {
        const channelId = getChannelId(guild.id, channelInfo.key);
        const channel = channelId ? guild.channels.cache.get(channelId) : null;
        
        if (!channelId) {
            results.push({
                name: channelInfo.name,
                status: '❌ Não Configurado',
                details: 'Use `/config canal tipo:' + channelInfo.key + ' canal:<canal>`'
            });
            continue;
        }

        if (!channel) {
            results.push({
                name: channelInfo.name,
                status: '❌ Canal Não Encontrado',
                details: `ID: ${channelId} (Canal foi deletado?)`
            });
            continue;
        }

        // Verificar permissões
        const permissions = channel.permissionsFor(botMember);
        const canSend = permissions?.has(['SendMessages']);
        const canEmbed = permissions?.has(['EmbedLinks']);
        const canView = permissions?.has(['ViewChannel']);

        if (!canView) {
            results.push({
                name: channelInfo.name,
                status: '❌ Sem Acesso',
                details: `Bot não pode ver o canal ${channel}`
            });
            continue;
        }

        if (!canSend) {
            results.push({
                name: channelInfo.name,
                status: '❌ Sem Permissão',
                details: `Bot não pode enviar mensagens em ${channel}`
            });
            continue;
        }

        if (!canEmbed) {
            results.push({
                name: channelInfo.name,
                status: '⚠️ Sem Embed',
                details: `Bot não pode enviar embeds em ${channel}`
            });
            continue;
        }

        // Tentar enviar uma mensagem de teste
        try {
            const testEmbed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('<a:sucesso:1443149628085244036> Teste de Log')
                .setDescription(`Este é um teste do sistema de logs.\n**Canal:** ${channelInfo.name}\n**Status:** Funcionando corretamente!`)
                .setFooter({ text: 'Teste realizado por ' + interaction.user.tag })
                .setTimestamp();

            await channel.send({ embeds: [testEmbed] });
            
            results.push({
                name: channelInfo.name,
                status: '<a:sucesso:1443149628085244036> Funcionando',
                details: `Log enviado com sucesso em ${channel}`
            });

            logger.info('Teste de log bem-sucedido', {
                guildId: guild.id,
                channelId: channel.id,
                channelType: channelInfo.key
            });
        } catch (testError) {
            results.push({
                name: channelInfo.name,
                status: '❌ Erro ao Enviar',
                details: `Erro: ${testError.message}`
            });

            logger.error('Erro ao testar log', {
                error: testError.message,
                guildId: guild.id,
                channelId: channel.id,
                channelType: channelInfo.key
            });
        }
    }

    // Criar embed de resultados
    const fields = results.map(r => {
        const value = `**Status:** ${r.status}\n${r.details}`;
        // Garantir que o valor não exceda 1024 caracteres
        const truncatedValue = value.length > 1024 ? value.slice(0, 1021) + '...' : value;
        return {
            name: r.name || '\u200b',
            value: truncatedValue,
            inline: false
        };
    });

    const successCount = results.filter(r => r.status === '<a:sucesso:1443149628085244036> Funcionando').length;
    const totalCount = logChannels.length;

    // Se houver muitos campos, dividir em múltiplos embeds
    const MAX_FIELDS_PER_EMBED = 25;
    
    if (fields.length <= MAX_FIELDS_PER_EMBED) {
        const resultEmbed = info({
            title: '📊 Resultado dos Testes de Log',
            description: `**${successCount}/${totalCount}** canais de log funcionando corretamente.`,
            fields: fields,
            ephemeral: true
        });
        await interaction.editReply(resultEmbed);
    } else {
        // Dividir em múltiplos embeds
        const embeds = [];
        for (let i = 0; i < fields.length; i += MAX_FIELDS_PER_EMBED) {
            const chunk = fields.slice(i, i + MAX_FIELDS_PER_EMBED);
            const isFirst = i === 0;
            embeds.push(info({
                title: isFirst ? '📊 Resultado dos Testes de Log' : `📊 Resultado dos Testes de Log (Parte ${Math.floor(i / MAX_FIELDS_PER_EMBED) + 1})`,
                description: isFirst ? `**${successCount}/${totalCount}** canais de log funcionando corretamente.` : '\u200b',
                fields: chunk,
                ephemeral: true
            }));
        }
        
        await interaction.editReply(embeds[0]);
        for (let i = 1; i < embeds.length; i++) {
            await interaction.followUp(embeds[i]);
        }
    }
}

