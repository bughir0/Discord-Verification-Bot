import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelSelectMenuBuilder,
    ChannelType,
    EmbedBuilder,
    ModalBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import { database as db } from '../database/database.js';
import logger from '../utils/logger.js';

const DEFAULT_INSTRUCTION = 'Utilize os botões abaixo para editar a embed.';

/**
 * Mensagem do construtor de embed: texto de instrução + embed + componentes (ephemeral).
 */
function buildEmbedConstructorPayload(embedBuilder, { instructionLines = [DEFAULT_INSTRUCTION], actionRows = [], ephemeral = true } = {}) {
    const content = instructionLines.filter(Boolean).join('\n\n');
    return {
        content: content || DEFAULT_INSTRUCTION,
        embeds: [embedBuilder],
        components: actionRows,
        ephemeral
    };
}

/** Remove título/descrição/campos de dica do embed de exemplo */
export function stripHintContent(embed) {
    const data = embed.data || {};

    if (data.title === '🧱 Exemplo de Embed') {
        embed.data.title = undefined;
    }

    if (typeof data.description === 'string' &&
        data.description.includes('Este é um **exemplo de embed**')) {
        embed.data.description = undefined;
    }

    if (Array.isArray(data.fields) && data.fields.length) {
        embed.data.fields = data.fields.filter(
            f => f.name !== '📝 Como usar' && f.name !== '💡 Dica'
        );
    }

    return embed;
}

export function ensureEmbedContent(embed) {
    if (!embed?.data) {
        return embed;
    }
    const hasDescription = typeof embed.data.description === 'string' && embed.data.description.trim().length > 0;
    if (!hasDescription) {
        embed.setDescription('\u200b');
    }
    return embed;
}

function persistSession(interaction, embed) {
    ensureEmbedContent(embed);
    const cleaned = stripHintContent(embed);
    db.upsertEmbedBuilderSession(
        interaction.message.id,
        interaction.guild.id,
        interaction.user.id,
        cleaned.toJSON()
    );
    return cleaned;
}

/**
 * @returns {EmbedBuilder|null}
 */
export function loadSessionEmbed(interaction) {
    const row = db.getEmbedBuilderSession(interaction.message?.id);
    if (!row || row.userId !== interaction.user.id || row.guildId !== interaction.guild?.id) {
        return null;
    }
    return stripHintContent(EmbedBuilder.from(row.embedData));
}

export function getBaseRows(forApply = false, messageId = null, canDelete = false, deleteKey = null) {
    const applyId = forApply && messageId ? `embedApplyEdit;${messageId}` : 'embedSend';
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('embedEditTitle').setLabel('📝 Título').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('embedEditAuthor').setLabel('👤 Autor').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('embedEditThumbnail').setLabel('🖼️ Thumbnail').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('embedEditDescription').setLabel('📄 Descrição').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('embedEditColor').setLabel('🎨 Cor').setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('embedEditImage').setLabel('🖼️ Imagem').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('embedEditFooter').setLabel('📌 Footer').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('embedSetTimestamp').setLabel('⏱️ Timestamp').setStyle(ButtonStyle.Primary)
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('embedAddField').setLabel('➕ Adicionar Field').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('embedEditField').setLabel('✏️ Editar Field').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('embedRemoveField').setLabel('🗑️ Remover Field').setStyle(ButtonStyle.Danger)
    );

    const deleteButton = new ButtonBuilder()
        .setCustomId(deleteKey ? `embedDelete;${deleteKey}` : 'embedDelete')
        .setLabel('🗑️ Deletar Embed')
        .setStyle(ButtonStyle.Danger);

    if (!canDelete) {
        deleteButton.setDisabled(true);
    }

    const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(applyId).setLabel(forApply ? 'Aplicar Edição' : '📤 Enviar Embed').setStyle(ButtonStyle.Success).setEmoji('sucesso:1443149628085244036'),
        new ButtonBuilder().setCustomId('embedSendWebhook').setLabel('📨 Enviar via Webhook').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('embedSave').setLabel('💾 Salvar Embed').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('embedLoad').setLabel('📂 Carregar Embed').setStyle(ButtonStyle.Primary),
        deleteButton
    );

    return [row1, row2, row3, row4];
}

