import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    EmbedBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    SectionBuilder,
    TextDisplayBuilder,
    ThumbnailBuilder
} from 'discord.js';
import { getColors } from './configHelper.js';
import { truncateText, validateFields } from './messageTextUtils.js';

const TEXT_MAX = 4000;
const DEFAULT_EMBED_ACCENT = 0x5865f2;

export const DEFAULT_VERIFICATION_TEXT = [
    'Bem-vindo à verificação.',
    '',
    'Use o botão **Iniciar verificação**, preencha o formulário e aguarde. Pedimos essas informações para liberar seu acesso ao restante do servidor com segurança.',
    '',
    'A equipe analisa os pedidos o mais breve possível.'
].join('\n');

/**
 * Parte texto em blocos compatíveis com Text Display (Discord).
 * @param {string} str
 * @param {number} [max]
 * @returns {string[]}
 */
export function chunkText(str, max = TEXT_MAX) {
    if (str == null || str === '') {
        return ['\u200b'];
    }
    const chunks = [];
    for (let i = 0; i < str.length; i += max) {
        chunks.push(str.slice(i, i + max));
    }
    return chunks;
}

/**
 * Mensagem de verificação no canal (Components V2).
 * @param {Object} opts
 * @param {string} [opts.bodyText]
 * @param {number} opts.accentColor
 * @param {string|null} [opts.bannerUrl]
 * @param {import('discord.js').Guild} opts.guild
 * @param {import('discord.js').Client} [opts.client]
 * @returns {{ components: unknown[], flags: number }}
 */
export function buildVerificationMessageV2({
    bodyText = DEFAULT_VERIFICATION_TEXT,
    accentColor,
    bannerUrl = null,
    guild,
    client
}) {
    const serverIconUrl = guild.iconURL({ extension: 'png', size: 256 })
        || (client?.user?.displayAvatarURL && client.user.displayAvatarURL({ extension: 'png', size: 256 }));
    const section = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('# Sistema de Verificação'),
            new TextDisplayBuilder().setContent(bodyText)
        );
    if (serverIconUrl) {
        section.setThumbnailAccessory(new ThumbnailBuilder({ media: { url: serverIconUrl } }));
    }
    const container = new ContainerBuilder()
        .setAccentColor(accentColor)
        .addSectionComponents(section);
    if (bannerUrl && (bannerUrl.startsWith('http:') || bannerUrl.startsWith('https:'))) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(bannerUrl))
        );
    }
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('start_verification')
            .setLabel('Iniciar Verificação')
            .setStyle(ButtonStyle.Secondary)
    );
    return {
        components: [container, row],
        flags: MessageFlags.IsComponentsV2
    };
}

/**
 * Feedback ephemeral (sucesso/erro) para fluxos de setup — Components V2.
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} opts.description
 * @param {number} opts.accentColor
 * @returns {{ components: import('@discordjs/builders').UnknownComponent[], flags: number }}
 */
export function buildSetupFeedbackV2({ title, description, accentColor }) {
    const displays = [
        new TextDisplayBuilder().setContent(`# ${title}`),
        ...chunkText(description || '\u200b').map(c => new TextDisplayBuilder().setContent(c))
    ];
    const container = new ContainerBuilder()
        .setAccentColor(accentColor)
        .addTextDisplayComponents(...displays);
    return {
        components: [container],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    };
}

/**
 * Converte dados de embed (JSON API Discord) para mensagem Components V2.
 * @param {Object} embedData — resultado de EmbedBuilder#toJSON() ou API embed object
 * @param {Object} [options]
 * @param {boolean} [options.ephemeral]
 * @param {string[]} [options.instructionLines] — linhas de instrução acima do cartão
 * @param {import('discord.js').ActionRowBuilder[]} [options.actionRows]
 * @param {number} [options.accentColorOverride]
 * @returns {{ components: unknown[], flags: number }}
 */
