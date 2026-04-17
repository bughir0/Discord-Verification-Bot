import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    SectionBuilder,
    TextDisplayBuilder,
    ThumbnailBuilder
} from 'discord.js';

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