function updateInteractionEmbed(interaction, embed, extra = {}) {
    const cleaned = persistSession(interaction, embed);
    const {
        instructionLines = [DEFAULT_INSTRUCTION],
        components = getBaseRows(),
        ...rest
    } = extra;
    const payload = buildEmbedConstructorPayload(cleaned, {
        instructionLines,
        actionRows: components,
        ephemeral: true
    });
    return interaction.update({ ...payload, ...rest });
}

function editInteractionEmbed(interaction, embed, extra = {}) {
    const cleaned = persistSession(interaction, embed);
    const {
        instructionLines = [DEFAULT_INSTRUCTION],
        components = getBaseRows(),
        ...rest
    } = extra;
    const payload = buildEmbedConstructorPayload(cleaned, {
        instructionLines,
        actionRows: components,
        ephemeral: true
    });
    return interaction.editReply({ ...payload, ...rest });
}

const embedInteractionRate = new Map();
const EMBED_INTERACTION_COOLDOWN_MS = 300;

export async function handleEmbedButton(interaction) {
    const { customId } = interaction;

    const now = Date.now();
    const last = embedInteractionRate.get(interaction.user.id) || 0;
    if (now - last < EMBED_INTERACTION_COOLDOWN_MS) {
        try {
            return await interaction.reply({
                content: '⏱️ Você está clicando muito rápido, aguarde um instante.',
                ephemeral: true
            });
        } catch (e) {
            logger.debug?.('Erro ao responder rate limit do embed builder', {
                error: e.message
            });
            return;
        }
    }
    embedInteractionRate.set(interaction.user.id, now);

    const noEmbedNeeded = ['embedSend', 'embedLoad', 'embedSave'];
    if (!noEmbedNeeded.includes(customId)) {
        const sessionEmbed = loadSessionEmbed(interaction);
        if (!sessionEmbed) {
            return interaction.reply({
                content: '❌ Construtor de embed não encontrado ou sessão inválida. Use `/criar embed` novamente.',
                ephemeral: true
            });
        }
    }

    switch (customId) {
        case 'embedEditTitle': {
            const embed = loadSessionEmbed(interaction);
            if (!embed) {
                return interaction.reply({
                    content: '❌ Sessão inválida.',
                    ephemeral: true
                });
            }
            const input = new TextInputBuilder()
                .setCustomId('title')
                .setLabel('Digite o novo título')
                .setMaxLength(256)
                .setRequired(false)
                .setPlaceholder('Deixe em branco para remover')
                .setStyle(TextInputStyle.Short);
            if (embed.data.title) {
                input.setValue(embed.data.title);
            }
            const modal = new ModalBuilder()
                .setCustomId('embedEditTitle')
                .setTitle('Editar Título')
                .addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }
        case 'embedEditAuthor': {
            const embed = loadSessionEmbed(interaction);
            if (!embed) {
                return interaction.reply({
                    content: '❌ Nenhuma embed encontrada para definir o autor.',
                    ephemeral: true
                });
            }

            const newName = interaction.user.tag;
            const newIcon = interaction.user.displayAvatarURL({ dynamic: true }) || undefined;
            const currentAuthor = embed.data.author || {};

            if (currentAuthor.name === newName) {
                embed.data.author = undefined;
            } else {
                embed.setAuthor({
                    name: newName,
                    iconURL: newIcon
                });
            }

            return updateInteractionEmbed(interaction, embed);
        }
        case 'embedEditThumbnail': {
            const embed = loadSessionEmbed(interaction);
            if (!embed) {
                return interaction.reply({ content: '❌ Sessão inválida.', ephemeral: true });
            }
            const input = new TextInputBuilder()
                .setCustomId('url')
                .setLabel('URL do thumbnail')
                .setRequired(false)
                .setPlaceholder('Deixe em branco para remover')
                .setStyle(TextInputStyle.Short);
            if (embed.data.thumbnail?.url) {
                input.setValue(embed.data.thumbnail.url);
            }
            const modal = new ModalBuilder()
                .setCustomId('embedEditThumbnail')
                .setTitle('Editar Thumbnail')
                .addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }
        case 'embedEditDescription': {
            const embed = loadSessionEmbed(interaction);
            if (!embed) {
                return interaction.reply({ content: '❌ Sessão inválida.', ephemeral: true });
            }
            const input = new TextInputBuilder()
                .setCustomId('description')
                .setLabel('Digite a nova descrição')
                .setMinLength(1)
                .setMaxLength(4000)
                .setRequired(false)
                .setPlaceholder('Deixe em branco para remover')
                .setStyle(TextInputStyle.Paragraph);
            if (embed.data.description) {
                input.setValue(embed.data.description);
            }
            const modal = new ModalBuilder()
                .setCustomId('embedEditDescription')
                .setTitle('Editar Descrição')
                .addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }
        case 'embedEditColor': {
            const embed = loadSessionEmbed(interaction);
            if (!embed) {
                return interaction.reply({ content: '❌ Sessão inválida.', ephemeral: true });
            }
            const input = new TextInputBuilder()
                .setCustomId('color')
                .setLabel('Digite a nova cor em hexadecimal')
                .setPlaceholder('Exemplo: #2f3136 | Deixe em branco para remover')
                .setMaxLength(7)
                .setRequired(false)
                .setStyle(TextInputStyle.Short);
            if (embed.data.color) {
                input.setValue(embed.data.color.toString(16));
            }
            const modal = new ModalBuilder()
                .setCustomId('embedEditColor')
                .setTitle('Editar Cor')
                .addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }
        case 'embedEditImage': {
            const embed = loadSessionEmbed(interaction);
            if (!embed) {
                return interaction.reply({ content: '❌ Sessão inválida.', ephemeral: true });
            }
            const input = new TextInputBuilder()
                .setCustomId('url')
                .setLabel('Digite a URL da imagem')
                .setRequired(false)
                .setPlaceholder('Deixe em branco para remover')
                .setStyle(TextInputStyle.Short);
            if (embed.data.image?.url) {
                input.setValue(embed.data.image.url);
            }
            const modal = new ModalBuilder()
                .setCustomId('embedEditImage')
                .setTitle('Editar Imagem')
                .addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }
        case 'embedEditFooter': {
            const embed = loadSessionEmbed(interaction);
            if (!embed) {
                return interaction.reply({ content: '❌ Sessão inválida.', ephemeral: true });
            }
            const textInput = new TextInputBuilder()
                .setCustomId('text')
                .setLabel('Texto do footer')
                .setMaxLength(256)
                .setRequired(false)
                .setPlaceholder('Deixe em branco para remover')
                .setStyle(TextInputStyle.Short);
            const iconInput = new TextInputBuilder()
                .setCustomId('icon')
                .setLabel('URL do ícone')
                .setMaxLength(256)
                .setRequired(false)
                .setPlaceholder('Deixe em branco para remover')
                .setStyle(TextInputStyle.Short);
            if (embed.data.footer?.text) {
                textInput.setValue(embed.data.footer.text);
            }
            if (embed.data.footer?.icon_url) {
                iconInput.setValue(embed.data.footer.icon_url);
            }
            const modal = new ModalBuilder()
                .setCustomId('embedEditFooter')
                .setTitle('Editar Footer')
                .addComponents(
                    new ActionRowBuilder().addComponents(textInput),
                    new ActionRowBuilder().addComponents(iconInput)
                );
            return interaction.showModal(modal);
        }
        case 'embedAddField': {
            const embed = loadSessionEmbed(interaction);
            if (!embed) {
                return interaction.reply({ content: '❌ Sessão inválida.', ephemeral: true });
            }
            const fields = embed.data.fields || [];
            if (fields.length >= 25) {
                return interaction.reply({
                    content: 'O máximo de fields (25) já foi atingido.',
                    ephemeral: true
                });
            }
            const nameInput = new TextInputBuilder()
                .setCustomId('name')
                .setLabel('Nome do field')
                .setMinLength(1)
                .setMaxLength(256)
                .setRequired(true)
                .setStyle(TextInputStyle.Short);
            const valueInput = new TextInputBuilder()
                .setCustomId('value')
                .setLabel('Texto do field')
                .setMinLength(1)
                .setMaxLength(1024)
                .setRequired(true)
                .setStyle(TextInputStyle.Paragraph);
            const inlineInput = new TextInputBuilder()
                .setCustomId('inline')
                .setLabel('Field alinhado? (0 = não, 1 = sim)')
                .setMinLength(1)
                .setMaxLength(1)
                .setRequired(true)
                .setStyle(TextInputStyle.Short);
            const modal = new ModalBuilder()
                .setCustomId('embedAddField')
                .setTitle('Adicionar Field')
                .addComponents(
                    new ActionRowBuilder().addComponents(nameInput),
                    new ActionRowBuilder().addComponents(valueInput),
                    new ActionRowBuilder().addComponents(inlineInput)
                );
            return interaction.showModal(modal);
        }
        case 'embedRemoveField': {
            const embed = loadSessionEmbed(interaction);
            if (!embed) {
                return interaction.reply({ content: '❌ Sessão inválida.', ephemeral: true });
            }
            const fields = embed.data.fields || [];
            if (!fields.length) {
                return interaction.reply({
                    content: 'Nenhum field adicionado na embed.',
                    ephemeral: true
                });
            }
            const select = new StringSelectMenuBuilder()
                .setCustomId('embedRemoveField')
                .setMaxValues(fields.length)
                .setOptions(
                    fields.map((field, i) =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(String(field.name).slice(0, 100))
                            .setDescription(String(field.value).slice(0, 100))
                            .setValue(i.toString())
                    )
                );
            const row = new ActionRowBuilder().addComponents(select);
            return interaction.reply({
                content: 'Selecione o(s) field(s) que deseja remover.',
                components: [row],
                ephemeral: true
            });
        }
        case 'embedEditField': {
            const embed = loadSessionEmbed(interaction);
            if (!embed) {
                return interaction.reply({ content: '❌ Sessão inválida.', ephemeral: true });
            }
            const fields = embed.data.fields || [];
            if (!fields.length) {
                return interaction.reply({
                    content: 'Nenhum field adicionado na embed.',
                    ephemeral: true
                });
            }

            const select = new StringSelectMenuBuilder()
                .setCustomId('embedEditFieldSelect')
                .setMaxValues(1)
                .setOptions(
                    fields.map((field, i) =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(String(field.name || `Field #${i + 1}`).slice(0, 100))
                            .setDescription(String(field.value || 'Sem descrição').slice(0, 100))
                            .setValue(i.toString())
                    )
                );

            const row = new ActionRowBuilder().addComponents(select);
            const cancelRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('embedEditFieldCancel')
                    .setLabel('Cancelar')
                    .setStyle(ButtonStyle.Danger)
            );

            return updateInteractionEmbed(interaction, embed, {
                instructionLines: ['Selecione o field que deseja editar.'],
                components: [row, cancelRow]
            });
        }
        case 'embedSetTimestamp': {
            const embed = loadSessionEmbed(interaction);
            if (!embed) {
                return interaction.reply({ content: '❌ Sessão inválida.', ephemeral: true });
            }
            const enabled = !!embed.data.timestamp;
            if (enabled) {
                embed.data.timestamp = undefined;
            } else {
                embed.setTimestamp();
            }
            return updateInteractionEmbed(interaction, embed);
        }
        case 'embedDelete': {
            const guildId = interaction.guild.id;
            const userId = interaction.user.id;

            const parts = customId.split(';');
            const embedName = parts[1];

            if (!embedName) {
                return interaction.reply({
                    content: '❌ Nenhuma embed salva está associada a este construtor. Use primeiro **Salvar Embed** e depois **Carregar Embed** para poder deletar.',
                    ephemeral: true
                });
            }

            const existing = db.getEmbed(guildId, userId, embedName);
            if (!existing) {
                return interaction.reply({
                    content: `❌ A embed **${embedName}** já foi removida ou não existe.`,
                    ephemeral: true
                });
            }

            db.deleteEmbed(guildId, userId, embedName);

            const emptyEmbed = new EmbedBuilder().setDescription('\u200b');

            return updateInteractionEmbed(interaction, emptyEmbed, {
                instructionLines: [`<a:sucesso:1443149628085244036> Embed **${embedName}** deletada com sucesso. Você pode criar uma nova embed abaixo.`],
                components: getBaseRows()
            });
        }
        case 'embedSend': {
            const row = new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId('embedSend')
                    .setPlaceholder('Selecione o canal')
                    .setMaxValues(1)
                    .setChannelTypes([
                        ChannelType.GuildText,
                        ChannelType.GuildAnnouncement,
                        ChannelType.PublicThread,
                        ChannelType.GuildForum
                    ])
            );
            return interaction.reply({
                content: 'Selecione o canal onde a embed será enviada.',
                components: [row],
                ephemeral: true
            });
        }
        case 'embedSendWebhook': {
            const webhooks = await interaction.guild.fetchWebhooks().catch(() => null);

            if (!webhooks || !webhooks.size) {
                const row = new ActionRowBuilder().addComponents(
                    new ChannelSelectMenuBuilder()
                        .setCustomId('embedSendWebhookChannel')
                        .setPlaceholder('Nenhuma webhook encontrada. Selecione o canal para criar e enviar via webhook')
                        .setMaxValues(1)
                        .setChannelTypes([
                            ChannelType.GuildText,
                            ChannelType.GuildAnnouncement
                        ])
                );
                return interaction.reply({
                    content: '⚠️ Nenhuma webhook encontrada no servidor.\nSelecione um canal para criar uma webhook e enviar a embed por ela.',
                    components: [row],
                    ephemeral: true
                });
            }

            const options = [];

            for (const wh of webhooks.values()) {
                const channel = wh.channelId ? interaction.guild.channels.cache.get(wh.channelId) : null;
                if (!channel || !channel.isTextBased()) continue;

                const label = `${wh.name || 'Webhook sem nome'}`.slice(0, 90);
                const description = `Canal: #${channel.name}`.slice(0, 100);

                options.push(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(label)
                        .setDescription(description)
                        .setValue(wh.id)
                );

                if (options.length >= 25) break;
            }

            if (!options.length) {
                const row = new ActionRowBuilder().addComponents(
                    new ChannelSelectMenuBuilder()
                        .setCustomId('embedSendWebhookChannel')
                        .setPlaceholder('Nenhuma webhook utilizável. Selecione um canal para criar e enviar via webhook')
                        .setMaxValues(1)
                        .setChannelTypes([
                            ChannelType.GuildText,
                            ChannelType.GuildAnnouncement
                        ])
                );
                return interaction.reply({
                    content: '⚠️ Não encontrei webhooks utilizáveis.\nSelecione um canal para criar uma webhook e enviar a embed por ela.',
                    components: [row],
                    ephemeral: true
                });
            }

            const select = new StringSelectMenuBuilder()
                .setCustomId('embedSendWebhookSelect')
                .setMaxValues(1)
                .setOptions(options);

            const row = new ActionRowBuilder().addComponents(select);

            return interaction.reply({
                content: 'Selecione **qual webhook** você deseja usar para enviar a embed (mostrando também o canal em que ela envia):',
                components: [row],
                ephemeral: true
            });
        }
        case 'embedSave': {
            const nameInput = new TextInputBuilder()
                .setCustomId('name')
                .setLabel('Nome da embed')
                .setMaxLength(100)
                .setMinLength(1)
                .setRequired(true)
                .setStyle(TextInputStyle.Short);
            const modal = new ModalBuilder()
                .setCustomId('embedSave')
                .setTitle('Salvar Embed')
                .addComponents(new ActionRowBuilder().addComponents(nameInput));
            return interaction.showModal(modal);
        }
        case 'embedLoad': {
            if (!loadSessionEmbed(interaction)) {
                return interaction.reply({
                    content: '❌ Sessão do construtor inválida. Use `/criar embed` novamente.',
                    ephemeral: true
                });
            }
            const guildId = interaction.guild.id;
            const userId = interaction.user.id;
            const savedEmbeds = db.getAllEmbeds(guildId, userId);
            if (!savedEmbeds.length) {
                return interaction.reply({
                    content: 'Nenhuma embed salva encontrada para este servidor/usuário.',
                    ephemeral: true
                });
            }
            const options = savedEmbeds.slice(0, 25).map(e =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(e.embedName)
                    .setValue(e.embedName)
            );
            const select = new StringSelectMenuBuilder()
                .setCustomId('embedLoad')
                .setMaxValues(1)
                .setOptions(options);
            const row = new ActionRowBuilder().addComponents(select);
            const cancelRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('embedLoadCancel')
                    .setLabel('Cancelar')
                    .setStyle(ButtonStyle.Danger)
            );
            const current = loadSessionEmbed(interaction);
            const payload = buildEmbedConstructorPayload(current, {
                instructionLines: ['Selecione uma embed salva para carregar.'],
                actionRows: [row, cancelRow],
                ephemeral: true
            });
            return interaction.update(payload);
        }
        case 'embedEditFieldCancel': {
            const embed = loadSessionEmbed(interaction) || new EmbedBuilder().setDescription('\u200b');

            return updateInteractionEmbed(interaction, embed, {
                instructionLines: [DEFAULT_INSTRUCTION],
                components: getBaseRows()
            });
        }
        case 'embedLoadCancel': {
            const embed = loadSessionEmbed(interaction);
            if (!embed) {
                return interaction.reply({ content: '❌ Sessão inválida.', ephemeral: true });
            }
            const payload = buildEmbedConstructorPayload(embed, {
                instructionLines: [DEFAULT_INSTRUCTION],
                actionRows: getBaseRows(),
                ephemeral: true
            });
            return interaction.update(payload);
        }
        default:
            return;
    }
}

