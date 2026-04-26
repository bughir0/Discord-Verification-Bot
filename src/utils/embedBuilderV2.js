import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} from 'discord.js';
import { getColors } from './configHelper.js';
import { truncateText, validateFields } from './messageTextUtils.js';

const TEXT_MAX = 4000;

export const DEFAULT_VERIFICATION_TEXT = [
    'Bem-vindo à verificação.',
    '',
    'Use o botão **Iniciar verificação**, preencha o formulário e aguarde. Pedimos essas informações para liberar seu acesso ao restante do servidor com segurança.',
    '',
    'A equipe analisa os pedidos o mais breve possível.'
].join('\n');

/**
 * Parte texto longo em blocos (útil para descrições).
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
 * Payload clássico para reply/editReply com embed efémera ou não.
 * @param {import('discord.js').EmbedBuilder} embedBuilder
 * @param {boolean} [ephemeral]
 * @returns {{ embeds: import('discord.js').EmbedBuilder[], ephemeral?: boolean }}
 */
export function toEmbedReply(embedBuilder, ephemeral = false) {
    if (ephemeral) {
        return { embeds: [embedBuilder], ephemeral: true };
    }
    return { embeds: [embedBuilder] };
}

/**
 * Junta embed(s) com filas de componentes e opcionalmente content (ex.: ping staff).
 * Aceita um EmbedBuilder ou um payload já retornado por toEmbedReply / buildStandardCardV2 (responseUtils).
 * @param {import('discord.js').EmbedBuilder|{ embeds: import('discord.js').EmbedBuilder[], ephemeral?: boolean }} embedOrPayload
 * @param {import('discord.js').ActionRowBuilder[]} rows
 * @param {{ content?: string }} [options]
 */
export function mergeEmbedWithRows(embedOrPayload, rows, options = {}) {
    const { content } = options;
    const base = embedOrPayload && typeof embedOrPayload === 'object' && Array.isArray(embedOrPayload.embeds)
        ? { ...embedOrPayload }
        : { embeds: [embedOrPayload] };
    const out = {
        ...base,
        components: rows
    };
    if (content != null && String(content).trim() !== '') {
        out.content = content;
    }
    return out;
}

/**
 * Mensagem de verificação no canal (embed + botão).
 */
export function buildVerificationMessageV2({
    bodyText = DEFAULT_VERIFICATION_TEXT,
    accentColor,
    bannerUrl = null,
    guild,
    client
}) {
    const serverIconUrl = guild.iconURL({ dynamic: true, size: 256 })
        || (client?.user?.displayAvatarURL && client.user.displayAvatarURL({ dynamic: true, size: 256 }));

    const embed = new EmbedBuilder()
        .setColor(accentColor)
        .setTitle('Sistema de Verificação')
        .setDescription(bodyText)
        .setTimestamp();

    if (serverIconUrl) {
        embed.setThumbnail(serverIconUrl);
    }

    if (bannerUrl && (bannerUrl.startsWith('http:') || bannerUrl.startsWith('https:'))) {
        embed.setImage(bannerUrl);
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('start_verification')
            .setLabel('Iniciar Verificação')
            .setStyle(ButtonStyle.Secondary)
    );

    return {
        embeds: [embed],
        components: [row]
    };
}

/**
 * Feedback ephemeral para fluxos de setup.
 */
export function buildSetupFeedbackV2({ title, description, accentColor }) {
    const embed = new EmbedBuilder()
        .setColor(accentColor)
        .setTitle(title)
        .setDescription(description || '\u200b')
        .setTimestamp();
    return toEmbedReply(embed, true);
}

/**
 * Cartão padrão (EmbedBuilder) — usado por responseUtils.
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

    const embed = new EmbedBuilder()
        .setColor(accent)
        .setTimestamp();

    if (titleOut) embed.setTitle(titleOut);
    embed.setDescription(descOut);
    if (validatedFields?.length) embed.addFields(validatedFields);

    if (thumbnail) embed.setThumbnail(thumbnail);
    if (image) embed.setImage(image);
    if (footer) {
        if (typeof footer === 'string') {
            embed.setFooter({ text: truncateText(footer, 2048) });
        } else {
            const t = footer.text ? truncateText(footer.text, 2048) : '\u200b';
            embed.setFooter({ text: t, iconURL: footer.iconURL });
        }
    }
    if (author) {
        if (typeof author === 'string') {
            embed.setAuthor({ name: truncateText(author, 256) });
        } else {
            embed.setAuthor({
                name: truncateText(author.name, 256),
                iconURL: author.iconURL,
                url: author.url
            });
        }
    }

    return toEmbedReply(embed, ephemeral);
}

/**
 * Ficha de verificação no canal de staff.
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
        .setDescription(`**<@${member.user.id}>** solicitou verificação no servidor`)
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
                value: `<@${staffUser.id}> (${staffUser.tag})`,
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

    return embed;
}

/**
 * Ficha de whitelist no canal de staff (wl-solicitacao).
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
        .setDescription(`**<@${member.id}>** solicitou whitelist no servidor`)
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
                value: `<@${staffUser.id}> (${staffUser.tag})`,
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

    return embed;
}
