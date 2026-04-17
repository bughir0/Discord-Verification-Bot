import { EmbedBuilder } from 'discord.js';
import { getColors } from './configHelper.js';

/**
 * Valida e trunca campos de embed para respeitar os limites do Discord
 * @param {Array} fields - Array de campos
 * @returns {Array} Array de campos validados e truncados
 */
function validateFields(fields = []) {
    if (!Array.isArray(fields) || fields.length === 0) return [];
    
    const MAX_FIELDS = 25;
    const MAX_FIELD_NAME = 256;
    const MAX_FIELD_VALUE = 1024;
    
    // Limitar número de campos
    const limitedFields = fields.slice(0, MAX_FIELDS);
    
    // Validar e truncar cada campo
    return limitedFields.map(field => {
        if (!field || typeof field !== 'object') return null;
        
        const validatedField = {
            name: String(field.name || '\u200b').slice(0, MAX_FIELD_NAME),
            value: String(field.value || '\u200b').slice(0, MAX_FIELD_VALUE),
            inline: field.inline !== undefined ? field.inline : false
        };
        
        return validatedField;
    }).filter(Boolean);
}

/**
 * Valida e trunca strings para respeitar os limites do Discord
 * @param {string} text - Texto a validar
 * @param {number} maxLength - Comprimento máximo
 * @returns {string} Texto truncado
 */
function truncateText(text, maxLength) {
    if (!text) return '';
    const str = String(text);
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + '...';
}

/**
 * Cria uma resposta padronizada em embed
 * @param {Object} options - Opções do embed
 * @param {string} [options.title] - Título do embed
 * @param {string} [options.description] - Descrição do embed
 * @param {string} [options.type='info'] - Tipo de mensagem (info, success, warning, error, custom)
 * @param {Object} [options.fields] - Campos do embed
 * @param {string} [options.color] - Cor personalizada (sobrescreve a cor do tipo)
 * @param {boolean} [options.ephemeral=false] - Se a mensagem deve ser visível apenas para quem executou o comando
 * @returns {Object} Objeto com embed e opções para resposta
 */
function createResponse({
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
    // IDs dos emojis personalizados de sucesso/erro (definidos no Discord Developer Portal)
    const CUSTOM_EMOJIS = {
        // Emojis animados: usar <a:nome:id>
        success: '<a:sucesso:1443149628085244036>',
        error: '<a:erro:1443149642580758569>'
    };

    // Define cores padrão baseadas no tipo
    const configColors = getColors();
    const colors = {
        info: configColors.info || 0x3498db,       // Azul
        success: configColors.success || 0x2ecc71, // Verde
        warning: configColors.warning || 0xf39c12, // Laranja
        error: configColors.danger || 0xe74c3c,    // Vermelho
        custom: color || configColors.primary || 0x9b59b6 // Roxo (ou cor personalizada)
    };

    // Ícones para cada tipo
    const icons = {
        info: 'ℹ️',
        success: CUSTOM_EMOJIS.success || '<a:sucesso:1443149628085244036>',
        warning: '⚠️',
        error: CUSTOM_EMOJIS.error || '<a:erro:1443149642580758569>',
        custom: '✨'
    };

    const embed = new EmbedBuilder()
        .setColor(color || colors[type] || colors.custom)
        .setTimestamp();

    // Adiciona título formatado se existir (máximo 256 caracteres)
    const icon = icons[type] || icons.custom;

    if (title) {
        // Para emojis custom (<:nome:id>), evitar usar no título (não rende bem em alguns clientes)
        const isCustomEmoji = typeof icon === 'string' && (icon.startsWith('<:') || icon.startsWith('<a:'));
        const fullTitle = isCustomEmoji ? title : `${icon} ${title}`;
        embed.setTitle(truncateText(fullTitle, 256));
    }

    // Adiciona descrição se existir (máximo 4096 caracteres)
    // Discord requer que um embed tenha pelo menos título OU descrição
    if (description && description.trim() !== '') {
        let finalDescription = truncateText(description, 4096);

        // Para emojis custom, prefixar na descrição em vez do título
        if (icon && typeof icon === 'string' && (icon.startsWith('<:') || icon.startsWith('<a:'))) {
            finalDescription = `${icon} ${finalDescription}`;
        }

        embed.setDescription(finalDescription);
    } else {
        // Se não tem descrição, adicionar descrição padrão (zero-width space)
        // Isso garante que o embed sempre tenha uma descrição válida
        embed.setDescription('\u200b');
    }

    // Validar e adicionar campos se existirem
    const validatedFields = validateFields(fields);
    if (validatedFields.length > 0) {
        embed.addFields(validatedFields);
    }

    // Adiciona thumbnail se existir
    if (thumbnail) {
        embed.setThumbnail(thumbnail);
    }

    // Adiciona imagem se existir
    if (image) {
        embed.setImage(image);
    }

    // Adiciona footer se existir (máximo 2048 caracteres)
    if (footer) {
        if (typeof footer === 'string') {
            embed.setFooter({ text: truncateText(footer, 2048) });
        } else {
            const footerObj = { ...footer };
            if (footerObj.text) {
                footerObj.text = truncateText(footerObj.text, 2048);
            }
            embed.setFooter(footerObj);
        }
    }

    // Adiciona author se existir (máximo 256 caracteres para nome)
    if (author) {
        if (typeof author === 'string') {
            embed.setAuthor({ name: truncateText(author, 256) });
        } else {
            const authorObj = { ...author };
            if (authorObj.name) {
                authorObj.name = truncateText(authorObj.name, 256);
            }
            embed.setAuthor(authorObj);
        }
    }

    return {
        embeds: [embed],
        flags: ephemeral ? 64 : 0
    };
}

/**
 * Resposta de sucesso
 */
function success({ title = 'Sucesso!', description = '', fields = [], ephemeral = false, thumbnail, image, footer, author, color } = {}) {
    return createResponse({
        title,
        description,
        type: 'success',
        fields,
        ephemeral,
        thumbnail,
        image,
        footer,
        author,
        color
    });
}

/**
 * Resposta de informação
 */
function info({ title = 'Informação', description = '', fields = [], ephemeral = false, thumbnail, image, footer, author } = {}) {
    return createResponse({
        title,
        description,
        type: 'info',
        fields,
        ephemeral,
        thumbnail,
        image,
        footer,
        author
    });
}

/**
 * Resposta de aviso
 */
function warning({ title = 'Aviso', description = '', fields = [], ephemeral = true, thumbnail, image, footer, author } = {}) {
    return createResponse({
        title,
        description,
        type: 'warning',
        fields,
        ephemeral,
        thumbnail,
        image,
        footer,
        author
    });
}

/**
 * Resposta de erro
 */
function error({ title = 'Erro', description = 'Ocorreu um erro ao processar sua solicitação.', fields = [], ephemeral = true, thumbnail, image, footer, author } = {}) {
    return createResponse({
        title,
        description,
        type: 'error',
        fields,
        ephemeral,
        thumbnail,
        image,
        footer,
        author
    });
}

/**
 * Resposta personalizada
 */
function custom({ title = '', description = '', color, fields = [], ephemeral = false, thumbnail, image, footer, author } = {}) {
    return createResponse({
        title,
        description,
        type: 'custom',
        color,
        fields,
        ephemeral,
        thumbnail,
        image,
        footer,
        author
    });
}

export { createResponse, success, info, warning, error, custom };