export function buildEmbedMessageV2(embedData, options = {}) {
    const {
        ephemeral = false,
        instructionLines = [],
        actionRows = [],
        accentColorOverride
    } = options;

    const data = embedData && typeof embedData === 'object' ? embedData : {};

    let accent = accentColorOverride ?? data.color ?? DEFAULT_EMBED_ACCENT;
    if (typeof accent === 'string') {
        const h = accent.replace(/^#/, '');
        accent = parseInt(h, 16);
        if (Number.isNaN(accent)) accent = DEFAULT_EMBED_ACCENT;
    }

    const parts = [];

    if (data.author?.name) {
        let line = data.author.url
            ? `[${data.author.name}](${data.author.url})`
            : `**${data.author.name}**`;
        parts.push(line);
    }

    if (data.title) {
        parts.push(`# ${data.title}`);
    }

    if (data.description) {
        for (const c of chunkText(data.description)) {
            parts.push(c);
        }
    }

    if (Array.isArray(data.fields) && data.fields.length) {
        const fieldBlocks = [];
        for (const f of data.fields) {
            const name = String(f.name ?? '');
            const value = String(f.value ?? '');
            fieldBlocks.push(`**${name}**\n${value}`);
        }
        parts.push(fieldBlocks.join('\n\n'));
    }

    let footerLine = '';
    if (data.footer?.text) {
        footerLine = data.footer.text;
    }
    if (data.timestamp) {
        const t = data.timestamp;
        const sec = typeof t === 'string'
            ? Math.floor(new Date(t).getTime() / 1000)
            : Math.floor(Number(t) / (t > 1e12 ? 1000 : 1));
        if (!Number.isNaN(sec)) {
            footerLine = footerLine
                ? `${footerLine} · <t:${sec}:F>`
                : `<t:${sec}:F>`;
        }
    }
    if (footerLine) {
        parts.push(`_${footerLine}_`);
    }

    const bodyText = parts.filter(Boolean).join('\n\n') || '\u200b';

    const thumbUrl = data.thumbnail?.url || data.author?.icon_url || null;
    const imageUrl = data.image?.url || null;

    /** Secções Discord limitam a 3 Text Displays; o Container aceita vários Text Displays. */
    const bodyChunks = chunkText(bodyText);

    const container = new ContainerBuilder().setAccentColor(accent);

    if (thumbUrl && (thumbUrl.startsWith('http:') || thumbUrl.startsWith('https:'))) {
        const firstChunk = bodyChunks.shift() || '\u200b';
        const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(firstChunk))
            .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: thumbUrl } }));
        container.addSectionComponents(section);
        for (const c of bodyChunks) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(c));
        }
    } else {
        for (const c of bodyChunks) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(c));
        }
    }

    if (imageUrl && (imageUrl.startsWith('http:') || imageUrl.startsWith('https:'))) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl))
        );
    }

    /** @type {unknown[]} */
    const components = [];

    for (const line of instructionLines) {
        for (const c of chunkText(line)) {
            components.push(new TextDisplayBuilder().setContent(c));
        }
    }

    components.push(container);

    for (const row of actionRows) {
        components.push(row);
    }

    let flags = MessageFlags.IsComponentsV2;
    if (ephemeral) {
        flags |= MessageFlags.Ephemeral;
    }

    return { components, flags };
}

/**
 * Cartão padrão do bot (substitui embeds de responseUtils) — Components V2.
 * Mesma semântica que o antigo createResponse com EmbedBuilder.
 */
