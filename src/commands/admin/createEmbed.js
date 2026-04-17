import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { database as db } from '../../database/database.js';
import { buildEmbedMessageV2 } from '../../utils/embedBuilderV2.js';
import { getBaseRows, stripHintContent, ensureEmbedContent } from '../../handlers/embedBuilder.js';

export const data = new SlashCommandBuilder()
    .setName('criar')
    .setDescription('Crie embeds facilmente usando botões')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
        subcommand
            .setName('embed')
            .setDescription('Inicia o construtor de embed'));

export async function handleCreateEmbedCommand(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
            content: '❌ Apenas membros com permissão de **Gerenciar Servidor** podem usar este comando.',
            ephemeral: true
        });
    }

    const baseEmbed = new EmbedBuilder()
        .setTitle('🧱 Exemplo de Embed')
        .setDescription('Este é um **exemplo de embed**.\n\nUse os botões abaixo para editar título, descrição, cor, imagem, footer e adicionar fields.')
        .addFields(
            {
                name: '📝 Como usar',
                value: '• Clique em **Editar Título** para mudar o título\n• Clique em **Editar Descrição** para mudar este texto\n• Use **Adicionar Field** para criar campos personalizados',
                inline: false
            },
            {
                name: '💡 Dica',
                value: 'Depois de finalizar, use **Enviar Embed** para escolher o canal onde ela será enviada.',
                inline: false
            }
        );

    const working = stripHintContent(EmbedBuilder.from(baseEmbed));
    ensureEmbedContent(working);

    const payload = buildEmbedMessageV2(working.toJSON(), {
        ephemeral: true,
        instructionLines: ['Utilize os botões abaixo para editar a embed.'],
        actionRows: getBaseRows()
    });

    const reply = await interaction.reply({
        ...payload,
        fetchReply: true
    });

    db.upsertEmbedBuilderSession(
        reply.id,
        interaction.guild.id,
        interaction.user.id,
        working.toJSON()
    );
}
