import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { database as db } from '../database/database.js';
import { getColors } from '../utils/configHelper.js';

async function handleClearDatabase(interaction) {
    try {
        // Verificar se o usuário é administrador
        const colors = getColors();
        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            const embed = new EmbedBuilder()
                .setColor(colors.danger)
                .setTitle('❌ Acesso Negado')
                .setDescription('Você não tem permissão para usar este comando!')
                .setFooter({ text: 'Permissão Negada', iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            return interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }

        // Criar botões de confirmação
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm_clear')
                    .setLabel('Confirmar Limpeza')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('⚠️'),
                new ButtonBuilder()
                    .setCustomId('cancel_clear')
                    .setLabel('Cancelar')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('erro:1443149642580758569')
            );

        const embed = new EmbedBuilder()
            .setTitle('⚠️ LIMPAR BANCO DE DADOS')
            .setDescription('Você tem certeza que deseja **limpar todos os dados de verificação**?\n\nEsta ação **não pode ser desfeita** e **todos os registros serão perdidos permanentemente**.')
            .setColor(colors.danger)
            .setFooter({ 
                text: 'Esta ação requer confirmação',
                iconURL: interaction.client.user.displayAvatarURL()
            });

        await interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true
        });

        // Coletor de interação para os botões
        const filter = i => i.customId === 'confirm_clear' || i.customId === 'cancel_clear';
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000, max: 1 });

        collector.on('collect', async i => {
            if (i.customId === 'confirm_clear') {
                // Executar limpeza do banco de dados
                await db.clearDatabase();
                
                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ BANCO DE DADOS LIMPO')
                    .setDescription('Todos os registros de verificação foram removidos com sucesso!')
                    .setColor(colors.success);
                
                await i.update({
                    embeds: [successEmbed],
                    components: []
                });
            } else {
                const cancelEmbed = new EmbedBuilder()
                    .setTitle('❌ OPERAÇÃO CANCELADA')
                    .setDescription('A limpeza do banco de dados foi cancelada.')
                    .setColor(colors.warning);
                
                await i.update({
                    embeds: [cancelEmbed],
                    components: []
                });
            }
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('⏰ TEMPO ESGOTADO')
                    .setDescription('O tempo para confirmar a operação expirou.')
                    .setColor(colors.warning);
                
                interaction.editReply({
                    embeds: [timeoutEmbed],
                    components: []
                }).catch(console.error);
            }
        });

    } catch (error) {
        logger.error('Error in clear-database command', {
            error: error.message,
            stack: error.stack,
            userId: interaction.user?.id,
            guildId: interaction.guild?.id
        });
        const errorEmbed = new EmbedBuilder()
            .setColor(colors.danger)
            .setTitle('❌ Erro')
            .setDescription('Ocorreu um erro ao tentar executar esta operação.')
            .setFooter({ text: 'Erro', iconURL: interaction.guild.iconURL() })
            .setTimestamp();

        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ 
                embeds: [errorEmbed]
            }).catch(console.error);
        } else {
            await interaction.reply({ 
                embeds: [errorEmbed],
                ephemeral: true
            }).catch(console.error);
        }
    }
}

export { handleClearDatabase };