export async function handleEmbedModal(interaction) {
    const { customId } = interaction;

    const embed = loadSessionEmbed(interaction);
    if (!embed) {
        return interaction.reply({
            content: '❌ Construtor de embed não encontrado. Use `/criar embed` novamente.',
            ephemeral: true
        });
    }

    if (customId.startsWith('embedEditFieldModal')) {
        const [, indexStr] = customId.split(';');
        const index = parseInt(indexStr, 10);
        if (Number.isNaN(index)) {
            return interaction.reply({
                content: '❌ Índice de field inválido.',
                ephemeral: true
            });
        }

        const name = interaction.fields.getTextInputValue('name');
        const value = interaction.fields.getTextInputValue('value');
        const inline = interaction.fields.getTextInputValue('inline') === '1';

        const fields = embed.data.fields || [];
        if (!fields[index]) {
            return interaction.reply({
                content: '❌ Field não encontrado.',
                ephemeral: true
            });
        }

        fields[index] = { name, value, inline };
        embed.data.fields = fields;

        await interaction.deferUpdate();
        return editInteractionEmbed(interaction, embed, {
            instructionLines: [DEFAULT_INSTRUCTION],
            components: getBaseRows()
        });
    }

    switch (customId) {
        case 'embedEditTitle': {
            const title = interaction.fields.getTextInputValue('title');
            if (!title) {
                embed.data.title = undefined;
            } else {
                embed.setTitle(title);
            }
            await interaction.deferUpdate();
            return editInteractionEmbed(interaction, embed);
        }
        case 'embedEditThumbnail': {
            const url = interaction.fields.getTextInputValue('url')?.trim();
            if (!url) {
                embed.data.thumbnail = undefined;
            } else {
                embed.setThumbnail(url);
            }
            await interaction.deferUpdate();
            return editInteractionEmbed(interaction, embed);
        }
        case 'embedEditDescription': {
            const description = interaction.fields.getTextInputValue('description');
            if (!description) {
                embed.data.description = undefined;
            } else {
                embed.setDescription(description);
            }
            await interaction.deferUpdate();
            return editInteractionEmbed(interaction, embed);
        }
        case 'embedEditColor': {
            const color = interaction.fields.getTextInputValue('color');
            let instructionLines = [DEFAULT_INSTRUCTION];

            if (!color) {
                embed.data.color = undefined;
                instructionLines = ['✅ Cor removida com sucesso!'];
            } else {
                let hex = color.replace(/^#/, '').trim();
                const originalHex = hex;

                if (/^[0-9A-Fa-f]{3}$/.test(hex)) {
                    hex = hex.split('').map(c => c + c).join('');
                } else if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
                    // ok
                } else if (/^[0-9A-Fa-f]{1,5}$/.test(hex) || /^[0-9A-Fa-f]{7,}$/.test(hex)) {
                    hex = hex.substring(0, 6).padEnd(6, '0');
                } else {
                    const numColor = parseInt(color.replace(/^#/, ''), 10);
                    if (!Number.isNaN(numColor) && numColor >= 0 && numColor <= 0xffffff) {
                        hex = numColor.toString(16).padStart(6, '0');
                    } else {
                        hex = 'FF0000';
                    }
                }

                embed.setColor(`#${hex}`);

                if (originalHex !== hex) {
                    instructionLines = [`✅ Cor alterada para \`#${hex.toUpperCase()}\` (normalizada de \`${originalHex}\`)`];
                } else {
                    instructionLines = [`✅ Cor alterada para \`#${hex.toUpperCase()}\``];
                }
            }

            await interaction.deferUpdate();
            return editInteractionEmbed(interaction, embed, {
                instructionLines,
                components: getBaseRows()
            });
        }
        case 'embedEditImage': {
            const url = interaction.fields.getTextInputValue('url');
            if (!url) {
                embed.data.image = undefined;
            } else {
                embed.setImage(url);
            }
            await interaction.deferUpdate();
            return editInteractionEmbed(interaction, embed);
        }
        case 'embedEditFooter': {
            const text = interaction.fields.getTextInputValue('text');
            const icon = interaction.fields.getTextInputValue('icon');
            if (!text) {
                embed.data.footer = undefined;
            } else {
                embed.setFooter({ text, iconURL: icon || undefined });
            }
            await interaction.deferUpdate();
            return editInteractionEmbed(interaction, embed);
        }
        case 'embedAddField': {
            const name = interaction.fields.getTextInputValue('name');
            const value = interaction.fields.getTextInputValue('value');
            const inline = interaction.fields.getTextInputValue('inline') === '1';
            embed.addFields({ name, value, inline });
            await interaction.deferUpdate();
            return editInteractionEmbed(interaction, embed);
        }
        case 'embedSave': {
            const guildId = interaction.guild.id;
            const userId = interaction.user.id;
            const name = interaction.fields.getTextInputValue('name');
            const json = stripHintContent(embed).toJSON();
            await db.saveEmbed(guildId, userId, name, json);
            await interaction.deferReply({ ephemeral: true });
            await interaction.followUp({ content: `<a:sucesso:1443149628085244036> Embed **${name}** salva com sucesso!`, ephemeral: true });
            return;
        }
        default:
            return;
    }
}

export async function handleEmbedSelectMenu(interaction) {
    const { customId } = interaction;

    if (customId === 'embedSend') {
        const channelId = interaction.values[0];
        const channel = interaction.guild.channels.cache.get(channelId);
        if (!channel || !channel.isTextBased()) {
            return interaction.reply({
                content: '❌ Canal inválido.',
                ephemeral: true
            });
        }
        const me = interaction.guild.members.me;
        if (!me || !channel.viewable || !channel.permissionsFor(me)?.has(['SendMessages', 'EmbedLinks'])) {
            return interaction.reply({
                content: '❌ Não tenho permissão para enviar mensagens nesse canal.',
                ephemeral: true
            });
        }
        const referenceMessageId = interaction.message.reference?.messageId;
        const sourceMessage = referenceMessageId
            ? await interaction.channel.messages.fetch(referenceMessageId).catch(() => null)
            : null;
        const baseMessage = sourceMessage || interaction.message;
        const session = db.getEmbedBuilderSession(baseMessage.id);
        if (!session) {
            return interaction.reply({
                content: '❌ Sessão do construtor não encontrada. Use `/criar embed` novamente.',
                ephemeral: true
            });
        }

        const outEmbed = EmbedBuilder.from(session.embedData);
        const sent = await channel.send({
            embeds: [outEmbed]
        });
        return interaction.update({
            content: `<a:sucesso:1443149628085244036> Mensagem enviada em ${channel} | [Ver mensagem](${sent.url})`,
            components: []
        });
    }

    if (customId === 'embedRemoveField') {
        const indexes = interaction.values.map(v => parseInt(v, 10)).filter(n => !Number.isNaN(n));
        const referenceMessageId = interaction.message.reference?.messageId;
        const baseMessage = referenceMessageId
            ? await interaction.channel.messages.fetch(referenceMessageId).catch(() => null)
            : null;
        if (!baseMessage) {
            return interaction.reply({
                content: '❌ Mensagem do construtor não encontrada.',
                ephemeral: true
            });
        }
        const row = db.getEmbedBuilderSession(baseMessage.id);
        if (!row) {
            return interaction.reply({
                content: '❌ Sessão não encontrada.',
                ephemeral: true
            });
        }
        const embed = stripHintContent(EmbedBuilder.from(row.embedData));
        embed.data.fields = (embed.data.fields || []).filter((_, i) => !indexes.includes(i));
        db.upsertEmbedBuilderSession(baseMessage.id, interaction.guild.id, row.userId, embed.toJSON());

        await interaction.update({
            content: '<a:sucesso:1443149628085244036> Fields removidos.',
            components: []
        });

        const mainPayload = buildEmbedConstructorPayload(embed, {
            instructionLines: [DEFAULT_INSTRUCTION],
            actionRows: getBaseRows(),
            ephemeral: true
        });
        try {
            await baseMessage.edit(mainPayload);
        } catch (e) {
            if (e.code === 10008) {
                logger.warning('Construtor de embed: mensagem base já não existe; sessão atualizada só na BD', {
                    messageId: baseMessage.id,
                    channelId: baseMessage.channel?.id
                });
            } else {
                throw e;
            }
        }
        return;
    }

    if (customId === 'embedLoad') {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const name = interaction.values[0];
        const saved = db.getEmbed(guildId, userId, name);
        if (!saved) {
            return interaction.reply({
                content: '❌ Não consegui carregar a embed selecionada.',
                ephemeral: true
            });
        }
        const embed = stripHintContent(new EmbedBuilder(saved.embedData));
        return updateInteractionEmbed(interaction, embed, {
            instructionLines: [DEFAULT_INSTRUCTION],
            components: getBaseRows(false, null, true, name)
        });
    }

    if (customId === 'embedEditFieldSelect') {
        const index = parseInt(interaction.values[0], 10);

        const embed = loadSessionEmbed(interaction);
        if (!embed || Number.isNaN(index)) {
            return interaction.reply({
                content: '❌ Field ou embed não encontrados para edição.',
                ephemeral: true
            });
        }

        const field = embed.data.fields?.[index];

        if (!field) {
            return interaction.reply({
                content: '❌ Field não encontrado.',
                ephemeral: true
            });
        }

        const modal = new ModalBuilder()
            .setCustomId(`embedEditFieldModal;${index}`)
            .setTitle('Editar Field')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('name')
                        .setLabel('Nome do field')
                        .setMinLength(1)
                        .setMaxLength(256)
                        .setRequired(true)
                        .setValue(String(field.name || ''))
                        .setStyle(TextInputStyle.Short)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('value')
                        .setLabel('Texto do field')
                        .setMinLength(1)
                        .setMaxLength(1024)
                        .setRequired(true)
                        .setValue(String(field.value || ''))
                        .setStyle(TextInputStyle.Paragraph)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('inline')
                        .setLabel('Field alinhado (0 ou 1)')
                        .setPlaceholder('0 = não | 1 = sim')
                        .setMinLength(1)
                        .setMaxLength(1)
                        .setRequired(true)
                        .setValue(field.inline ? '1' : '0')
                        .setStyle(TextInputStyle.Short)
                )
            );

        return interaction.showModal(modal);
    }

    if (customId === 'embedSendWebhookSelect') {
        const webhookId = interaction.values[0];
        const webhooks = await interaction.guild.fetchWebhooks().catch(() => null);
        const webhook = webhooks ? webhooks.get(webhookId) : null;

        if (!webhook) {
            return interaction.reply({
                content: '❌ Webhook não encontrada. Talvez tenha sido deletada.',
                ephemeral: true
            });
        }

        const referenceMessageId = interaction.message.reference?.messageId;
        const sourceMessage = referenceMessageId
            ? await interaction.channel.messages.fetch(referenceMessageId).catch(() => null)
            : null;
        const baseMessage = sourceMessage || interaction.message;
        const session = db.getEmbedBuilderSession(baseMessage.id);
        if (!session) {
            return interaction.reply({
                content: '❌ Sessão do construtor não encontrada.',
                ephemeral: true
            });
        }

        try {
            const webhookEmbed = EmbedBuilder.from(session.embedData);
            await webhook.send({
                embeds: [webhookEmbed],
                username: interaction.user.username,
                avatarURL: interaction.user.displayAvatarURL()
            });

            const channel = webhook.channelId
                ? interaction.guild.channels.cache.get(webhook.channelId)
                : null;

            return interaction.update({
                content: channel
                    ? `<a:sucesso:1443149628085244036> Embed enviada via webhook **${webhook.name}** em ${channel}.`
                    : `<a:sucesso:1443149628085244036> Embed enviada via webhook **${webhook.name}**.`,
                components: []
            });
        } catch (error) {
            return interaction.update({
                content: `❌ Não foi possível enviar via webhook: ${error.message || 'erro desconhecido'}`,
                components: []
            });
        }
    }
}