export function buildStandardCardV2({
    title = '',
    description = '',
    type = 'info',
    fields = [],
    color,
    ephemeral = false,
    thumbnail,
    image,
    footer,
    author
} = {}) {
    const CUSTOM_EMOJIS = {
        success: '<a:sucesso:1443149628085244036>',
        error: '<a:erro:1443149642580758569>'
    };

    const configColors = getColors();
    const colors = {
        info: configColors.info || 0x3498db,
        success: configColors.success || 0x2ecc71,
        warning: configColors.warning || 0xf39c12,
        error: configColors.danger || 0xe74c3c,
        custom: color || configColors.primary || 0x9b59b6
    };

    const icons = {
        info: 'ℹ️',
        success: CUSTOM_EMOJIS.success,
        warning: '⚠️',
        error: CUSTOM_EMOJIS.error,
        custom: '✨'
    };

    const icon = icons[type] || icons.custom;

    let titleOut;
    if (title) {
        const isCustomEmoji = typeof icon === 'string' && (icon.startsWith('<:') || icon.startsWith('<a:'));
        const fullTitle = isCustomEmoji ? title : `${icon} ${title}`;
        titleOut = truncateText(fullTitle, 256);
    }

    let descOut = '\u200b';
    if (description && description.trim() !== '') {
        let finalDescription = truncateText(description, 4096);
        if (icon && typeof icon === 'string' && (icon.startsWith('<:') || icon.startsWith('<a:'))) {
            finalDescription = `${icon} ${finalDescription}`;
        }
        descOut = finalDescription;
    }

    const validatedFields = validateFields(fields);

    const accent = color || colors[type] || colors.custom;

    /** @type {Record<string, unknown>} */
    const embedData = {
        color: accent,
        title: titleOut,
        description: descOut,
        fields: validatedFields,
        timestamp: new Date().toISOString()
    };

    if (thumbnail) {
        embedData.thumbnail = { url: thumbnail };
    }
    if (image) {
        embedData.image = { url: image };
    }
    if (footer) {
        if (typeof footer === 'string') {
            embedData.footer = { text: truncateText(footer, 2048) };
        } else {
            const footerObj = { ...footer };
            if (footerObj.text) {
                footerObj.text = truncateText(footerObj.text, 2048);
            }
            if (footerObj.iconURL) {
                footerObj.icon_url = footerObj.iconURL;
                delete footerObj.iconURL;
            }
            embedData.footer = footerObj;
        }
    }
    if (author) {
        if (typeof author === 'string') {
            embedData.author = { name: truncateText(author, 256) };
        } else {
            const authorObj = { ...author };
            if (authorObj.name) {
                authorObj.name = truncateText(authorObj.name, 256);
            }
            if (authorObj.iconURL) {
                authorObj.icon_url = authorObj.iconURL;
                delete authorObj.iconURL;
            }
            embedData.author = authorObj;
        }
    }

    return buildEmbedMessageV2(embedData, { ephemeral });
}

/**
 * Junta um payload V2 (`components` + `flags`) com filas de botões/menus.
 * @param {{ components: unknown[], flags: number }} cardPayload
 * @param {import('discord.js').ActionRowBuilder[]} rows
 */
export function mergeV2WithRows(cardPayload, rows) {
    return {
        components: [...(cardPayload.components || []), ...rows],
        flags: cardPayload.flags
    };
}

/**
 * Ficha de verificação no canal de staff (substitui leitura de message.embeds[0]).
 * @param {Object} opts
 * @param {import('discord.js').Guild} opts.guild
 * @param {import('discord.js').GuildMember} opts.member
 * @param {string} [opts.referralSource]
 * @param {'pending'|'approved'|'denied'} opts.status
 * @param {import('discord.js').User} [opts.staffUser] — obrigatório se status !== pending
 */
export function buildVerificationStaffMessageV2({
    guild,
    member,
    referralSource = 'Não informado',
    status,
    staffUser
}) {
    const colors = getColors();
    const isPending = status === 'pending';
    const isApproved = status === 'approved';
    const color = isPending ? 0xf39c12 : (isApproved ? (colors.success || 0x2ecc71) : (colors.danger || 0xe74c3c));
    const statusTitle = isPending ? 'Pendente' : (isApproved ? 'APROVADA' : 'RECUSADA');
    const statusEmoji = isPending ? '🔍' : (isApproved ? '<a:sucesso:1443149628085244036>' : '<a:erro:1443149642580758569>');

    const refVal = referralSource && referralSource !== 'Não informado'
        ? `\`${referralSource}\``
        : '`Não informado`';

    const embed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({
            name: isPending ? 'Nova Solicitação de Verificação' : `Verificação ${statusTitle}`,
            iconURL: guild.iconURL({ dynamic: true }) || undefined
        })
        .setTitle(isPending ? '🔍 Verificação Pendente' : `${statusEmoji} Verificação ${statusTitle}`)
        .setDescription(`**${member.user}** solicitou verificação no servidor`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
            {
                name: '👤 Informações do Usuário',
                value: `**Tag:** ${member.user.tag}\n**ID:** \`${member.id}\``,
                inline: true
            },
            {
                name: '📅 Informações da Conta',
                value: member.user.createdTimestamp
                    ? `**Criada:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`
                    : 'Desconhecido',
                inline: true
            },
            {
                name: '🏠 No Servidor',
                value: member.joinedTimestamp
                    ? `**Entrou:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
                    : 'Desconhecido',
                inline: true
            },
            {
                name: '📌 Indicado por',
                value: refVal,
                inline: false
            },
            {
                name: '📝 Status da Verificação',
                value: isPending
                    ? '```🟡 PENDENTE - Aguardando análise da equipe```'
                    : `\`\`\`${isApproved ? '🟢 APROVADA' : '🔴 RECUSADA'} por ${staffUser?.username ?? 'staff'}\`\`\``,
                inline: false
            }
        );

    if (!isPending && staffUser) {
        embed.addFields(
            {
                name: '🛠️ Processado por',
                value: `${staffUser} (${staffUser.tag})`,
                inline: true
            },
            {
                name: '⏰ Processado em',
                value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                inline: true
            }
        );
    }

    embed.setFooter({
        text: isPending
            ? `ID: ${member.id} • Clique nos botões abaixo para aprovar ou recusar`
            : `ID: ${member.id}`,
        iconURL: guild.iconURL({ dynamic: true })
    }).setTimestamp();

    return buildEmbedMessageV2(embed.toJSON());
}

