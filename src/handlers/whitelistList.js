import { EmbedBuilder } from 'discord.js';
import { mergeV2WithRows, toV2FromEmbedBuilder } from '../utils/embedBuilderV2.js';

import { database as db } from '../database/database.js';
import { getColors } from '../utils/configHelper.js';
import logger from '../utils/logger.js';

async function handleWhitelistList(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });
        
        // Obter todas as whitelists aprovadas
        const approvedWhitelists = db.getApprovedWhitelists();
        
        if (!approvedWhitelists || approvedWhitelists.length === 0) {
            const colors = getColors();
            const embed = new EmbedBuilder()
                .setColor(colors.warning || 0xf39c12)
                .setTitle('📋 Lista de Whitelist')
                .setDescription('Não há whitelists aprovadas no momento.')
                .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
                .setFooter({ 
                    text: `Solicitado por ${interaction.user.tag}`, 
                    iconURL: interaction.user.displayAvatarURL({ dynamic: true }) 
                })
                .setTimestamp();
            
            return await interaction.editReply(toV2FromEmbedBuilder(embed, true));
        }
        
        const colors = getColors();
        
        // Tentar buscar informações dos membros
        const whitelistData = [];
        for (const whitelist of approvedWhitelists) {
            try {
                const member = await interaction.guild.members.fetch(whitelist.userId).catch(() => null);
                const username = member?.user?.tag || `Usuário Desconhecido (${whitelist.userId})`;
                const minecraftUsername = whitelist.minecraftUsername || 'Não informado';
                const platform = whitelist.platform || 'java';
                const approvedDate = whitelist.updatedAt 
                    ? new Date(whitelist.updatedAt).toLocaleDateString('pt-BR')
                    : 'Desconhecido';
                
                whitelistData.push({
                    username,
                    minecraftUsername,
                    platform,
                    approvedDate,
                    userId: whitelist.userId
                });
            } catch (error) {
                logger.warning('Erro ao buscar membro para lista de whitelist', {
                    userId: whitelist.userId,
                    error: error.message
                });
                whitelistData.push({
                    username: `Usuário Desconhecido (${whitelist.userId})`,
                    minecraftUsername: whitelist.minecraftUsername || 'Não informado',
                    platform: whitelist.platform || 'java',
                    approvedDate: whitelist.updatedAt 
                        ? new Date(whitelist.updatedAt).toLocaleDateString('pt-BR')
                        : 'Desconhecido',
                    userId: whitelist.userId
                });
            }
        }
        
        // Dividir em páginas se houver muitas whitelists (máximo de 25 por embed devido ao limite do Discord)
        const itemsPerPage = 20;
        const totalPages = Math.ceil(whitelistData.length / itemsPerPage);
        const page = 1; // Por enquanto, sempre mostra a primeira página
        
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const pageData = whitelistData.slice(startIndex, endIndex);
        
        // Criar lista formatada
        let listText = '';
        pageData.forEach((item, index) => {
            const number = startIndex + index + 1;
            const platformIcon = item.platform === 'bedrock' ? '🔷' : '☕';
            const platformName = item.platform === 'bedrock' ? 'Bedrock' : 'Java';
            listText += `**${number}.** ${item.username}\n`;
            listText += `   🎮 Minecraft: \`${item.minecraftUsername}\` ${platformIcon} ${platformName}\n`;
            listText += `   ✅ Aprovado em: ${item.approvedDate}\n\n`;
        });
        
        // Criar embed
        const embed = new EmbedBuilder()
            .setColor(colors.success || 0x2ecc71)
            .setTitle('📋 Lista de Whitelist Aprovadas')
            .setDescription(`Total de **${approvedWhitelists.length}** whitelist(s) aprovada(s)`)
            .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
            .addFields({
                name: `🎮 Whitelists Aprovadas ${totalPages > 1 ? `(Página ${page}/${totalPages})` : ''}`,
                value: listText || 'Nenhuma whitelist encontrada.',
                inline: false
            })
            .setFooter({ 
                text: `Total: ${approvedWhitelists.length} whitelist(s) • Solicitado por ${interaction.user.tag}`, 
                iconURL: interaction.user.displayAvatarURL({ dynamic: true }) 
            })
            .setTimestamp();
        
        await interaction.editReply(toV2FromEmbedBuilder(embed, true));
        
    } catch (error) {
        logger.error('Erro ao buscar lista de whitelist', {
            error: error.message,
            stack: error.stack,
            userId: interaction.user.id
        });
        
        const colors = getColors();
        const errorEmbed = new EmbedBuilder()
            .setColor(colors.danger || 0xe74c3c)
            .setTitle('❌ Erro')
            .setDescription('Ocorreu um erro ao buscar a lista de whitelist.')
            .setFooter({ 
                text: 'Erro', 
                iconURL: interaction.guild?.iconURL() 
            })
            .setTimestamp();
            
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply(toV2FromEmbedBuilder(errorEmbed, true)).catch(console.error);
        } else if (interaction.deferred) {
            await interaction.editReply(toV2FromEmbedBuilder(errorEmbed, true)).catch(console.error);
        }
    }
}

export { handleWhitelistList };

