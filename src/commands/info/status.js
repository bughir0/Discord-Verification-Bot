import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getColors } from '../../utils/configHelper.js';
import os from 'os';

const startTime = Date.now();

export const data = new SlashCommandBuilder()
    .setName('status')
    .setDescription('Mostra o status e informações do bot');

export async function handleStatusCommand(interaction) {
    const colors = getColors();
    const uptime = Date.now() - startTime;
    const uptimeSeconds = Math.floor(uptime / 1000);
    const uptimeMinutes = Math.floor(uptimeSeconds / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);
    const uptimeDays = Math.floor(uptimeHours / 24);

    const uptimeFormatted = `${uptimeDays}d ${uptimeHours % 24}h ${uptimeMinutes % 60}m ${uptimeSeconds % 60}s`;

    // Informações do sistema
    const totalMemory = Math.round(os.totalmem() / 1024 / 1024 / 1024);
    const freeMemory = Math.round(os.freemem() / 1024 / 1024 / 1024);
    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = process.memoryUsage();
    const botMemory = Math.round(memoryUsage.heapUsed / 1024 / 1024);

    // Informações do servidor
    const guild = interaction.guild;
    const memberCount = guild.memberCount;
    const channelCount = guild.channels.cache.size;
    const roleCount = guild.roles.cache.size;

    // Informações do bot
    const botUser = interaction.client.user;
    const guildsCount = interaction.client.guilds.cache.size;
    const usersCount = interaction.client.users.cache.size;

    const cpuLoad = os.loadavg?.()[0]?.toFixed(2) ?? 'N/A';

    const embed = new EmbedBuilder()
        .setColor(colors.success)
        .setTitle('📊 Status do Bot')
        .setThumbnail(botUser.displayAvatarURL({ dynamic: true }))
        .addFields(
            {
                name: '🤖 Informações do Bot',
                value: `**Nome:** ${botUser.tag}\n**ID:** ${botUser.id}\n**Uptime:** ${uptimeFormatted}`,
                inline: true
            },
            {
                name: '💻 Sistema',
                value: `**Memória do Bot:** ${botMemory} MB\n**CPU (1m):** ${cpuLoad}\n**Node.js:** ${process.version}\n**Plataforma:** ${os.platform()}`,
                inline: true
            },
            {
                name: '📈 Estatísticas Globais',
                value: `**Servidores:** ${guildsCount}\n**Usuários:** ${usersCount.toLocaleString()}\n**Canais:** ${interaction.client.channels.cache.size}`,
                inline: true
            },
            {
                name: '🏠 Este Servidor',
                value: `**Membros:** ${memberCount}\n**Canais:** ${channelCount}\n**Cargos:** ${roleCount}`,
                inline: true
            },
            {
                name: '💾 Memória do Sistema',
                value: `**Total:** ${totalMemory} GB\n**Usado:** ${usedMemory} GB\n**Livre:** ${freeMemory} GB`,
                inline: true
            },
            {
                name: '⚡ Status',
                value: `**Status:** 🟢 Online\n**Ping WS:** ${interaction.client.ws.ping}ms\n**Latência Comando:** ${Date.now() - interaction.createdTimestamp}ms`,
                inline: true
            }
        )
        .setFooter({ 
            text: `Solicitado por ${interaction.user.tag}`,
            iconURL: interaction.user.displayAvatarURL()
        })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