/**
 * Ficha de whitelist no canal de staff (wl-solicitacao).
 * @param {'pending'|'approved'|'denied'} opts.status
 */
export function buildWhitelistStaffMessageV2({
    guild,
    member,
    minecraftUsername,
    platform = 'java',
    status,
    staffUser
}) {
    const colors = getColors();
    const isPending = status === 'pending';
    const isApproved = status === 'approved';
    const color = isPending ? 0xf39c12 : (isApproved ? (colors.success || 0x2ecc71) : (colors.danger || 0xe74c3c));
    const statusTitle = isPending ? 'Pendente' : (isApproved ? 'APROVADA' : 'RECUSADA');
    const statusEmoji = isPending ? '🎮' : (isApproved ? '<a:sucesso:1443149628085244036>' : '<a:erro:1443149642580758569>');
    const platLabel = platform === 'bedrock' ? '🔷 **Bedrock**' : '☕ **Java**';

    const embed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({
            name: isPending ? 'Nova Solicitação de Whitelist' : `Whitelist ${statusTitle}`,
            iconURL: guild.iconURL({ dynamic: true }) || undefined
        })
        .setTitle(isPending ? '🎮 Whitelist Pendente' : `${statusEmoji} Whitelist ${statusTitle}`)
        .setDescription(`**${member.user}** solicitou whitelist no servidor`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
            {
                name: '👤 Informações do Usuário',
                value: `**Tag:** ${member.user.tag}\n**ID:** \`${member.id}\``,
                inline: true
            },
            {
                name: '🎮 Nome de Usuário Minecraft',
                value: `\`${minecraftUsername}\``,
                inline: true
            },
            {
                name: '📱 Plataforma',
                value: platLabel,
                inline: true
            },
            {
                name: '📅 Informações da Conta',
                value: member.user.createdTimestamp
                    ? `**Criada:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`
                    : 'Desconhecido',
                inline: true
            },
            {
                name: '🏠 No Servidor',
                value: member.joinedTimestamp
                    ? `**Entrou:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
                    : 'Desconhecido',
                inline: true
            },
            {
                name: '📝 Status da Whitelist',
                value: isPending
                    ? '```🟡 PENDENTE - Aguardando análise da equipe```'
                    : `\`\`\`${isApproved ? '🟢 APROVADA' : '🔴 RECUSADA'} por ${staffUser?.username ?? 'staff'}\`\`\``,
                inline: false
            }
        );

    if (!isPending && staffUser) {
        embed.addFields(
            {
                name: '🛠️ Processado por',
                value: `${staffUser} (${staffUser.tag})`,
                inline: true
            },
            {
                name: '⏰ Processado em',
                value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                inline: true
            }
        );
    }

    embed.setFooter({
        text: isPending
            ? `ID: ${member.id} • Clique nos botões abaixo para aprovar ou recusar`
            : `ID: ${member.id}`,
        iconURL: guild.iconURL({ dynamic: true })
    }).setTimestamp();

    return buildEmbedMessageV2(embed.toJSON());
}

/**
 * Converte um EmbedBuilder em payload V2 (envio em canal ou DM).
 * @param {import('discord.js').EmbedBuilder} embedBuilder
 * @param {boolean} [ephemeral]
 */
export function toV2FromEmbedBuilder(embedBuilder, ephemeral = false) {
    return buildEmbedMessageV2(embedBuilder.toJSON(), { ephemeral });
}
