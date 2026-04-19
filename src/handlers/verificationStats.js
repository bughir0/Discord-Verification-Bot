import { EmbedBuilder } from 'discord.js';
import { database as db } from '../database/database.js';
import { toEmbedReply } from '../utils/embedBuilderV2.js';
import { getColors } from '../utils/configHelper.js';

async function handleVerificationStats(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });
        
        // Obter estatísticas do banco de dados
        const stats = await db.getVerificationStats();
        const total = (stats.approved || 0) + (stats.denied || 0) + (stats.pending || 0);
        const approvedPercentage = total > 0 ? Math.round((stats.approved / total) * 100) : 0;
        const deniedPercentage = total > 0 ? Math.round((stats.denied / total) * 100) : 0;
        const pendingPercentage = total > 0 ? Math.round((stats.pending / total) * 100) : 0;
        
        // Função para criar barra de progresso
        const progressBar = (percentage, length = 10) => {
            const filled = '█'.repeat(Math.round(percentage / 10));
            const empty = '░'.repeat(10 - Math.round(percentage / 10));
            return `[${filled}${empty}] ${percentage}%`;
        };
        
        // Criar embed de estatísticas
        const colors = getColors();
        const embed = new EmbedBuilder()
            .setTitle('📊 ESTATÍSTICAS DE VERIFICAÇÃO')
            .setColor(colors.primary)
            .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
            .setDescription(`Aqui estão as estatísticas de verificação do servidor **${interaction.guild.name}**`)
            .addFields(
                { 
                    name: '✅ Verificações Aprovadas', 
                    value: `**${stats.approved || 0}** verificações\n${progressBar(approvedPercentage)}`,
                    inline: true 
                },
                { 
                    name: '❌ Verificações Recusadas', 
                    value: `**${stats.denied || 0}** verificações\n${progressBar(deniedPercentage)}`,
                    inline: true 
                },
                { 
                    name: '⏳ Pendentes', 
                    value: `**${stats.pending || 0}** verificações\n${progressBar(pendingPercentage)}`,
                    inline: true 
                },
                { 
                    name: '📊 Total de Verificações', 
                    value: `**${total}** verificações no total`,
                    inline: false 
                }
            )
            .setFooter({ 
                text: `Solicitado por ${interaction.user.tag}`, 
                iconURL: interaction.user.displayAvatarURL({ dynamic: true }) 
            })
            .setTimestamp();
        
        await interaction.editReply(toEmbedReply(embed, true));
        
    } catch (error) {
        console.error('Error in verification stats:', error);
        const colors = getColors();
        const errorEmbed = new EmbedBuilder()
            .setColor(colors.danger)
            .setTitle('❌ Erro')
            .setDescription('Ocorreu um erro ao buscar as estatísticas de verificação.')
            .setFooter({ 
                text: 'Erro', 
                iconURL: interaction.guild.iconURL() 
            })
            .setTimestamp();
            
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply(toEmbedReply(errorEmbed, true)).catch(console.error);
        } else if (interaction.deferred) {
            await interaction.editReply(toEmbedReply(errorEmbed, true)).catch(console.error);
        }
    }
}

export { handleVerificationStats };
