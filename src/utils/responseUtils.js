import { buildStandardCardV2 } from './embedBuilderV2.js';

export { validateFields, truncateText } from './messageTextUtils.js';

/**
 * Resposta padronizada em Components V2 (substitui embeds).
 * @param {Object} options - Opções do cartão
 * @returns {{ components: unknown[], flags: number }}
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
    return buildStandardCardV2({
        title,
        description,
        type,
        fields,
        color,
        ephemeral,
        thumbnail,
        image,
        footer,
        author
    });
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
